import { describe, expect, test, vi } from "vitest";
import { TrackSessionController } from "../../src/app/TrackSessionController";
import type { AudioAnalysisData } from "../../src/audio/types";
import type { LineLyrics, LyricsDocument, LyricsLoadState, SyllableLyrics, TrackIdentity } from "../../src/lyrics/types";
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

const staticLyrics = (): LyricsDocument => ({
	type: "static",
	lines: [{ text: "Static lyrics" }],
});

const ready = (currentTrack: TrackIdentity, lyrics: LyricsDocument): Extract<LyricsLoadState, { status: "ready" }> => ({
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
	const invalidate = vi.fn();
	const load = vi.fn(options.load ?? (async (currentTrack) => ready(currentTrack, lineLyrics())));
	const loadProfile = vi.fn(options.loadProfile ?? (async (currentTrack) => profile(currentTrack)));
	const getAnalysis = vi.fn(options.getAnalysis ?? (async () => undefined));
	const buildPseudoKaraoke = vi.fn(options.buildPseudoKaraoke ?? (() => syllableLyrics()));
	const controller = new TrackSessionController({ load, refreshCooldowns, invalidate }, { loadProfile, getAnalysis }, buildPseudoKaraoke);
	return { buildPseudoKaraoke, controller, getAnalysis, invalidate, load, loadProfile, refreshCooldowns };
};

describe("TrackSessionController", () => {
	test("invalidates the underlying lyrics pipeline together with the track generation", () => {
		const { controller, invalidate } = createController();

		controller.invalidate();

		expect(invalidate).toHaveBeenCalledOnce();
		expect(controller.getSnapshot().loadState).toEqual({ status: "idle" });
	});
	test.each([
		{ name: "static", lyrics: staticLyrics() },
		{ name: "line", lyrics: lineLyrics() },
		{ name: "syllable", lyrics: syllableLyrics() },
	])("returns native $name lyrics before a pending waveform profile", async ({ lyrics }) => {
		const currentTrack = track(`spotify:track:initial-${lyrics.type}`);
		const waveformResult = deferred<TrackWaveformProfile>();
		const { controller } = createController({
			load: async () => ready(currentTrack, lyrics),
			loadProfile: async () => waveformResult.promise,
		});

		const loading = controller.load(currentTrack, settings(), false);
		const outcome = await Promise.race([
			loading.then((snapshot) => ({ kind: "resolved" as const, snapshot })),
			new Promise<{ kind: "blocked" }>((resolve) => setTimeout(() => resolve({ kind: "blocked" }), 0)),
		]);
		const snapshotBeforeWaveform = controller.getSnapshot();
		waveformResult.resolve(profile(currentTrack));
		await loading;

		expect(outcome.kind).toBe("resolved");
		expect(snapshotBeforeWaveform.loadState).toMatchObject({ status: "ready", track: currentTrack });
		expect(snapshotBeforeWaveform.lyrics).toBe(lyrics);
		expect(snapshotBeforeWaveform.timingSource).toBe("native");
		expect(snapshotBeforeWaveform.waveformProfile).toBeUndefined();
	});

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
		const currentSnapshot = await currentLoad;
		if (!currentSnapshot) throw new Error("Expected the current track snapshot.");
		await controller.enrichmentFor(currentSnapshot);
		oldLyrics.resolve(ready(oldTrack, lineLyrics()));
		oldProfile.resolve(profile(oldTrack));

		expect(await staleLoad).toBeUndefined();
		expect(controller.getSnapshot().loadState).toMatchObject({ status: "ready", track: newTrack });
		expect(controller.getSnapshot().waveformProfile?.trackUri).toBe(newTrack.uri);
	});

	test("discards late enrichment that finishes after a newer load", async () => {
		const oldProfile = deferred<TrackWaveformProfile>();
		const oldTrack = track("spotify:track:old-profile");
		const newTrack = track("spotify:track:new-profile");
		const { controller } = createController({
			load: async (currentTrack) => ready(currentTrack, lineLyrics()),
			loadProfile: async (currentTrack) => (currentTrack === oldTrack ? oldProfile.promise : profile(newTrack)),
		});

		const oldSnapshot = await controller.load(oldTrack, settings({ pseudoKaraoke: false }), false);
		if (!oldSnapshot) throw new Error("Expected an initial track snapshot.");
		const staleEnrichment = controller.enrichmentFor(oldSnapshot);
		await controller.load(newTrack, settings({ pseudoKaraoke: false }), false);
		oldProfile.resolve(profile(oldTrack));

		expect(await staleEnrichment).toBeUndefined();
		expect(controller.getSnapshot().loadState).toMatchObject({ status: "ready", track: newTrack });
	});

	test("does not build or cache synthesis when analysis finishes after invalidation", async () => {
		const analysis = deferred<AudioAnalysisData | undefined>();
		const currentTrack = track("spotify:track:stale-analysis");
		const { buildPseudoKaraoke, controller } = createController({ getAnalysis: async () => analysis.promise });

		const initialSnapshot = await controller.load(currentTrack, settings(), false);
		if (!initialSnapshot) throw new Error("Expected an initial track snapshot.");
		const enrichment = controller.enrichmentFor(initialSnapshot);
		await Promise.resolve();
		controller.invalidate();
		analysis.resolve(undefined);

		expect(await enrichment).toBeUndefined();
		expect(buildPseudoKaraoke).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toEqual({ loadState: { status: "idle" }, timingSource: "native" });
	});

	test("refresh clears cooldowns and invalidates the URI pseudo cache before loading", async () => {
		const currentTrack = track("spotify:track:refresh");
		const source = lineLyrics();
		const { buildPseudoKaraoke, controller, load, refreshCooldowns } = createController({
			load: async () => ready(currentTrack, source),
		});
		const initialSnapshot = await controller.load(currentTrack, settings(), false);
		if (!initialSnapshot) throw new Error("Expected an initial track snapshot.");
		await controller.enrichmentFor(initialSnapshot);
		expect(buildPseudoKaraoke).toHaveBeenCalledTimes(1);

		const refreshedSnapshot = await controller.load(currentTrack, settings(), true);
		if (!refreshedSnapshot) throw new Error("Expected a refreshed track snapshot.");
		await controller.enrichmentFor(refreshedSnapshot);

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
		if (!nativeSnapshot) throw new Error("Expected a native track snapshot.");
		const enrichedNativeSnapshot = await controller.enrichmentFor(nativeSnapshot);
		const initialLineSnapshot = await controller.load(currentTrack, settings(), false);
		if (!initialLineSnapshot) throw new Error("Expected an initial line track snapshot.");
		const syntheticSnapshot = await controller.enrichmentFor(initialLineSnapshot);

		expect(enrichedNativeSnapshot).toMatchObject({ lyrics: native, timingSource: "native" });
		expect(initialLineSnapshot).toMatchObject({ lyrics: expect.objectContaining({ type: "line" }), timingSource: "native" });
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

		for (let index = 0; index < 3; index += 1) {
			const initialSnapshot = await controller.load(currentTrack, settings(), false);
			if (!initialSnapshot) throw new Error("Expected an initial track snapshot.");
			await controller.enrichmentFor(initialSnapshot);
		}

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

	test("does not let an older settings presentation overwrite a newer one after pseudo analysis", async () => {
		const currentTrack = track("spotify:track:settings-race");
		const analysisResult = deferred<AudioAnalysisData | undefined>();
		const synthetic = syllableLyrics(2);
		const { controller, buildPseudoKaraoke } = createController({
			load: async () => ready(currentTrack, lineLyrics()),
			getAnalysis: async () => analysisResult.promise,
			buildPseudoKaraoke: () => synthetic,
		});
		const initial = await controller.load(currentTrack, settings({ pseudoKaraoke: false }), false);
		if (!initial) throw new Error("Expected initial track snapshot.");
		await controller.enrichmentFor(initial);

		const older = controller.updateSettings(settings({ pseudoKaraoke: true, syncPreference: "prefer-syllable" }));
		const newer = controller.updateSettings(settings({ pseudoKaraoke: true, syncPreference: "line-only" }));
		const newerSnapshot = await newer;
		analysisResult.resolve(undefined);

		expect(await older).toBeUndefined();
		expect(buildPseudoKaraoke).not.toHaveBeenCalled();
		expect(newerSnapshot).toMatchObject({ lyrics: { type: "line" }, timingSource: "native" });
		expect(controller.getSnapshot()).toBe(newerSnapshot);
		expect(newerSnapshot && controller.isCurrent(newerSnapshot)).toBe(true);
	});

	test("preserves an enriched waveform when a settings presentation that captured no profile finishes later", async () => {
		const currentTrack = track("spotify:track:profile-first-race");
		const profileResult = deferred<TrackWaveformProfile>();
		const settingsAnalysis = deferred<AudioAnalysisData | undefined>();
		const enrichmentAnalysis = deferred<AudioAnalysisData | undefined>();
		const getAnalysis = vi
			.fn()
			.mockImplementationOnce(() => settingsAnalysis.promise)
			.mockImplementationOnce(() => enrichmentAnalysis.promise);
		const synthetic = syllableLyrics(3);
		const currentProfile = profile(currentTrack);
		const { controller } = createController({
			load: async () => ready(currentTrack, lineLyrics()),
			loadProfile: async () => profileResult.promise,
			getAnalysis,
			buildPseudoKaraoke: () => synthetic,
		});
		const initial = await controller.load(currentTrack, settings({ pseudoKaraoke: false }), false);
		if (!initial) throw new Error("Expected initial track snapshot.");
		const enrichment = controller.enrichmentFor(initial);
		if (!enrichment) throw new Error("Expected waveform enrichment.");

		const settingsPresentation = controller.updateSettings(settings({ pseudoKaraoke: true, syncPreference: "prefer-syllable" }));
		await vi.waitFor(() => expect(getAnalysis).toHaveBeenCalledTimes(1));
		profileResult.resolve(currentProfile);
		await vi.waitFor(() => expect(getAnalysis).toHaveBeenCalledTimes(2));
		enrichmentAnalysis.resolve(undefined);
		const enrichedSnapshot = await enrichment;
		expect(enrichedSnapshot?.waveformProfile).toBe(currentProfile);

		settingsAnalysis.resolve(undefined);
		const finalSnapshot = await settingsPresentation;

		expect(finalSnapshot?.lyrics).toBe(synthetic);
		expect(finalSnapshot?.waveformProfile).toBe(currentProfile);
		expect(controller.getSnapshot()).toBe(finalSnapshot);
		expect(finalSnapshot && controller.isCurrent(finalSnapshot)).toBe(true);
	});

	test("adds a later waveform without losing a settings presentation that finished first", async () => {
		const currentTrack = track("spotify:track:settings-first-race");
		const profileResult = deferred<TrackWaveformProfile>();
		const analysisResult = deferred<AudioAnalysisData | undefined>();
		const synthetic = syllableLyrics(4);
		const currentProfile = profile(currentTrack);
		const { controller } = createController({
			load: async () => ready(currentTrack, lineLyrics()),
			loadProfile: async () => profileResult.promise,
			getAnalysis: async () => analysisResult.promise,
			buildPseudoKaraoke: () => synthetic,
		});
		const initial = await controller.load(currentTrack, settings({ pseudoKaraoke: false }), false);
		if (!initial) throw new Error("Expected initial track snapshot.");
		const enrichment = controller.enrichmentFor(initial);
		if (!enrichment) throw new Error("Expected waveform enrichment.");

		const settingsPresentation = controller.updateSettings(settings({ pseudoKaraoke: true, syncPreference: "prefer-syllable" }));
		analysisResult.resolve(undefined);
		const settingsSnapshot = await settingsPresentation;
		expect(settingsSnapshot?.lyrics).toBe(synthetic);
		expect(settingsSnapshot?.waveformProfile).toBeUndefined();

		profileResult.resolve(currentProfile);
		const finalSnapshot = await enrichment;

		expect(finalSnapshot?.lyrics).toBe(synthetic);
		expect(finalSnapshot?.waveformProfile).toBe(currentProfile);
		expect(controller.getSnapshot()).toBe(finalSnapshot);
		expect(finalSnapshot && controller.isCurrent(finalSnapshot)).toBe(true);
	});

	test("never merges a late waveform profile from a previous track into the current track", async () => {
		const firstTrack = track("spotify:track:stale-profile");
		const secondTrack = track("spotify:track:current-without-profile");
		const firstProfileResult = deferred<TrackWaveformProfile>();
		const secondProfileResult = deferred<TrackWaveformProfile>();
		const firstProfile = profile(firstTrack);
		const { controller } = createController({
			load: async (requestedTrack) => ready(requestedTrack, lineLyrics()),
			loadProfile: async (requestedTrack) => (requestedTrack.uri === firstTrack.uri ? firstProfileResult.promise : secondProfileResult.promise),
		});
		const first = await controller.load(firstTrack, settings({ pseudoKaraoke: false }), false);
		if (!first) throw new Error("Expected first track snapshot.");
		const staleEnrichment = controller.enrichmentFor(first);
		if (!staleEnrichment) throw new Error("Expected first track enrichment.");
		const second = await controller.load(secondTrack, settings({ pseudoKaraoke: false }), false);
		if (!second) throw new Error("Expected second track snapshot.");

		firstProfileResult.resolve(firstProfile);
		expect(await staleEnrichment).toBeUndefined();
		const current = await controller.updateSettings(settings({ pseudoKaraoke: false, syncPreference: "line-only" }));

		expect(current?.loadState).toMatchObject({ status: "ready", track: secondTrack });
		expect(current?.waveformProfile).toBeUndefined();
		expect(current?.waveformProfile).not.toBe(firstProfile);
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

	test("reports whether a returned snapshot is still current", async () => {
		const currentTrack = track("spotify:track:revision");
		const { controller } = createController();
		const snapshot = await controller.load(currentTrack, settings({ pseudoKaraoke: false }), false);
		if (!snapshot) throw new Error("Expected a track session snapshot.");

		expect(controller.isCurrent(snapshot)).toBe(true);

		controller.invalidate();

		expect(controller.isCurrent(snapshot)).toBe(false);
	});
});
