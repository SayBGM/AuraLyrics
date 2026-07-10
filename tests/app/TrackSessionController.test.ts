import { describe, expect, test, vi } from "vitest";
import { TrackSessionController } from "../../src/app/TrackSessionController";
import type { AudioAnalysisData } from "../../src/audio/types";
import type { LineLyrics, LyricsLoadState, SyllableLyrics, TrackIdentity } from "../../src/lyrics/types";
import type { TrackWaveformProfile } from "../../src/renderer/AudioAnalysisWaveformService";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../src/settings/settingsSchema";

const track = (uri: string): TrackIdentity => ({
	uri,
	title: `Track ${uri}`,
	artist: "Aura",
	album: "Sessions",
	durationMs: 180_000,
	isLocal: false,
});

const lineLyrics = (startTime = 0): LineLyrics => ({
	type: "line",
	startTime,
	endTime: startTime + 4,
	content: [
		{
			type: "vocal",
			text: "별빛이 내린 밤에",
			startTime,
			endTime: startTime + 4,
			oppositeAligned: false,
		},
	],
});

const syllableLyrics = (startTime = 0): SyllableLyrics => ({
	type: "syllable",
	startTime,
	endTime: startTime + 4,
	content: [],
});

const ready = (currentTrack: TrackIdentity, lyrics: LineLyrics | SyllableLyrics): Extract<LyricsLoadState, { status: "ready" }> => ({
	status: "ready",
	track: currentTrack,
	lyrics,
	provider: "lrclib",
	source: "network",
	diagnostics: { cache: { status: "miss" }, attempts: [] },
});

const profile = (currentTrack: TrackIdentity): TrackWaveformProfile => ({
	trackUri: currentTrack.uri,
	seed: 1,
	segments: [],
	source: "seeded",
});

const settings = (patch: Partial<ExtensionSettings> = {}): ExtensionSettings => ({
	...DEFAULT_SETTINGS,
	...patch,
	providers: DEFAULT_SETTINGS.providers,
});

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

const createController = (
	options: {
		load?: (currentTrack: TrackIdentity, currentSettings: ExtensionSettings, refresh: boolean) => Promise<LyricsLoadState>;
		loadProfile?: (currentTrack: TrackIdentity) => Promise<TrackWaveformProfile>;
		getAnalysis?: (currentTrack: TrackIdentity) => Promise<AudioAnalysisData | undefined>;
		buildPseudoKaraoke?: (lyrics: LineLyrics, analysis: AudioAnalysisData | undefined, durationMs: number) => SyllableLyrics | null;
	} = {}
) => {
	const refreshCooldowns = vi.fn();
	const load = vi.fn(options.load ?? (async (currentTrack) => ready(currentTrack, lineLyrics())));
	const loadProfile = vi.fn(options.loadProfile ?? (async (currentTrack) => profile(currentTrack)));
	const getAnalysis = vi.fn(options.getAnalysis ?? (async () => undefined));
	const buildPseudoKaraoke = vi.fn(options.buildPseudoKaraoke ?? (() => syllableLyrics()));
	const controller = new TrackSessionController({ load, refreshCooldowns }, { loadProfile, getAnalysis }, buildPseudoKaraoke);
	return { buildPseudoKaraoke, controller, getAnalysis, load, loadProfile, refreshCooldowns };
};

describe("TrackSessionController", () => {
	test("starts waveform profile loading before lyrics finish", async () => {
		const lyricsResult = deferred<LyricsLoadState>();
		const currentTrack = track("spotify:track:parallel");
		const { controller, loadProfile } = createController({ load: async () => lyricsResult.promise });

		const loading = controller.load(currentTrack, settings({ pseudoKaraoke: false }), false);

		expect(loadProfile).toHaveBeenCalledWith(currentTrack);
		expect(controller.getSnapshot().loadState).toEqual({ status: "loading", track: currentTrack });

		lyricsResult.resolve(ready(currentTrack, lineLyrics()));
		await loading;
	});

	test("discards lyrics and waveform results from an invalidated load", async () => {
		const oldLyrics = deferred<LyricsLoadState>();
		const oldProfile = deferred<TrackWaveformProfile>();
		const oldTrack = track("spotify:track:old");
		const newTrack = track("spotify:track:new");
		const { controller } = createController({
			load: async (currentTrack) => (currentTrack === oldTrack ? oldLyrics.promise : ready(newTrack, lineLyrics(10))),
			loadProfile: async (currentTrack) => (currentTrack === oldTrack ? oldProfile.promise : profile(newTrack)),
		});

		const staleLoad = controller.load(oldTrack, settings({ pseudoKaraoke: false }), false);
		const currentLoad = controller.load(newTrack, settings({ pseudoKaraoke: false }), false);
		await currentLoad;
		oldLyrics.resolve(ready(oldTrack, lineLyrics()));
		oldProfile.resolve(profile(oldTrack));

		expect(await staleLoad).toBeUndefined();
		expect(controller.getSnapshot().loadState).toMatchObject({ status: "ready", track: newTrack });
		expect(controller.getSnapshot().waveformProfile?.trackUri).toBe(newTrack.uri);
	});

	test("discards a waveform profile that finishes after a newer load", async () => {
		const oldProfile = deferred<TrackWaveformProfile>();
		const oldTrack = track("spotify:track:old-profile");
		const newTrack = track("spotify:track:new-profile");
		const { controller } = createController({
			load: async (currentTrack) => ready(currentTrack, lineLyrics()),
			loadProfile: async (currentTrack) => (currentTrack === oldTrack ? oldProfile.promise : profile(newTrack)),
		});

		const staleLoad = controller.load(oldTrack, settings({ pseudoKaraoke: false }), false);
		await Promise.resolve();
		await controller.load(newTrack, settings({ pseudoKaraoke: false }), false);
		oldProfile.resolve(profile(oldTrack));

		expect(await staleLoad).toBeUndefined();
		expect(controller.getSnapshot().waveformProfile?.trackUri).toBe(newTrack.uri);
	});

	test("does not build or cache synthesis when analysis finishes after invalidation", async () => {
		const analysis = deferred<AudioAnalysisData | undefined>();
		const currentTrack = track("spotify:track:stale-analysis");
		const { buildPseudoKaraoke, controller } = createController({ getAnalysis: async () => analysis.promise });

		const loading = controller.load(currentTrack, settings(), false);
		await Promise.resolve();
		await Promise.resolve();
		controller.invalidate();
		analysis.resolve(undefined);

		expect(await loading).toBeUndefined();
		expect(buildPseudoKaraoke).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toEqual({ loadState: { status: "idle" }, timingSource: "native" });
	});

	test("refresh clears cooldowns and invalidates the URI pseudo cache before loading", async () => {
		const currentTrack = track("spotify:track:refresh");
		const source = lineLyrics();
		const { buildPseudoKaraoke, controller, load, refreshCooldowns } = createController({
			load: async () => ready(currentTrack, source),
		});
		await controller.load(currentTrack, settings(), false);
		expect(buildPseudoKaraoke).toHaveBeenCalledTimes(1);

		await controller.load(currentTrack, settings(), true);

		expect(refreshCooldowns).toHaveBeenCalledOnce();
		expect(refreshCooldowns.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder.at(-1) ?? 0);
		expect(buildPseudoKaraoke).toHaveBeenCalledTimes(2);
	});

	test("selects native syllable lyrics and synthesized line lyrics with the matching timing source", async () => {
		const currentTrack = track("spotify:track:selection");
		const native = syllableLyrics(1);
		const synthetic = syllableLyrics(2);
		const { controller, load } = createController({ buildPseudoKaraoke: () => synthetic });
		load.mockResolvedValueOnce(ready(currentTrack, native)).mockResolvedValueOnce(ready(currentTrack, lineLyrics()));

		const nativeSnapshot = await controller.load(currentTrack, settings(), false);
		const syntheticSnapshot = await controller.load(currentTrack, settings(), false);

		expect(nativeSnapshot).toMatchObject({ lyrics: native, timingSource: "native" });
		expect(syntheticSnapshot).toMatchObject({ lyrics: synthetic, timingSource: "synthetic" });
	});

	test("memoizes synthesis by URI and exact LineLyrics source identity", async () => {
		const currentTrack = track("spotify:track:identity");
		const sourceA = lineLyrics(1);
		const sourceB = lineLyrics(2);
		const { buildPseudoKaraoke, controller, load } = createController();
		load
			.mockResolvedValueOnce(ready(currentTrack, sourceA))
			.mockResolvedValueOnce(ready(currentTrack, sourceA))
			.mockResolvedValueOnce(ready(currentTrack, sourceB));

		await controller.load(currentTrack, settings(), false);
		await controller.load(currentTrack, settings(), false);
		await controller.load(currentTrack, settings(), false);

		expect(buildPseudoKaraoke).toHaveBeenCalledTimes(2);
		expect(buildPseudoKaraoke.mock.calls[0]?.[0]).toBe(sourceA);
		expect(buildPseudoKaraoke.mock.calls[1]?.[0]).toBe(sourceB);
	});

	test("applies pseudo-karaoke and sync preference changes live", async () => {
		const currentTrack = track("spotify:track:settings");
		const source = lineLyrics();
		const synthetic = syllableLyrics();
		const { controller } = createController({
			load: async () => ready(currentTrack, source),
			buildPseudoKaraoke: () => synthetic,
		});
		await controller.load(currentTrack, settings({ pseudoKaraoke: false }), false);

		expect(controller.getSnapshot()).toMatchObject({ lyrics: source, timingSource: "native" });
		expect(await controller.updateSettings(settings({ pseudoKaraoke: true }))).toMatchObject({ lyrics: synthetic, timingSource: "synthetic" });
		expect(await controller.updateSettings(settings({ pseudoKaraoke: true, syncPreference: "line-only" }))).toMatchObject({
			lyrics: source,
			timingSource: "native",
		});
		expect(await controller.updateSettings(settings({ pseudoKaraoke: true, syncPreference: "prefer-syllable" }))).toMatchObject({
			lyrics: synthetic,
			timingSource: "synthetic",
		});
	});

	test("never exposes a waveform profile for a non-ready load state", async () => {
		const currentTrack = track("spotify:track:empty");
		const { controller } = createController({
			load: async () => ({ status: "empty", track: currentTrack, reason: "no-lyrics" }),
		});

		const snapshot = await controller.load(currentTrack, settings(), false);

		expect(snapshot).toEqual({ loadState: { status: "empty", track: currentTrack, reason: "no-lyrics" }, timingSource: "native" });
		expect(controller.getSnapshot().waveformProfile).toBeUndefined();
	});
});
