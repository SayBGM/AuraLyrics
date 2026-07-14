import { describe, expect, test, vi } from "vitest";
import { ExtensionApp } from "../../src/app/ExtensionApp";
import type { IntroPresentationGate } from "../../src/app/IntroPresentationGate";
import type { OutroPresentationController } from "../../src/app/OutroPresentationController";
import { type ReadyTrackSessionSnapshot, TrackSessionController, type TrackSessionSnapshot } from "../../src/app/TrackSessionController";
import { buildTrackTheme, type TrackTheme } from "../../src/app/TrackThemeService";
import type { LineLyrics, LyricsDocument, LyricsLoadState, SyllableLyrics, TrackIdentity } from "../../src/lyrics/types";
import type { PlaybackSynchronizer } from "../../src/player/PlaybackSynchronizer";
import type { TrackWaveformProfile } from "../../src/renderer/AudioAnalysisWaveformService";
import type { SpicetifyGlobal } from "../../src/runtime/spicetify";
import type { ExtensionSettings } from "../../src/settings/settingsSchema";
import { buildVocalAnalysis } from "../lyrics/pseudoKaraoke/fixtures";

const createSpicetify = () => {
	const values = new Map<string, string>();
	const topbarButtons: Array<{ element: HTMLElement; active?: boolean; deregister?: () => void }> = [];
	const showNotification = vi.fn();
	const spicetify = {
		Player: {
			getProgress: () => 0,
			getDuration: () => 0,
			isPlaying: () => true,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		},
		LocalStorage: {
			get: (key: string) => values.get(key) ?? null,
			set: (key: string, value: string) => {
				values.set(key, value);
			},
		},
		Topbar: {
			Button: vi.fn((_label: string, _icon: string, _onClick: () => void) => {
				const button = { element: document.createElement("button"), deregister: vi.fn() };
				topbarButtons.push(button);
				return button;
			}),
		},
		showNotification,
	} as unknown as SpicetifyGlobal;
	return { showNotification, spicetify, topbarButtons };
};

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

const readySnapshot = (): ReadyTrackSessionSnapshot => ({
	loadState: {
		status: "ready",
		track: {
			uri: "spotify:track:continuation",
			title: "Continuation",
			artist: "Aura",
			album: "Races",
			durationMs: 180_000,
			isLocal: false,
		},
		lyrics: { type: "line", startTime: 0, endTime: 4, content: [] },
		provider: "lrclib",
		source: "network",
		diagnostics: { cache: { status: "miss" }, attempts: [] },
	},
	lyrics: { type: "line", startTime: 0, endTime: 4, content: [] },
	timingSource: "native",
});

const metadataTrack = (uri = "spotify:track:metadata", overrides: Partial<TrackIdentity> = {}): TrackIdentity => ({
	uri,
	title: "Aurora Signal",
	artist: "Aura",
	album: "Night Edition",
	durationMs: 180_000,
	coverUrl: "https://example.com/aurora.jpg",
	isLocal: false,
	...overrides,
});

const readyLoadState = (track: TrackIdentity, source: "cache" | "network" = "network"): LyricsLoadState => ({
	status: "ready",
	track,
	lyrics: {
		type: "line",
		startTime: 0,
		endTime: 4,
		content: [{ type: "vocal", text: "Ready", startTime: 0, endTime: 4, oppositeAligned: false }],
	},
	provider: "lrclib",
	source,
	diagnostics: { cache: source === "cache" ? { status: "hit", provider: "lrclib" } : { status: "miss" }, attempts: [] },
});

const readyLoadStateAt = (track: TrackIdentity, firstVocalStartSec: number): LyricsLoadState => ({
	status: "ready",
	track,
	lyrics: {
		type: "line",
		startTime: 0,
		endTime: firstVocalStartSec + 4,
		content: [
			{ type: "interlude", startTime: 0, endTime: firstVocalStartSec, generated: true },
			{
				type: "vocal",
				text: "First vocal",
				startTime: firstVocalStartSec,
				endTime: firstVocalStartSec + 4,
				oppositeAligned: false,
			},
		],
	},
	provider: "lrclib",
	source: "network",
	diagnostics: { cache: { status: "miss" }, attempts: [] },
});

const readySnapshotAt = (track: TrackIdentity, firstVocalStartSec: number): ReadyTrackSessionSnapshot => {
	const loadState = readyLoadStateAt(track, firstVocalStartSec);
	if (loadState.status !== "ready") throw new Error("Expected ready load state.");
	return { loadState, lyrics: loadState.lyrics, timingSource: "native" };
};

const readySnapshotWithLyrics = (
	track: TrackIdentity,
	lyrics: LyricsDocument,
	source: "cache" | "network" = "network"
): ReadyTrackSessionSnapshot => ({
	loadState: {
		status: "ready" as const,
		track,
		lyrics,
		provider: "lrclib",
		source,
		diagnostics: { cache: { status: "miss" as const }, attempts: [] },
	},
	lyrics,
	timingSource: "native" as const,
});

const outroSnapshot = (track: TrackIdentity, lastVocalEndSec = 8, source: "cache" | "network" = "network"): ReadyTrackSessionSnapshot => {
	const lyrics: LineLyrics = {
		type: "line",
		startTime: 0,
		endTime: lastVocalEndSec,
		content: [
			{
				type: "vocal",
				text: `Last vocal ${lastVocalEndSec}`,
				startTime: Math.max(0, lastVocalEndSec - 4),
				endTime: lastVocalEndSec,
				oppositeAligned: false,
			},
		],
	};
	return readySnapshotWithLyrics(track, lyrics, source);
};

const readySyllableSnapshot = (track: TrackIdentity, leadStartSec: number, backgroundStartSec = leadStartSec): ReadyTrackSessionSnapshot => {
	const lyrics: SyllableLyrics = {
		type: "syllable",
		startTime: 0,
		endTime: leadStartSec + 4,
		content: [
			{
				type: "vocal",
				oppositeAligned: false,
				lead: {
					startTime: leadStartSec,
					endTime: leadStartSec + 2,
					syllables: [{ text: "Lead", startTime: leadStartSec, endTime: leadStartSec + 2, isPartOfWord: false }],
				},
				background: [
					{
						startTime: backgroundStartSec,
						endTime: backgroundStartSec + 2,
						syllables: [{ text: "Echo", startTime: backgroundStartSec, endTime: backgroundStartSec + 2, isPartOfWord: false }],
					},
				],
			},
		],
	};
	return {
		loadState: {
			status: "ready",
			track,
			lyrics,
			provider: "lrclib",
			source: "network",
			diagnostics: { cache: { status: "miss" }, attempts: [] },
		},
		lyrics,
		timingSource: "native",
	};
};

const introGateOf = (app: ExtensionApp): IntroPresentationGate => (app as unknown as { introGate: IntroPresentationGate }).introGate;

const outroControllerOf = (app: ExtensionApp): OutroPresentationController =>
	(app as unknown as { outroController: OutroPresentationController }).outroController;

const internalsSettingsOf = (app: ExtensionApp): ExtensionSettings =>
	(app as unknown as { settings: { get: () => ExtensionSettings } }).settings.get();

const beginIntroEpoch = (app: ExtensionApp): void => {
	introGateOf(app).beginTrackEpoch();
};

const expectSyntheticTimingScene = (root: HTMLElement, expectedLabel = "Synthesized karaoke sync"): void => {
	const scene = root.querySelector<HTMLElement>(".aura-lyrics.synthetic-timing");
	const descriptionId = scene?.getAttribute("aria-describedby");
	const description = descriptionId ? root.querySelector<HTMLElement>(`#${descriptionId}`) : null;

	expect(scene?.dataset.timingSource).toBe("synthetic");
	expect(description?.matches("[data-aura-synthetic-description].aura-visually-hidden")).toBe(true);
	expect(description?.textContent).toBe(expectedLabel);
	expect(scene?.getAttribute("aria-describedby")).toBe(description?.id);
	expect(root.querySelector(".aura-timing-marker")).toBeNull();
};

describe("ExtensionApp", () => {
	test("reveals intro-ready lyrics immediately when the first vocal is within 1.5 seconds", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = vi.fn(() => 0);
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:fast-intro");
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			renderer: { update: (timestampSec: number, deltaTime: number) => void };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = {
			load: vi.fn(async () => readyLoadStateAt(track, 1.5)),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};
		internals.introGate.beginTrackEpoch();
		const accept = vi.spyOn(internals.introGate, "accept");
		const update = vi.spyOn(internals.renderer, "update");

		await internals.loadCurrentTrack(false);

		expect(root.querySelector(".lyrics-track")).not.toBeNull();
		expect(root.querySelector(".track-metadata-scene")).toBeNull();
		expect(accept.mock.calls[0]?.[2]).toBe(0);
		expect(update).toHaveBeenCalledWith(0, 0);
		expect(accept.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0] ?? 0);
	});

	test("holds intro-ready lyrics behind plain track metadata when the first vocal is 8 seconds away", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = vi.fn(() => 0);
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:long-intro");
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState> };
			introGate: { beginTrackEpoch: () => void };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load: vi.fn(async () => readyLoadStateAt(track, 8)) };
		internals.introGate.beginTrackEpoch();

		await internals.loadCurrentTrack(false);

		expect(root.querySelector(".track-metadata-scene.intro")).not.toBeNull();
		expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
		expect(root.querySelector(".track-metadata-progress")).toBeNull();
		expect(root.querySelector(".lyrics-track")).toBeNull();
	});

	test("shows track metadata while lyrics are unresolved and replaces it immediately when ready", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack();
		const result = deferred<LyricsLoadState>();
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState> };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load: vi.fn(() => result.promise) };
		beginIntroEpoch(app);

		const loading = internals.loadCurrentTrack(false);

		expect(root.querySelector(".track-metadata-eyebrow")?.textContent).toBe("LOADING");
		expect(root.querySelector(".track-metadata-title")?.textContent).toBe(track.title);
		expect(root.querySelector(".track-metadata-progress")).not.toBeNull();

		result.resolve(readyLoadState(track));
		await loading;

		expect(root.querySelector(".lyrics-track")?.textContent).toContain("Ready");
		expect(root.querySelector(".track-metadata-scene")).toBeNull();
	});

	test("does not leave a metadata overlay after a same-turn cache hit", async () => {
		const { spicetify } = createSpicetify();
		const audioAnalysis = deferred<ReturnType<typeof buildVocalAnalysis>>();
		spicetify.getAudioData = vi.fn(() => audioAnalysis.promise);
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:cached");
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState> };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load: vi.fn(async () => readyLoadState(track, "cache")) };
		beginIntroEpoch(app);

		const loading = internals.loadCurrentTrack(false);
		const outcome = await Promise.race([
			loading.then(() => "resolved" as const),
			new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 0)),
		]);
		const lyricsWereVisibleBeforeAnalysis = root.querySelector(".lyrics-track")?.textContent?.includes("Ready") ?? false;
		audioAnalysis.resolve(buildVocalAnalysis(0, 4));
		await loading;

		expect(outcome).toBe("resolved");
		expect(lyricsWereVisibleBeforeAnalysis).toBe(true);
		expect(root.querySelector(".lyrics-track")?.textContent).toContain("Ready");
		expect(root.querySelector(".track-metadata-scene")).toBeNull();
		await vi.waitFor(() => expectSyntheticTimingScene(root));
	});

	test("keeps the initial lyrics DOM when late enrichment has no renderable changes", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:unchanged-enrichment");
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState> };
			trackSession: { getSnapshot: () => TrackSessionSnapshot };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = {
			load: vi.fn(
				async (): Promise<LyricsLoadState> => ({
					status: "ready",
					track,
					lyrics: { type: "static", lines: [{ text: "Unchanged" }] },
					provider: "lrclib",
					source: "network",
					diagnostics: { cache: { status: "miss" }, attempts: [] },
				})
			),
		};
		beginIntroEpoch(app);

		await internals.loadCurrentTrack(false);
		const initialLyricsScene = root.firstElementChild;
		await vi.waitFor(() => expect(internals.trackSession.getSnapshot().waveformProfile).toBeDefined(), { timeout: 2_500 });

		expect(root.textContent).toContain("Unchanged");
		expect(root.firstElementChild).toBe(initialLyricsScene);
	});

	test("reveals the latest enriched snapshot at the synchronized timestamp when its first vocal moves into the past", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:enriched-intro");
		const initial = readySnapshotAt(track, 10);
		const enriched = {
			...readySnapshotAt(track, 4),
			waveformProfile: { trackUri: track.uri, seed: 7, segments: [], source: "seeded" as const },
		};
		const session = { root: document.createElement("main") };
		const events: unknown[][] = [];
		const internals = app as unknown as {
			session: typeof session;
			currentTrack: TrackIdentity;
			trackSession: { isCurrent: (snapshot: TrackSessionSnapshot) => boolean; invalidate: () => void };
			introGate: IntroPresentationGate;
			playbackSynchronizer: { timestampSec: number };
			renderer: {
				destroy: () => void;
				showTrackMetadata: () => void;
				update: (timestampSec: number, deltaTimeSec: number) => void;
			};
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			renderEnrichment: (
				enrichment: Promise<ReadyTrackSessionSnapshot | undefined>,
				initialSnapshot: ReadyTrackSessionSnapshot,
				track: TrackIdentity,
				activeSession: typeof session
			) => Promise<void>;
		};
		internals.session = session;
		internals.currentTrack = track;
		internals.trackSession = { isCurrent: (snapshot) => snapshot === enriched, invalidate: vi.fn() };
		internals.playbackSynchronizer = { timestampSec: 5 };
		internals.renderer = {
			destroy: vi.fn(),
			showTrackMetadata: vi.fn(),
			update: (timestamp, deltaTime) => events.push(["update", timestamp, deltaTime]),
		};
		internals.mountReadySnapshot = (snapshot) => events.push(["mount", snapshot]);
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(initial, internalsSettingsOf(app), 5).kind).toBe("hold");

		await internals.renderEnrichment(Promise.resolve(enriched), initial, track, session);

		expect(events).toEqual([
			["mount", enriched],
			["update", 5, 0],
		]);
		app.destroy();
	});

	test.each([
		{ name: "provider error", finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "error", track, message: "offline" }) },
		{ name: "instrumental", finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "instrumental" }) },
	])("discards held ready lyrics after a final $name refresh result", async ({ name, finalState }) => {
		const { spicetify } = createSpicetify();
		let progressMs = 0;
		spicetify.Player.getProgress = () => progressMs;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack(`spotify:track:held-final-${name}`);
		const load = vi.fn().mockResolvedValueOnce(readyLoadStateAt(track, 20)).mockResolvedValueOnce(finalState(track));
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				setPlaying: (isPlaying: boolean) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			currentTrack: TrackIdentity;
			lyricsService: { load: typeof load; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
			tick: (deltaTimeSec: number) => void;
			onPlaybackChanged: (isPlaying: boolean) => void;
		};
		internals.session = { root, setCover: vi.fn(), setPlaying: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load, refreshCooldowns: vi.fn(), invalidate: vi.fn() };
		internals.introGate.beginTrackEpoch();
		internals.isPlaybackActive = true;
		await internals.loadCurrentTrack(false);
		expect(internals.introGate.isHolding()).toBe(true);
		await internals.loadCurrentTrack(true);
		expect(root.querySelector(".lyrics-track")).toBeNull();

		progressMs = 20_000;
		internals.tick(0.25);
		internals.onPlaybackChanged(false);
		internals.onPlaybackChanged(true);

		expect(root.querySelector(".lyrics-track")).toBeNull();
		expect(internals.introGate.isHolding()).toBe(false);
		app.destroy();
	});

	test("reveals the latest enriched snapshot when its first vocal moves within two seconds", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:enriched-threshold");
		const initial = readySnapshotAt(track, 10);
		const enriched = readySnapshotAt(track, 7);
		const session = { root: document.createElement("main") };
		const events: unknown[][] = [];
		const internals = app as unknown as {
			session: typeof session;
			currentTrack: TrackIdentity;
			trackSession: { isCurrent: (snapshot: TrackSessionSnapshot) => boolean; invalidate: () => void };
			introGate: IntroPresentationGate;
			playbackSynchronizer: { timestampSec: number };
			renderer: {
				destroy: () => void;
				showTrackMetadata: () => void;
				update: (timestampSec: number, deltaTimeSec: number) => void;
			};
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			renderEnrichment: (
				enrichment: Promise<ReadyTrackSessionSnapshot | undefined>,
				initialSnapshot: ReadyTrackSessionSnapshot,
				track: TrackIdentity,
				activeSession: typeof session
			) => Promise<void>;
		};
		internals.session = session;
		internals.currentTrack = track;
		internals.trackSession = { isCurrent: (snapshot) => snapshot === enriched, invalidate: vi.fn() };
		internals.playbackSynchronizer = { timestampSec: 5 };
		internals.renderer = {
			destroy: vi.fn(),
			showTrackMetadata: vi.fn(),
			update: (timestamp, deltaTime) => events.push(["update", timestamp, deltaTime]),
		};
		internals.mountReadySnapshot = (snapshot) => events.push(["mount", snapshot]);
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(initial, internalsSettingsOf(app), 5).kind).toBe("hold");

		await internals.renderEnrichment(Promise.resolve(enriched), initial, track, session);

		expect(events).toEqual([
			["mount", enriched],
			["update", 5, 0],
		]);
		app.destroy();
	});

	test("extends a held intro to the latest enriched first-vocal deadline", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:enriched-later");
		const initial = readySnapshotAt(track, 10);
		const enriched = readySnapshotAt(track, 15);
		const session = { root: document.createElement("main") };
		const events: unknown[][] = [];
		let timestampSec = 5;
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			update: (deltaTimeSec: number) => {
				timestampSec += deltaTimeSec;
			},
		};
		const internals = app as unknown as {
			session: typeof session;
			currentTrack: TrackIdentity;
			trackSession: {
				isCurrent: (snapshot: TrackSessionSnapshot) => boolean;
				getSnapshot: () => TrackSessionSnapshot;
				invalidate: () => void;
			};
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			playbackSynchronizer: typeof synchronizer;
			renderer: {
				destroy: () => void;
				showTrackMetadata: () => void;
				update: (timestampSec: number, deltaTimeSec: number) => void;
			};
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			renderEnrichment: (
				enrichment: Promise<ReadyTrackSessionSnapshot | undefined>,
				initialSnapshot: ReadyTrackSessionSnapshot,
				track: TrackIdentity,
				activeSession: typeof session
			) => Promise<void>;
			tick: (deltaTimeSec: number) => void;
		};
		internals.session = session;
		internals.currentTrack = track;
		internals.trackSession = {
			isCurrent: (snapshot) => snapshot === enriched,
			getSnapshot: () => enriched,
			invalidate: vi.fn(),
		};
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = {
			destroy: vi.fn(),
			showTrackMetadata: vi.fn(),
			update: (timestamp, deltaTime) => events.push(["update", timestamp, deltaTime]),
		};
		internals.mountReadySnapshot = (snapshot) => events.push(["mount", snapshot]);
		internals.isPlaybackActive = true;
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(initial, internalsSettingsOf(app), 5).kind).toBe("hold");

		await internals.renderEnrichment(Promise.resolve(enriched), initial, track, session);
		expect(events).toEqual([]);
		internals.tick(5);
		expect(events.some(([event]) => event === "mount")).toBe(false);
		events.length = 0;
		internals.tick(5);

		expect(events).toEqual([
			["mount", enriched],
			["update", 15, 0],
		]);
		app.destroy();
	});

	test("does not let an older enrichment replace a different track", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const oldTrack = metadataTrack("spotify:track:old-enrichment");
		const newTrack = metadataTrack("spotify:track:new-enrichment");
		const initial = readySnapshotAt(oldTrack, 10);
		const enriched = readySnapshotAt(oldTrack, 4);
		const enrichment = deferred<ReadyTrackSessionSnapshot | undefined>();
		const session = { root: document.createElement("main") };
		const mount = vi.fn();
		const internals = app as unknown as {
			session: typeof session;
			currentTrack: TrackIdentity;
			trackSession: { isCurrent: () => boolean; invalidate: () => void };
			renderer: { destroy: () => void; update: () => void };
			mountReadySnapshot: typeof mount;
			renderEnrichment: (
				enrichment: Promise<ReadyTrackSessionSnapshot | undefined>,
				initialSnapshot: ReadyTrackSessionSnapshot,
				track: TrackIdentity,
				activeSession: typeof session
			) => Promise<void>;
		};
		internals.session = session;
		internals.currentTrack = oldTrack;
		internals.trackSession = { isCurrent: () => true, invalidate: vi.fn() };
		internals.renderer = { destroy: vi.fn(), update: vi.fn() };
		internals.mountReadySnapshot = mount;

		const rendering = internals.renderEnrichment(enrichment.promise, initial, oldTrack, session);
		internals.currentTrack = newTrack;
		enrichment.resolve(enriched);
		await rendering;

		expect(mount).not.toHaveBeenCalled();
		app.destroy();
	});

	test.each([
		{
			name: "provider error",
			track: metadataTrack("spotify:track:error"),
			state: (track: TrackIdentity): LyricsLoadState => ({ status: "error", track, message: "offline" }),
		},
		{
			name: "missing lyrics",
			track: metadataTrack("spotify:track:empty"),
			state: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "no-lyrics" }),
		},
		{
			name: "unsupported local track",
			track: metadataTrack("spotify:local:aura:night:signal:180", { isLocal: true }),
			state: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "unsupported-local" }),
		},
	])("keeps plain track metadata for $name", async ({ track, state }) => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState> };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load: vi.fn(async () => state(track)) };
		const acceptIntro = vi.spyOn(introGateOf(app), "accept");

		await internals.loadCurrentTrack(false);

		expect(root.querySelector(".track-metadata-title")?.textContent).toBe(track.title);
		expect(root.querySelector(".track-metadata-byline")?.textContent).toBe(`${track.artist} · ${track.album}`);
		expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
		expect(root.querySelector(".track-metadata-progress")).toBeNull();
		expect(root.querySelector(".status-card")).toBeNull();
		expect(root.querySelector("button")).toBeNull();
		expect(acceptIntro).not.toHaveBeenCalled();
	});

	test("ignores an older track result after a newer loading scene has replaced it", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const firstTrack = metadataTrack("spotify:track:first", { title: "First Track" });
		const secondTrack = metadataTrack("spotify:track:second", { title: "Second Track" });
		const firstResult = deferred<LyricsLoadState>();
		const secondResult = deferred<LyricsLoadState>();
		const root = document.createElement("main");
		const load = vi.fn().mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState> };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.lyricsService = { load };
		internals.currentTrack = firstTrack;
		const firstLoad = internals.loadCurrentTrack(false);
		internals.currentTrack = secondTrack;
		const secondLoad = internals.loadCurrentTrack(false);

		firstResult.resolve(readyLoadState(firstTrack));
		await firstLoad;

		expect(root.querySelector(".track-metadata-title")?.textContent).toBe("Second Track");
		expect(root.querySelector(".lyrics-track")).toBeNull();

		secondResult.resolve({ status: "empty", track: secondTrack, reason: "no-lyrics" });
		await secondLoad;

		expect(root.querySelector(".track-metadata-title")?.textContent).toBe("Second Track");
		expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
	});

	test("does not render a load snapshot resolved immediately before destroy", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const snapshotResult = deferred<TrackSessionSnapshot | undefined>();
		const snapshot = readySnapshot();
		let current = true;
		const mount = vi.fn();
		const trackSession = {
			load: vi.fn(() => snapshotResult.promise),
			isCurrent: vi.fn(() => current),
			invalidate: vi.fn(() => {
				current = false;
			}),
		};
		const internals = app as unknown as {
			session?: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			currentTrack: ReadyTrackSessionSnapshot["loadState"]["track"];
			trackSession: typeof trackSession;
			renderer: { showTrackMetadata: () => void; mount: typeof mount; destroy: () => void };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			applyTheme: vi.fn(),
		};
		internals.currentTrack = snapshot.loadState.track;
		internals.trackSession = trackSession;
		internals.renderer = { showTrackMetadata: vi.fn(), mount, destroy: vi.fn() };

		const loading = internals.loadCurrentTrack(false);
		snapshotResult.resolve(snapshot);
		app.destroy();
		await loading;

		expect(trackSession.invalidate).toHaveBeenCalledOnce();
		expect(internals.session).toBeUndefined();
		expect(mount).not.toHaveBeenCalled();
	});

	test("does not render a settings snapshot invalidated before its await continuation", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const snapshotResult = deferred<TrackSessionSnapshot | undefined>();
		const snapshot = readySnapshot();
		let current = true;
		const mount = vi.fn();
		const trackSession = {
			getSnapshot: vi.fn(() => snapshot),
			updateSettings: vi.fn(() => snapshotResult.promise),
			isCurrent: vi.fn(() => current),
			invalidate: vi.fn(() => {
				current = false;
			}),
		};
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				applySettings: (settings: unknown) => void;
			};
			currentTrack: ReadyTrackSessionSnapshot["loadState"]["track"];
			settings: { update: (patch: unknown) => void };
			trackSession: typeof trackSession;
			renderer: { applySettings: () => void; mount: typeof mount };
			applySettings: () => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			applySettings: vi.fn(),
		};
		internals.currentTrack = snapshot.loadState.track;
		internals.trackSession = trackSession;
		internals.renderer = { applySettings: vi.fn(), mount };
		internals.settings.update({ showTranslation: false });

		const applying = internals.applySettings();
		expect(trackSession.updateSettings).toHaveBeenCalledOnce();
		snapshotResult.resolve(snapshot);
		trackSession.invalidate();
		await applying;

		expect(mount).not.toHaveBeenCalled();
	});

	test("applies visual settings live without asking the track session to rebuild lyrics", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const applySessionSettings = vi.fn();
		const applyRendererSettings = vi.fn();
		const updateSettings = vi.fn();
		const mount = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: typeof applySessionSettings };
			settings: { update: (patch: unknown) => void };
			trackSession: { updateSettings: typeof updateSettings };
			renderer: { applySettings: typeof applyRendererSettings; mount: typeof mount };
			applySettings: () => Promise<void>;
		};
		internals.session = { root: document.createElement("main"), applySettings: applySessionSettings };
		internals.trackSession = { updateSettings };
		internals.renderer = { applySettings: applyRendererSettings, mount };
		internals.settings.update({ fontScale: 1.25, alignmentMode: "left", reduceMotion: true });

		await internals.applySettings();

		expect(applySessionSettings).toHaveBeenCalledOnce();
		expect(applyRendererSettings).toHaveBeenCalledOnce();
		expect(updateSettings).not.toHaveBeenCalled();
		expect(mount).not.toHaveBeenCalled();
	});

	test("rebuilds ready lyrics for a structural setting change", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const snapshot = readySnapshot();
		const mount = vi.fn();
		const updateSettings = vi.fn(async () => snapshot);
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: () => void };
			currentTrack: ReadyTrackSessionSnapshot["loadState"]["track"];
			settings: { update: (patch: unknown) => void };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; updateSettings: typeof updateSettings; isCurrent: () => boolean };
			renderer: { applySettings: () => void; mount: typeof mount; update: (timestampSec: number, deltaTime: number) => void };
			applySettings: () => Promise<void>;
		};
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = snapshot.loadState.track;
		internals.trackSession = { getSnapshot: () => snapshot, updateSettings, isCurrent: () => true };
		internals.renderer = { applySettings: vi.fn(), mount, update: vi.fn() };
		internals.settings.update({ showTranslation: false });
		beginIntroEpoch(app);

		await internals.applySettings();

		expect(updateSettings).toHaveBeenCalledOnce();
		expect(mount).toHaveBeenCalledOnce();
	});

	test("recalculates the background first vocal on a structural sync-preference change", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:settings-background");
		const snapshot = readySyllableSnapshot(track, 10, 4);
		const events: unknown[][] = [];
		const synchronizer = { timestampSec: 3, resync: vi.fn() };
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: () => void };
			currentTrack: TrackIdentity;
			appliedSettings: ExtensionSettings;
			settings: { get: () => ExtensionSettings; update: (patch: Partial<ExtensionSettings>) => void };
			trackSession: {
				getSnapshot: () => TrackSessionSnapshot;
				updateSettings: () => Promise<TrackSessionSnapshot | undefined>;
				isCurrent: (snapshot: TrackSessionSnapshot) => boolean;
				invalidate: () => void;
			};
			introGate: IntroPresentationGate;
			playbackSynchronizer: typeof synchronizer;
			renderer: {
				destroy: () => void;
				applySettings: () => void;
				showTrackMetadata: () => void;
				update: (timestampSec: number, deltaTimeSec: number) => void;
			};
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			applySettings: () => Promise<void>;
		};
		internals.settings.update({ syncPreference: "line-only" });
		internals.appliedSettings = internals.settings.get();
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = track;
		internals.trackSession = {
			getSnapshot: () => snapshot,
			updateSettings: vi.fn(async () => snapshot),
			isCurrent: (candidate) => candidate === snapshot,
			invalidate: vi.fn(),
		};
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = {
			destroy: vi.fn(),
			applySettings: vi.fn(),
			showTrackMetadata: vi.fn(),
			update: (timestamp, deltaTime) => events.push(["update", timestamp, deltaTime]),
		};
		internals.mountReadySnapshot = (candidate) => events.push(["mount", candidate]);
		internals.introGate.beginTrackEpoch();
		internals.presentReadySnapshot(snapshot);
		expect(internals.introGate.isHolding()).toBe(true);
		events.length = 0;

		internals.settings.update({ syncPreference: "prefer-syllable" });
		await internals.applySettings();

		expect(events).toEqual([
			["mount", snapshot],
			["update", 3, 0],
		]);
		app.destroy();
	});

	test.each([
		{
			name: "provider error",
			track: metadataTrack("spotify:track:reopen-error"),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "error", track, message: "offline" }),
		},
		{
			name: "missing lyrics",
			track: metadataTrack("spotify:track:reopen-empty"),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "no-lyrics" }),
		},
		{
			name: "instrumental",
			track: metadataTrack("spotify:track:reopen-instrumental"),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "instrumental" }),
		},
		{
			name: "unsupported local track",
			track: metadataTrack("spotify:local:aura:reopen:local:180", { isLocal: true }),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "unsupported-local" }),
		},
	])("does not restore stale revealed lyrics after a final $name result and reopen", async ({ track, finalState }) => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 8_000;
		spicetify.Player.data = {
			item: {
				uri: track.uri,
				metadata: {
					title: track.title,
					artist_name: track.artist,
					album_title: track.album,
					duration: String(track.durationMs),
				},
			},
		};
		spicetify.URI = { isTrack: () => !track.isLocal, isLocalTrack: () => track.isLocal };
		const app = new ExtensionApp(spicetify);
		const reopenResult = deferred<LyricsLoadState>();
		const load = vi
			.fn()
			.mockResolvedValueOnce(readyLoadStateAt(track, 10))
			.mockResolvedValueOnce(finalState(track))
			.mockImplementationOnce(() => reopenResult.promise);
		const roots: HTMLElement[] = [];
		const open = vi.fn(async () => {
			const root = document.createElement("main");
			roots.push(root);
			return {
				window,
				root,
				setCover: vi.fn(),
				setPlaying: vi.fn(),
				applyTheme: vi.fn(),
				applySettings: vi.fn(),
			};
		});
		vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			pip: { open: typeof open; close: () => void };
			lyricsService: { load: typeof load; refreshCooldowns: () => void; invalidate: () => void };
			openPip: () => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.pip = { open, close: vi.fn() };
		internals.lyricsService = { load, refreshCooldowns: vi.fn(), invalidate: vi.fn() };
		await internals.openPip();
		expect(roots[0]?.querySelector(".lyrics-track")).not.toBeNull();
		await internals.loadCurrentTrack(true);
		expect(roots[0]?.querySelector(".lyrics-track")).toBeNull();
		internals.closePip(false);

		const reopening = internals.openPip();
		await vi.waitFor(() => expect(roots).toHaveLength(2));

		expect(roots[1]?.querySelector(".lyrics-track")).toBeNull();
		expect(roots[1]?.querySelector(".track-metadata-scene.loading")).not.toBeNull();
		reopenResult.resolve(readyLoadStateAt(track, 10));
		await reopening;
		internals.closePip(false);
		app.destroy();
	});

	test("mounts only the latest result when structural setting rebuilds overlap", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const snapshot = readySnapshot();
		const first = deferred<TrackSessionSnapshot | undefined>();
		const second = deferred<TrackSessionSnapshot | undefined>();
		const mount = vi.fn();
		const updateSettings = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: () => void };
			currentTrack: ReadyTrackSessionSnapshot["loadState"]["track"];
			settings: { update: (patch: unknown) => void };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; updateSettings: typeof updateSettings; isCurrent: () => boolean };
			renderer: { applySettings: () => void; mount: typeof mount; update: (timestampSec: number, deltaTime: number) => void };
			applySettings: () => Promise<void>;
		};
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = snapshot.loadState.track;
		internals.trackSession = { getSnapshot: () => snapshot, updateSettings, isCurrent: () => true };
		internals.renderer = { applySettings: vi.fn(), mount, update: vi.fn() };
		beginIntroEpoch(app);

		internals.settings.update({ showTranslation: false });
		const firstApply = internals.applySettings();
		internals.settings.update({ showTranslation: true });
		const secondApply = internals.applySettings();
		second.resolve(snapshot);
		await secondApply;
		first.resolve(snapshot);
		await firstApply;

		expect(updateSettings).toHaveBeenCalledTimes(2);
		expect(mount).toHaveBeenCalledOnce();
	});

	test("mounts only the current real track-session snapshot when structural pseudo updates race", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:real-settings-race");
		const analysisResult = deferred<ReturnType<typeof buildVocalAnalysis> | undefined>();
		const controller = new TrackSessionController(
			{
				load: async () => readyLoadState(track),
				refreshCooldowns: vi.fn(),
				invalidate: vi.fn(),
			},
			{
				loadProfile: async () => ({ trackUri: track.uri, seed: 1, segments: [], source: "seeded" as const }),
				getAnalysis: async () => analysisResult.promise,
				invalidateAnalysis: vi.fn(),
			}
		);
		const mount = vi.fn();
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: () => void };
			currentTrack: TrackIdentity;
			appliedSettings: ExtensionSettings;
			settings: {
				get: () => ExtensionSettings;
				update: (patch: Partial<ExtensionSettings>) => void;
			};
			trackSession: TrackSessionController;
			renderer: { applySettings: () => void; mount: typeof mount; update: (timestampSec: number, deltaTime: number) => void };
			applySettings: () => Promise<void>;
		};
		internals.settings.update({ pseudoKaraoke: false });
		internals.appliedSettings = internals.settings.get();
		const initial = await controller.load(track, internals.settings.get(), false);
		if (!initial) throw new Error("Expected initial track snapshot.");
		await controller.enrichmentFor(initial);
		const updateSettings = vi.spyOn(controller, "updateSettings");
		internals.session = { root, applySettings: vi.fn() };
		internals.currentTrack = track;
		internals.trackSession = controller;
		internals.renderer = { applySettings: vi.fn(), mount, update: vi.fn() };
		beginIntroEpoch(app);

		internals.settings.update({ pseudoKaraoke: true, syncPreference: "prefer-syllable" });
		const older = internals.applySettings();
		internals.settings.update({ syncPreference: "line-only" });
		const newer = internals.applySettings();
		await newer;
		const currentSnapshot = controller.getSnapshot();
		analysisResult.resolve(buildVocalAnalysis(0, 4));
		await older;

		expect(updateSettings).toHaveBeenCalledTimes(2);
		expect(mount).toHaveBeenCalledOnce();
		expect(controller.getSnapshot()).toBe(currentSnapshot);
		expect(controller.isCurrent(currentSnapshot)).toBe(true);
	});

	test("keeps rhythm and waveform data in the final mount when enrichment wins a settings race", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:waveform-settings-race");
		const profileResult = deferred<TrackWaveformProfile>();
		const settingsAnalysis = deferred<ReturnType<typeof buildVocalAnalysis> | undefined>();
		const enrichmentAnalysis = deferred<ReturnType<typeof buildVocalAnalysis> | undefined>();
		const getAnalysis = vi
			.fn()
			.mockImplementationOnce(() => settingsAnalysis.promise)
			.mockImplementationOnce(() => enrichmentAnalysis.promise);
		const currentProfile: TrackWaveformProfile = {
			trackUri: track.uri,
			seed: 17,
			segments: [{ start: 0, duration: 4, loudness_max: -3 }],
			beatDurationSec: 0.5,
			source: "audio-analysis",
		};
		const lineWithInterlude: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 4,
			content: [
				{ type: "vocal", text: "Before", startTime: 0, endTime: 1, oppositeAligned: false },
				{ type: "interlude", startTime: 1, endTime: 3 },
				{ type: "vocal", text: "After", startTime: 3, endTime: 4, oppositeAligned: false },
			],
		};
		const controller = new TrackSessionController(
			{
				load: async () => {
					const state = readyLoadState(track);
					if (state.status !== "ready") throw new Error("Expected ready load state.");
					return { ...state, lyrics: lineWithInterlude };
				},
				refreshCooldowns: vi.fn(),
				invalidate: vi.fn(),
			},
			{
				loadProfile: async () => profileResult.promise,
				getAnalysis,
				invalidateAnalysis: vi.fn(),
			},
			() => ({
				type: "syllable",
				startTime: 0,
				endTime: 4,
				content: [{ type: "interlude", startTime: 1, endTime: 3 }],
			})
		);
		const mount = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: () => void };
			currentTrack: TrackIdentity;
			appliedSettings: ExtensionSettings;
			settings: { get: () => ExtensionSettings; update: (patch: Partial<ExtensionSettings>) => void };
			trackSession: TrackSessionController;
			renderer: { applySettings: () => void; mount: typeof mount; update: (timestampSec: number, deltaTime: number) => void };
			applySettings: () => Promise<void>;
		};
		internals.settings.update({ pseudoKaraoke: false, interludeStyle: "wave" });
		internals.appliedSettings = internals.settings.get();
		const initial = await controller.load(track, internals.settings.get(), false);
		if (!initial) throw new Error("Expected initial track snapshot.");
		const enrichment = controller.enrichmentFor(initial);
		if (!enrichment) throw new Error("Expected waveform enrichment.");
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = track;
		internals.trackSession = controller;
		internals.renderer = { applySettings: vi.fn(), mount, update: vi.fn() };
		beginIntroEpoch(app);

		internals.settings.update({ pseudoKaraoke: true, syncPreference: "prefer-syllable" });
		const applying = internals.applySettings();
		await vi.waitFor(() => expect(getAnalysis).toHaveBeenCalledTimes(1));
		profileResult.resolve(currentProfile);
		await vi.waitFor(() => expect(getAnalysis).toHaveBeenCalledTimes(2));
		enrichmentAnalysis.resolve(buildVocalAnalysis(0, 4));
		await enrichment;
		settingsAnalysis.resolve(buildVocalAnalysis(0, 4));
		await applying;

		expect(controller.getSnapshot().waveformProfile).toBe(currentProfile);
		expect(mount).toHaveBeenCalledOnce();
		const mountOptions = mount.mock.calls[0]?.[1] as { rhythm?: TrackWaveformProfile; waveforms?: Record<string, { source: string }> } | undefined;
		expect(mountOptions).toMatchObject({ rhythm: currentProfile });
		expect(Object.values(mountOptions?.waveforms ?? {})).toContainEqual(expect.objectContaining({ source: "audio-analysis" }));
	});

	test("starts and ends intro epochs for track changes while PiP is closed", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:closed-epoch");
		const internals = app as unknown as {
			introGate: {
				beginTrackEpoch: () => void;
				endTrackEpoch: () => void;
				hasActiveEpoch: () => boolean;
			};
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
		};
		const beginTrackEpoch = vi.spyOn(internals.introGate, "beginTrackEpoch");
		const endTrackEpoch = vi.spyOn(internals.introGate, "endTrackEpoch");

		await internals.onTrackChanged(track);
		await internals.onTrackChanged(track);

		expect(beginTrackEpoch).toHaveBeenCalledTimes(2);
		expect(internals.introGate.hasActiveEpoch()).toBe(true);

		await internals.onTrackChanged(undefined);

		expect(endTrackEpoch).toHaveBeenCalledOnce();
		expect(internals.introGate.hasActiveEpoch()).toBe(false);
	});

	test("applies a fresh intro latch to repeated same-URI and post-no-track DOM loads", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 0;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:repeat-dom");
		const root = document.createElement("main");
		const load = vi
			.fn()
			.mockResolvedValueOnce(readyLoadStateAt(track, 1))
			.mockResolvedValueOnce(readyLoadStateAt(track, 10))
			.mockResolvedValueOnce(readyLoadStateAt(track, 1));
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			lyricsService: { load: typeof load; refreshCooldowns: () => void; invalidate: () => void };
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.lyricsService = { load, refreshCooldowns: vi.fn(), invalidate: vi.fn() };

		await internals.onTrackChanged(track);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();

		await internals.onTrackChanged(track);
		expect(root.querySelector(".track-metadata-scene.intro")).not.toBeNull();
		expect(root.querySelector(".lyrics-track")).toBeNull();

		await internals.onTrackChanged(undefined);
		expect(root.querySelector(".status-card")?.textContent).toContain("Waiting for music");
		await internals.onTrackChanged(track);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();
		expect(root.querySelector(".track-metadata-scene.intro")).toBeNull();
		app.destroy();
	});

	test("starts an intro epoch once on first PiP open and preserves it across reopen", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:open-epoch",
				metadata: { title: "Open Epoch", artist_name: "Aura", album_title: "Lifecycle", duration: "180000" },
			},
		};
		spicetify.URI = { isTrack: () => true, isLocalTrack: () => false };
		const app = new ExtensionApp(spicetify);
		const open = vi.fn(async () => ({
			window,
			root: document.createElement("main"),
			setCover: vi.fn(),
			setPlaying: vi.fn(),
			applyTheme: vi.fn(),
			applySettings: vi.fn(),
		}));
		const loadCurrentTrack = vi.fn(async () => undefined);
		vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			pip: { open: typeof open; isOpen: () => boolean };
			introGate: { beginTrackEpoch: () => void; hasActiveEpoch: () => boolean };
			openPip: () => Promise<void>;
			loadCurrentTrack: typeof loadCurrentTrack;
			closePip: (closeWindow?: boolean) => void;
		};
		internals.pip = { open, isOpen: () => false };
		internals.loadCurrentTrack = loadCurrentTrack;
		const beginTrackEpoch = vi.spyOn(internals.introGate, "beginTrackEpoch");

		await internals.openPip();
		expect(beginTrackEpoch).toHaveBeenCalledOnce();
		expect(internals.introGate.hasActiveEpoch()).toBe(true);

		internals.closePip(false);
		await internals.openPip();

		expect(beginTrackEpoch).toHaveBeenCalledOnce();
		expect(internals.introGate.hasActiveEpoch()).toBe(true);
		expect(loadCurrentTrack).toHaveBeenCalledTimes(2);
		internals.closePip(false);
	});

	test("keeps the revealed intro latch on PiP close and does not start a new epoch on manual refresh", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:revealed-close");
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			settings: { get: () => ExtensionSettings };
			introGate: IntroPresentationGate;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = {
			load: vi.fn(async () => readyLoadStateAt(track, 1.5)),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};
		internals.introGate.beginTrackEpoch();
		const beginTrackEpoch = vi.spyOn(internals.introGate, "beginTrackEpoch");
		const discardPendingSession = vi.spyOn(internals.introGate, "discardPendingSession");

		await internals.loadCurrentTrack(false);
		await internals.loadCurrentTrack(true);

		expect(beginTrackEpoch).not.toHaveBeenCalled();
		internals.closePip(false);
		expect(discardPendingSession).toHaveBeenCalledOnce();
		expect(internals.introGate.hasActiveEpoch()).toBe(true);
		const longIntroState = readyLoadStateAt(track, 8);
		if (longIntroState.status !== "ready") throw new Error("Expected ready long-intro state.");
		const longIntroSnapshot: ReadyTrackSessionSnapshot = {
			loadState: longIntroState,
			lyrics: longIntroState.lyrics,
			timingSource: "native",
		};
		expect(internals.introGate.accept(longIntroSnapshot, internals.settings.get(), 0)).toEqual({
			kind: "reveal",
			snapshot: longIntroSnapshot,
		});
	});

	test("keeps revealed lyrics visible while a manual refresh is pending", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 8_000;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:pending-refresh");
		const refreshResult = deferred<LyricsLoadState>();
		const load = vi
			.fn()
			.mockResolvedValueOnce(readyLoadStateAt(track, 10))
			.mockImplementationOnce(() => refreshResult.promise);
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: typeof load; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load, refreshCooldowns: vi.fn(), invalidate: vi.fn() };
		internals.introGate.beginTrackEpoch();
		await internals.loadCurrentTrack(false);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();

		const refreshing = internals.loadCurrentTrack(true);

		expect(root.querySelector(".lyrics-track")).not.toBeNull();
		expect(root.querySelector(".track-metadata-scene")).toBeNull();
		refreshResult.resolve(readyLoadStateAt(track, 10));
		await refreshing;
		app.destroy();
	});

	test("keeps visible lyrics live on playing and paused ticks while a manual refresh is pending", async () => {
		const { spicetify } = createSpicetify();
		let progressMs = 8_000;
		spicetify.Player.getProgress = () => progressMs;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:live-pending-refresh");
		const refreshResult = deferred<LyricsLoadState>();
		const load = vi
			.fn()
			.mockResolvedValueOnce(readyLoadStateAt(track, 10))
			.mockImplementationOnce(() => refreshResult.promise);
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: typeof load; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			renderer: { update: (timestampSec: number, deltaTimeSec: number) => void };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
			tick: (deltaTimeSec: number) => void;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load, refreshCooldowns: vi.fn(), invalidate: vi.fn() };
		internals.introGate.beginTrackEpoch();
		internals.isPlaybackActive = true;
		await internals.loadCurrentTrack(false);
		const refreshing = internals.loadCurrentTrack(true);
		progressMs = 10_000;

		internals.tick(0.25);

		expect(root.querySelector(".line-group.active")?.textContent).toContain("First vocal");
		const update = vi.spyOn(internals.renderer, "update");
		update.mockClear();
		internals.isPlaybackActive = false;
		internals.tick(0.1);
		expect(update).toHaveBeenCalledWith(10, 0.1);
		refreshResult.resolve(readyLoadStateAt(track, 10));
		await refreshing;
		app.destroy();
	});

	test("remounts preserved synthetic lyrics for structural settings while refresh is pending", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 8_000;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:pending-structural-remount");
		const canonicalLoadState = readyLoadStateAt(track, 10);
		if (canonicalLoadState.status !== "ready") throw new Error("Expected ready canonical load state.");
		const syntheticSnapshot: ReadyTrackSessionSnapshot = {
			...readySyllableSnapshot(track, 10),
			loadState: canonicalLoadState,
			timingSource: "synthetic",
		};
		const refreshResult = deferred<LyricsLoadState>();
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applySettings: () => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			settings: { update: (patch: Partial<ExtensionSettings>) => void };
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			playbackSynchronizer: PlaybackSynchronizer;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
			applySettings: () => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applySettings: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.playbackSynchronizer.resync();
		internals.introGate.beginTrackEpoch();
		internals.presentReadySnapshot(syntheticSnapshot);
		internals.lyricsService = {
			load: vi.fn(() => refreshResult.promise),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};
		const refreshing = internals.loadCurrentTrack(true);

		internals.settings.update({ language: "ko", showTranslation: false, interludeStyle: "wave" });
		await internals.applySettings();

		expectSyntheticTimingScene(root, "가상 노래방 싱크");
		refreshResult.resolve(canonicalLoadState);
		await refreshing;
		app.destroy();
	});

	test.each([
		{
			name: "provider error",
			track: metadataTrack("spotify:track:refresh-error"),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "error", track, message: "offline" }),
			expected: "metadata",
		},
		{
			name: "missing lyrics",
			track: metadataTrack("spotify:track:refresh-empty"),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "no-lyrics" }),
			expected: "metadata",
		},
		{
			name: "instrumental",
			track: metadataTrack("spotify:track:refresh-instrumental"),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "instrumental" }),
			expected: "instrumental",
		},
		{
			name: "unsupported local track",
			track: metadataTrack("spotify:local:aura:refresh:local:180", { isLocal: true }),
			finalState: (track: TrackIdentity): LyricsLoadState => ({ status: "empty", track, reason: "unsupported-local" }),
			expected: "metadata",
		},
	])("keeps lyrics while a refresh is pending, then renders the final $name presentation", async ({ track, finalState, expected }) => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 8_000;
		const app = new ExtensionApp(spicetify);
		const refreshResult = deferred<LyricsLoadState>();
		const load = vi
			.fn()
			.mockResolvedValueOnce(readyLoadStateAt(track, 10))
			.mockImplementationOnce(() => refreshResult.promise);
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			lyricsService: { load: typeof load; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = { load, refreshCooldowns: vi.fn(), invalidate: vi.fn() };
		internals.introGate.beginTrackEpoch();
		await internals.loadCurrentTrack(false);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();

		const refreshing = internals.loadCurrentTrack(true);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();
		expect(root.querySelector(".track-metadata-scene")).toBeNull();
		refreshResult.resolve(finalState(track));
		await refreshing;

		expect(root.querySelector(".lyrics-track")).toBeNull();
		if (expected === "instrumental") {
			expect(root.classList.contains("album-art-mode")).toBe(true);
			expect(root.children).toHaveLength(1);
			expect(root.firstElementChild?.classList.contains("album-art-scene")).toBe(true);
			expect(root.querySelector(".aura-lyrics, .status-card, .track-metadata-scene")).toBeNull();
		} else {
			expect(root.querySelector(".track-metadata-scene.persistent")).not.toBeNull();
			expect(root.querySelector(".track-metadata-title")?.textContent).toBe(track.title);
		}
		app.destroy();
	});

	test("reopens directly to lyrics after reveal even after a backward seek and manual refresh", async () => {
		const { spicetify } = createSpicetify();
		const track = metadataTrack("spotify:track:revealed-reopen", { title: "Revealed Reopen" });
		let progressMs = 8_000;
		spicetify.Player.getProgress = () => progressMs;
		spicetify.Player.data = {
			item: {
				uri: track.uri,
				metadata: {
					title: track.title,
					artist_name: track.artist,
					album_title: track.album,
					duration: String(track.durationMs),
				},
			},
		};
		spicetify.URI = { isTrack: () => true, isLocalTrack: () => false };
		const app = new ExtensionApp(spicetify);
		const roots: HTMLElement[] = [];
		const open = vi.fn(async () => {
			const root = document.createElement("main");
			roots.push(root);
			return {
				window,
				root,
				setCover: vi.fn(),
				setPlaying: vi.fn(),
				applyTheme: vi.fn(),
				applySettings: vi.fn(),
			};
		});
		vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			pip: { open: typeof open; close: () => void };
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			openPip: () => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.pip = { open, close: vi.fn() };
		const reopenResult = deferred<LyricsLoadState>();
		internals.lyricsService = {
			load: vi
				.fn()
				.mockResolvedValueOnce(readyLoadStateAt(track, 10))
				.mockImplementationOnce(() => reopenResult.promise)
				.mockResolvedValue(readyLoadStateAt(track, 10)),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};

		await internals.openPip();
		expect(roots[0]?.querySelector(".lyrics-track")).not.toBeNull();
		internals.closePip(false);
		progressMs = 0;

		const reopening = internals.openPip();
		await vi.waitFor(() => expect(roots).toHaveLength(2));
		expect(roots[1]?.querySelector(".lyrics-track")).not.toBeNull();
		expect(roots[1]?.querySelector(".track-metadata-scene.intro")).toBeNull();
		reopenResult.resolve(readyLoadStateAt(track, 10));
		await reopening;
		await internals.loadCurrentTrack(true);
		expect(roots[1]?.querySelector(".lyrics-track")).not.toBeNull();
		expect(roots[1]?.querySelector(".track-metadata-scene.intro")).toBeNull();
		internals.closePip(false);
		app.destroy();
	});

	test("keeps restored lyrics live on playing and paused ticks while reopen loading is pending", async () => {
		const { spicetify } = createSpicetify();
		const track = metadataTrack("spotify:track:live-pending-reopen");
		let progressMs = 8_000;
		spicetify.Player.getProgress = () => progressMs;
		spicetify.Player.data = {
			item: {
				uri: track.uri,
				metadata: {
					title: track.title,
					artist_name: track.artist,
					album_title: track.album,
					duration: String(track.durationMs),
				},
			},
		};
		spicetify.URI = { isTrack: () => true, isLocalTrack: () => false };
		const app = new ExtensionApp(spicetify);
		const reopenResult = deferred<LyricsLoadState>();
		const load = vi
			.fn()
			.mockResolvedValueOnce(readyLoadStateAt(track, 10))
			.mockImplementationOnce(() => reopenResult.promise);
		const roots: HTMLElement[] = [];
		const open = vi.fn(async () => {
			const root = document.createElement("main");
			roots.push(root);
			return {
				window,
				root,
				setCover: vi.fn(),
				setPlaying: vi.fn(),
				applyTheme: vi.fn(),
				applySettings: vi.fn(),
			};
		});
		vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			pip: { open: typeof open; close: () => void };
			lyricsService: { load: typeof load; refreshCooldowns: () => void; invalidate: () => void };
			isPlaybackActive: boolean;
			renderer: { update: (timestampSec: number, deltaTimeSec: number) => void };
			openPip: () => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
			tick: (deltaTimeSec: number) => void;
		};
		internals.pip = { open, close: vi.fn() };
		internals.lyricsService = { load, refreshCooldowns: vi.fn(), invalidate: vi.fn() };
		await internals.openPip();
		internals.closePip(false);

		const reopening = internals.openPip();
		await vi.waitFor(() => expect(roots).toHaveLength(2));
		progressMs = 10_000;
		internals.isPlaybackActive = true;
		internals.tick(0.25);
		expect(roots[1]?.querySelector(".line-group.active")?.textContent).toContain("First vocal");
		const update = vi.spyOn(internals.renderer, "update");
		update.mockClear();
		internals.isPlaybackActive = false;
		internals.tick(0.1);
		expect(update).toHaveBeenCalledWith(10, 0.1);
		reopenResult.resolve(readyLoadStateAt(track, 10));
		await reopening;
		internals.closePip(false);
		app.destroy();
	});

	test("rematerializes a restored synthetic snapshot for structural settings changed while PiP is closed", async () => {
		const { spicetify } = createSpicetify();
		const track = metadataTrack("spotify:track:closed-structural-settings");
		spicetify.Player.getProgress = () => 8_000;
		spicetify.Player.data = {
			item: {
				uri: track.uri,
				metadata: {
					title: track.title,
					artist_name: track.artist,
					album_title: track.album,
					duration: String(track.durationMs),
				},
			},
		};
		spicetify.URI = { isTrack: () => true, isLocalTrack: () => false };
		const canonicalLoadState = readyLoadStateAt(track, 10);
		if (canonicalLoadState.status !== "ready") throw new Error("Expected ready canonical load state.");
		const syntheticSnapshot: ReadyTrackSessionSnapshot = {
			...readySyllableSnapshot(track, 10),
			loadState: canonicalLoadState,
			timingSource: "synthetic",
		};
		const app = new ExtensionApp(spicetify);
		const initialRoot = document.createElement("main");
		const reopenResult = deferred<LyricsLoadState>();
		const roots: HTMLElement[] = [];
		const open = vi.fn(async () => {
			const root = document.createElement("main");
			roots.push(root);
			return {
				window,
				root,
				setCover: vi.fn(),
				setPlaying: vi.fn(),
				applyTheme: vi.fn(),
				applySettings: vi.fn(),
			};
		});
		vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack: TrackIdentity;
			pip: { open: typeof open; close: () => void };
			settings: { update: (patch: Partial<ExtensionSettings>) => void };
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			playbackSynchronizer: PlaybackSynchronizer;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			applySettings: () => Promise<void>;
			openPip: () => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
		};
		internals.session = { root: initialRoot, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.playbackSynchronizer.resync();
		internals.introGate.beginTrackEpoch();
		internals.presentReadySnapshot(syntheticSnapshot);
		expectSyntheticTimingScene(initialRoot);
		internals.closePip(false);
		internals.settings.update({ pseudoKaraoke: false, syncPreference: "line-only" });
		await internals.applySettings();
		internals.pip = { open, close: vi.fn() };
		internals.lyricsService = {
			load: vi.fn(() => reopenResult.promise),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};

		const reopening = internals.openPip();
		await vi.waitFor(() => expect(roots).toHaveLength(1));

		expect(roots[0]?.querySelector(".lyrics-track")?.textContent).toContain("First vocal");
		const reopenedScene = roots[0]?.querySelector<HTMLElement>(".aura-lyrics");
		expect(reopenedScene?.classList.contains("synthetic-timing")).toBe(false);
		expect(reopenedScene?.dataset.timingSource).toBeUndefined();
		expect(reopenedScene?.hasAttribute("aria-describedby")).toBe(false);
		expect(roots[0]?.querySelector("[data-aura-synthetic-description]")).toBeNull();
		expect(roots[0]?.querySelector(".aura-timing-marker")).toBeNull();
		expect(roots[0]?.querySelector(".line-group")).not.toBeNull();
		reopenResult.resolve(canonicalLoadState);
		await reopening;
		internals.closePip(false);
		app.destroy();
	});

	test("keeps a restored synthetic snapshot compatible across renderer-only structural settings", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:renderer-only-restore");
		const canonicalLoadState = readyLoadStateAt(track, 10);
		if (canonicalLoadState.status !== "ready") throw new Error("Expected ready canonical load state.");
		const syntheticSnapshot: ReadyTrackSessionSnapshot = {
			...readySyllableSnapshot(track, 10),
			loadState: canonicalLoadState,
			timingSource: "synthetic",
		};
		const internals = app as unknown as {
			settings: { update: (patch: Partial<ExtensionSettings>) => void };
			revealedSnapshot: ReadyTrackSessionSnapshot;
			revealedSnapshotFingerprint: string;
			revealReadySnapshot: (snapshot: ReadyTrackSessionSnapshot, timestampSec: number) => void;
			revealedSnapshotFor: (track: TrackIdentity) => ReadyTrackSessionSnapshot | undefined;
			session: { root: HTMLElement };
		};
		internals.session = { root: document.createElement("main") };
		internals.revealReadySnapshot(syntheticSnapshot, 8);
		internals.settings.update({ language: "ko", showTranslation: false, interludeStyle: "wave" });

		const restored = internals.revealedSnapshotFor(track);

		expect(restored?.lyrics).toBe(syntheticSnapshot.lyrics);
		expect(restored?.timingSource).toBe("synthetic");
		app.destroy();
	});

	test("discards a held PiP session and reveals the fresh load when reopened near the first vocal", async () => {
		const { spicetify } = createSpicetify();
		const track = metadataTrack("spotify:track:held-reopen", { title: "Held Reopen" });
		let progressMs = 0;
		spicetify.Player.getProgress = () => progressMs;
		spicetify.Player.data = {
			item: {
				uri: track.uri,
				metadata: {
					title: track.title,
					artist_name: track.artist,
					album_title: track.album,
					duration: String(track.durationMs),
				},
			},
		};
		spicetify.URI = { isTrack: () => true, isLocalTrack: () => false };
		const app = new ExtensionApp(spicetify);
		const roots: HTMLElement[] = [];
		const open = vi.fn(async () => {
			const root = document.createElement("main");
			roots.push(root);
			return {
				window,
				root,
				setCover: vi.fn(),
				setPlaying: vi.fn(),
				applyTheme: vi.fn(),
				applySettings: vi.fn(),
			};
		});
		vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			pip: { open: typeof open; close: () => void };
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			openPip: () => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
		};
		internals.pip = { open, close: vi.fn() };
		internals.lyricsService = {
			load: vi.fn(async () => readyLoadStateAt(track, 10)),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};

		await internals.openPip();
		expect(roots[0]?.querySelector(".track-metadata-scene.intro")).not.toBeNull();
		expect(roots[0]?.querySelector(".lyrics-track")).toBeNull();
		internals.closePip(false);
		progressMs = 8_500;

		await internals.openPip();
		expect(roots[1]?.querySelector(".lyrics-track")).not.toBeNull();
		expect(roots[1]?.querySelector(".track-metadata-scene.intro")).toBeNull();
		internals.closePip(false);
		app.destroy();
	});

	test("ends the intro epoch in the defensive no-track branch and on destroy", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			currentTrack?: TrackIdentity;
			introGate: { beginTrackEpoch: () => void; hasActiveEpoch: () => boolean };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = { root: document.createElement("main"), setCover: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = undefined;
		internals.introGate.beginTrackEpoch();

		await internals.loadCurrentTrack(false);
		expect(internals.introGate.hasActiveEpoch()).toBe(false);

		internals.introGate.beginTrackEpoch();
		app.destroy();
		expect(internals.introGate.hasActiveEpoch()).toBe(false);
	});

	test("invalidates track sessions on track change, PiP close, and destroy", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const invalidate = vi.fn();
		const internals = app as unknown as {
			trackSession: { invalidate: () => void };
			onTrackChanged: (track: undefined) => Promise<void>;
			closePip: (closeWindow: boolean) => void;
		};
		internals.trackSession = { invalidate };

		await internals.onTrackChanged(undefined);
		internals.closePip(false);
		app.destroy();

		expect(invalidate).toHaveBeenCalledTimes(3);
	});

	test("does not register duplicate listeners when started repeatedly", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);

		app.start();
		app.start();

		expect(spicetify.Player.addEventListener).toHaveBeenCalledTimes(3);
		expect(spicetify.Player.addEventListener).toHaveBeenCalledWith("songchange", expect.any(Function));
		expect(spicetify.Player.addEventListener).toHaveBeenCalledWith("onplaypause", expect.any(Function));
		expect(spicetify.Player.addEventListener).toHaveBeenCalledWith("onprogress", expect.any(Function));
		expect(spicetify.Topbar?.Button).toHaveBeenCalledTimes(1);
		app.destroy();
	});

	test("shares concurrent PiP opens so only one playback clock is started", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		let resolveSession: ((session: unknown) => void) | undefined;
		const sessionPromise = new Promise((resolve) => {
			resolveSession = resolve;
		});
		const open = vi.fn(() => sessionPromise);
		const loadCurrentTrack = vi.fn(async () => undefined);
		const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			pip: { open: typeof open; isOpen: () => boolean };
			openPip: () => Promise<void>;
			loadCurrentTrack: typeof loadCurrentTrack;
			closePip: (closeWindow?: boolean) => void;
		};
		internals.pip = { open, isOpen: () => false };
		internals.loadCurrentTrack = loadCurrentTrack;

		const firstOpen = internals.openPip();
		const secondOpen = internals.openPip();
		resolveSession?.({
			window,
			root: document.createElement("main"),
			setCover: vi.fn(),
			setPlaying: vi.fn(),
			applyTheme: vi.fn(),
			applySettings: vi.fn(),
		});
		await Promise.all([firstOpen, secondOpen]);

		expect(open).toHaveBeenCalledOnce();
		expect(requestAnimationFrame).toHaveBeenCalledOnce();
		expect(loadCurrentTrack).toHaveBeenCalledOnce();
		internals.closePip(false);
	});

	test("disposes settings and PiP subscriptions on destroy", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const internals = app as unknown as {
			settings: { update: (patch: unknown) => void };
			pip: { closed: { emit: (value?: undefined) => void } };
			applySettings: () => void;
			closePip: (closeWindow?: boolean) => void;
		};
		app.start();
		app.destroy();
		internals.applySettings = vi.fn();
		internals.closePip = vi.fn();

		internals.settings.update({ lyricsDelayMs: 99 });
		internals.pip.closed.emit();

		expect(internals.applySettings).not.toHaveBeenCalled();
		expect(internals.closePip).not.toHaveBeenCalled();
	});

	test("notifies about a generated Musixmatch token only after the settings panel adopts it", async () => {
		const { showNotification, spicetify } = createSpicetify();
		let modal: HTMLElement | undefined;
		spicetify.PopupModal = {
			display: ({ content }) => {
				modal = document.createElement("div");
				modal.className = "main-trackCreditsModal-container";
				modal.append(content);
				document.body.append(modal);
			},
			hide: () => modal?.remove(),
		};
		window.Spicetify = spicetify;
		const app = new ExtensionApp(spicetify);
		const result = deferred<string | undefined>();
		const internals = app as unknown as {
			musixmatchTokenService: { refresh: () => Promise<string | undefined> };
			settings: { get: () => { providers: { musixmatchToken?: string } } };
			settingsView: { destroy: () => void; open: () => void };
		};
		internals.musixmatchTokenService = { refresh: vi.fn(() => result.promise) };
		const tokensAtNotification: Array<string | undefined> = [];
		showNotification.mockImplementation((message) => {
			if (message === "Musixmatch token updated.") {
				tokensAtNotification.push(internals.settings.get().providers.musixmatchToken);
			}
		});

		try {
			internals.settingsView.open();
			const content = document.querySelector<HTMLElement>(".aura-lyrics-settings");
			content?.querySelector<HTMLButtonElement>('[data-section="providers"]')?.click();
			content?.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();
			result.resolve("accepted-token");
			await result.promise;
			await vi.waitFor(() => expect(showNotification).toHaveBeenCalledWith("Musixmatch token updated."));

			expect(tokensAtNotification).toEqual(["accepted-token"]);
			expect(internals.settings.get().providers.musixmatchToken).toBe("accepted-token");
		} finally {
			internals.settingsView.destroy();
			window.Spicetify = undefined;
		}
	});

	test("keeps persistence failure as the final notification when a fetched token cannot be saved", async () => {
		const { showNotification, spicetify } = createSpicetify();
		let modal: HTMLElement | undefined;
		spicetify.PopupModal = {
			display: ({ content }) => {
				modal = document.createElement("div");
				modal.className = "main-trackCreditsModal-container";
				modal.append(content);
				document.body.append(modal);
			},
			hide: () => modal?.remove(),
		};
		window.Spicetify = spicetify;
		const app = new ExtensionApp(spicetify);
		const internals = app as unknown as {
			musixmatchTokenService: { refresh: () => Promise<string | undefined> };
			settings: { get: () => { providers: { musixmatchToken?: string } } };
			settingsView: { open: () => void };
		};
		internals.musixmatchTokenService = { refresh: vi.fn(async () => "runtime-token") };
		app.start();
		if (!spicetify.LocalStorage) {
			throw new Error("LocalStorage fixture is missing.");
		}
		spicetify.LocalStorage.set = vi.fn(() => {
			throw new Error("quota exceeded");
		});

		try {
			internals.settingsView.open();
			const content = document.querySelector<HTMLElement>(".aura-lyrics-settings");
			content?.querySelector<HTMLButtonElement>('[data-section="providers"]')?.click();
			content?.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();
			await vi.waitFor(() => expect(showNotification).toHaveBeenCalledWith("AuraLyrics settings could not be saved.", true));

			expect(internals.settings.get().providers.musixmatchToken).toBe("runtime-token");
			expect(showNotification).toHaveBeenCalledTimes(1);
			expect(showNotification).not.toHaveBeenCalledWith("Musixmatch token updated.");
		} finally {
			app.destroy();
			window.Spicetify = undefined;
		}
	});

	test("surfaces constructor persistence failures when the app starts", () => {
		const { showNotification, spicetify } = createSpicetify();
		if (!spicetify.LocalStorage) {
			throw new Error("LocalStorage fixture is missing.");
		}
		spicetify.LocalStorage.set = vi.fn(() => {
			throw new Error("unavailable");
		});
		const app = new ExtensionApp(spicetify);

		app.start();

		expect(showNotification).toHaveBeenCalledOnce();
		expect(showNotification).toHaveBeenCalledWith("AuraLyrics settings could not be saved.", true);
		app.destroy();
	});

	test("notifies on runtime persistence failures and unsubscribes on destroy", () => {
		const { showNotification, spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const internals = app as unknown as {
			settings: { update: (patch: unknown) => void };
		};
		app.start();
		if (!spicetify.LocalStorage) {
			throw new Error("LocalStorage fixture is missing.");
		}
		spicetify.LocalStorage.set = vi.fn(() => {
			throw new Error("unavailable");
		});

		internals.settings.update({ lyricsDelayMs: 99 });

		expect(showNotification).toHaveBeenCalledOnce();
		expect(showNotification).toHaveBeenCalledWith("AuraLyrics settings could not be saved.", true);

		app.destroy();
		showNotification.mockClear();
		internals.settings.update({ lyricsDelayMs: 100 });

		expect(showNotification).not.toHaveBeenCalled();
	});

	test("updates PiP play state from playback callbacks instead of the lyric frame tick", () => {
		const { spicetify } = createSpicetify();
		let playbackListener: (() => void) | undefined;
		let isPlaying = true;
		const getProgress = vi.fn(() => 12000);
		spicetify.Player.getProgress = getProgress;
		spicetify.Player.isPlaying = () => isPlaying;
		spicetify.Player.addEventListener = vi.fn((event: string, listener: () => void) => {
			if (event === "onplaypause") {
				playbackListener = listener;
			}
		});
		const app = new ExtensionApp(spicetify);
		const setPlaying = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackSynchronizer: PlaybackSynchronizer;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying };
		internals.renderer = { destroy: vi.fn(), update: vi.fn() };
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer.resync();
		getProgress.mockClear();

		internals.tick(1 / 60);
		isPlaying = false;
		playbackListener?.();

		expect(setPlaying).toHaveBeenCalledTimes(1);
		expect(setPlaying).toHaveBeenCalledWith(false);
		expect(getProgress).toHaveBeenCalledOnce();
		app.destroy();
	});

	test("advances lyrics from a sampled timestamp and resyncs player progress every 20 seconds", () => {
		const { spicetify } = createSpicetify();
		const getProgress = vi.fn().mockReturnValueOnce(10000).mockReturnValueOnce(11000).mockReturnValueOnce(5000);
		spicetify.Player.getProgress = getProgress;
		const app = new ExtensionApp(spicetify);
		const snapshot = readySnapshot();
		const update = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			currentTrack: TrackIdentity;
			revealedSnapshot: ReadyTrackSessionSnapshot;
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackSynchronizer: PlaybackSynchronizer;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying: vi.fn() };
		internals.currentTrack = snapshot.loadState.track;
		internals.revealedSnapshot = snapshot;
		internals.trackSession = {
			getSnapshot: () => ({ loadState: { status: "ready" } }) as unknown as TrackSessionSnapshot,
			invalidate: vi.fn(),
		};
		internals.renderer = { destroy: vi.fn(), update };
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer.resync();
		outroControllerOf(app).beginTrackEpoch(snapshot.loadState.track.uri);
		outroControllerOf(app).accept(snapshot, internalsSettingsOf(app), internals.playbackSynchronizer.timestampSec);
		getProgress.mockClear();

		internals.tick(1);
		expect(getProgress).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenLastCalledWith(11, expect.any(Number));

		internals.tick(19);
		expect(getProgress).toHaveBeenCalledTimes(2);
		expect(update).toHaveBeenLastCalledWith(5, expect.any(Number));
		app.destroy();
	});

	test("quickly snaps lyrics to a seeked player position without waiting for the 20 second resync", () => {
		const { spicetify } = createSpicetify();
		const getProgress = vi.fn().mockReturnValueOnce(10000).mockReturnValue(45000);
		spicetify.Player.getProgress = getProgress;
		const app = new ExtensionApp(spicetify);
		const snapshot = readySnapshot();
		const update = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			currentTrack: TrackIdentity;
			revealedSnapshot: ReadyTrackSessionSnapshot;
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackSynchronizer: PlaybackSynchronizer;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying: vi.fn() };
		internals.currentTrack = snapshot.loadState.track;
		internals.revealedSnapshot = snapshot;
		internals.trackSession = {
			getSnapshot: () => ({ loadState: { status: "ready" } }) as unknown as TrackSessionSnapshot,
			invalidate: vi.fn(),
		};
		internals.renderer = { destroy: vi.fn(), update };
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer.resync();
		outroControllerOf(app).beginTrackEpoch(snapshot.loadState.track.uri);
		outroControllerOf(app).accept(snapshot, internalsSettingsOf(app), internals.playbackSynchronizer.timestampSec);
		getProgress.mockClear();

		internals.tick(0.25);

		expect(getProgress).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenLastCalledWith(45, expect.any(Number));
		app.destroy();
	});

	test("updates playback before revealing exactly at the first vocal and paints that timestamp only once", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:tick-reveal");
		const snapshot = readySnapshotAt(track, 8);
		const events: unknown[][] = [];
		let timestampSec = 0;
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			update: (deltaTimeSec: number, isPlaying: boolean) => {
				if (isPlaying) timestampSec += deltaTimeSec;
				events.push(["synchronizer-update", timestampSec]);
			},
			resync: vi.fn(),
		};
		const internals = app as unknown as {
			session: { root: HTMLElement };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			playbackSynchronizer: typeof synchronizer;
			renderer: { destroy: () => void; update: (timestampSec: number, deltaTimeSec: number) => void };
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			tick: (deltaTimeSec: number) => void;
		};
		internals.session = { root: document.createElement("main") };
		internals.trackSession = { getSnapshot: () => snapshot, invalidate: vi.fn() };
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = {
			destroy: vi.fn(),
			update: (timestamp, deltaTime) => events.push(["update", timestamp, deltaTime]),
		};
		internals.mountReadySnapshot = (ready) => events.push(["mount", ready]);
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(snapshot, internalsSettingsOf(app), 0).kind).toBe("hold");

		internals.tick(7.999);
		expect(internals.introGate.isHolding()).toBe(true);
		expect(events.some(([event]) => event === "mount")).toBe(false);

		events.length = 0;
		internals.tick(0.001);

		expect(events).toEqual([
			["synchronizer-update", 8],
			["mount", snapshot],
			["update", 8, 0],
		]);
		app.destroy();
	});

	test("activates the real syllable row and progress on the same frame that reveals it", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:real-syllable-reveal");
		const snapshot = readySyllableSnapshot(track, 8, 9);
		const root = document.createElement("main");
		let timestampSec = 0;
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			update: () => {
				timestampSec = 8.5;
			},
		};
		const internals = app as unknown as {
			session: { root: HTMLElement };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			playbackSynchronizer: typeof synchronizer;
			tick: (deltaTimeSec: number) => void;
		};
		internals.session = { root };
		internals.trackSession = { getSnapshot: () => snapshot, invalidate: vi.fn() };
		internals.playbackSynchronizer = synchronizer;
		internals.isPlaybackActive = true;
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(snapshot, internalsSettingsOf(app), 0).kind).toBe("hold");

		internals.tick(0.25);

		expect(root.querySelector(".syllable-group.active")).not.toBeNull();
		expect(root.querySelector(".vocals.lead .syllable-row.active")?.textContent).toContain("Lead");
		const syllable = root.querySelector<HTMLElement>(".vocals.lead .syllable.active");
		expect(syllable?.style.getPropertyValue("--gradient-progress")).toBe("25%");
		app.destroy();
	});

	test("keeps sampling playback while a ready intro is held even when lyrics DOM is not mounted", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:unmounted-held-ready");
		const snapshot = readySnapshotAt(track, 8);
		const updatePlayback = vi.fn();
		const updateRenderer = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			playbackSynchronizer: { timestampSec: number; update: typeof updatePlayback };
			renderer: { destroy: () => void; update: () => void };
			tick: (deltaTimeSec: number) => void;
		};
		internals.session = { root: document.createElement("main") };
		internals.trackSession = {
			getSnapshot: () => snapshot,
			invalidate: vi.fn(),
		};
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer = { timestampSec: 3, update: updatePlayback };
		internals.renderer = { destroy: vi.fn(), update: updateRenderer };
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(snapshot, internalsSettingsOf(app), 3).kind).toBe("hold");

		internals.tick(0.25);

		expect(updatePlayback).toHaveBeenCalledWith(0.25, true);
		expect(updateRenderer).not.toHaveBeenCalled();
		app.destroy();
	});

	test("resyncs on resume and reveals a held snapshot only inside the two-second threshold", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:resume-reveal");
		const snapshot = readySnapshotAt(track, 10);
		const events: unknown[][] = [];
		let playerTimestampSec = 0;
		let timestampSec = 0;
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			update: (deltaTimeSec: number, isPlaying: boolean) => {
				if (isPlaying) timestampSec += deltaTimeSec;
			},
			resync: () => {
				timestampSec = playerTimestampSec;
				events.push(["resync", timestampSec]);
			},
		};
		const internals = app as unknown as {
			session: { root: HTMLElement; setPlaying: (isPlaying: boolean) => void };
			introGate: IntroPresentationGate;
			playbackSynchronizer: typeof synchronizer;
			renderer: { destroy: () => void; update: (timestampSec: number, deltaTimeSec: number) => void };
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			onPlaybackChanged: (isPlaying: boolean) => void;
		};
		internals.session = { root: document.createElement("main"), setPlaying: vi.fn() };
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = {
			destroy: vi.fn(),
			update: (timestamp, deltaTime) => events.push(["update", timestamp, deltaTime]),
		};
		internals.mountReadySnapshot = (ready) => events.push(["mount", ready]);
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(snapshot, internalsSettingsOf(app), 0).kind).toBe("hold");

		internals.onPlaybackChanged(false);
		expect(events).toEqual([["resync", 0]]);
		events.length = 0;
		playerTimestampSec = 7.9;
		internals.onPlaybackChanged(true);
		expect(events).toEqual([["resync", 7.9]]);
		expect(internals.introGate.isHolding()).toBe(true);

		internals.onPlaybackChanged(false);
		playerTimestampSec = 8;
		events.length = 0;
		internals.onPlaybackChanged(true);

		expect(events).toEqual([
			["resync", 8],
			["mount", snapshot],
			["update", 8, 0],
		]);
		app.destroy();
	});

	test("does not sample or evaluate a held intro on animation frames while paused", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:paused-hold");
		const snapshot = readySnapshotAt(track, 8);
		const updatePlayback = vi.fn();
		const tickGate = vi.spyOn(introGateOf(app), "tick");
		const mount = vi.fn();
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			playbackSynchronizer: { timestampSec: number; update: typeof updatePlayback };
			renderer: { destroy: () => void; update: () => void };
			mountReadySnapshot: typeof mount;
			tick: (deltaTimeSec: number) => void;
		};
		internals.session = { root };
		internals.trackSession = { getSnapshot: () => snapshot, invalidate: vi.fn() };
		internals.playbackSynchronizer = { timestampSec: 8, update: updatePlayback };
		internals.renderer = { destroy: vi.fn(), update: vi.fn() };
		internals.mountReadySnapshot = mount;
		internals.isPlaybackActive = false;
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(snapshot, internalsSettingsOf(app), 0).kind).toBe("hold");
		tickGate.mockClear();

		internals.tick(0.25);

		expect(updatePlayback).not.toHaveBeenCalled();
		expect(tickGate).not.toHaveBeenCalled();
		expect(mount).not.toHaveBeenCalled();
		expect(internals.introGate.isHolding()).toBe(true);
		app.destroy();
	});

	test("reveals a held intro on the synchronized tick after a seek snap", () => {
		const { spicetify } = createSpicetify();
		const getProgress = vi.fn().mockReturnValueOnce(0).mockReturnValue(10_000);
		spicetify.Player.getProgress = getProgress;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:seek-reveal");
		const snapshot = readySnapshotAt(track, 8);
		const mount = vi.fn();
		const update = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			playbackSynchronizer: PlaybackSynchronizer;
			renderer: { destroy: () => void; update: typeof update };
			mountReadySnapshot: typeof mount;
			tick: (deltaTimeSec: number) => void;
		};
		internals.session = { root: document.createElement("main") };
		internals.trackSession = { getSnapshot: () => snapshot, invalidate: vi.fn() };
		internals.renderer = { destroy: vi.fn(), update };
		internals.mountReadySnapshot = mount;
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer.resync();
		internals.introGate.beginTrackEpoch();
		expect(internals.introGate.accept(snapshot, internalsSettingsOf(app), 0).kind).toBe("hold");
		getProgress.mockClear();

		internals.tick(0.25);

		expect(getProgress).toHaveBeenCalledOnce();
		expect(mount).toHaveBeenCalledWith(snapshot);
		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith(10, 0);
		app.destroy();
	});

	test("keeps real lyrics DOM after a backward seek probe and a later resume", async () => {
		const { spicetify } = createSpicetify();
		let progressMs = 8_000;
		spicetify.Player.getProgress = () => progressMs;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:revealed-seek-dom");
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				setPlaying: (isPlaying: boolean) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			currentTrack: TrackIdentity;
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
			tick: (deltaTimeSec: number) => void;
			onPlaybackChanged: (isPlaying: boolean) => void;
		};
		internals.session = { root, setCover: vi.fn(), setPlaying: vi.fn(), applyTheme: vi.fn() };
		internals.currentTrack = track;
		internals.lyricsService = {
			load: vi.fn(async () => readyLoadStateAt(track, 10)),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};
		internals.introGate.beginTrackEpoch();
		internals.isPlaybackActive = true;
		await internals.loadCurrentTrack(false);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();

		progressMs = 0;
		internals.tick(0.25);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();
		expect(root.querySelector(".track-metadata-scene")).toBeNull();

		internals.onPlaybackChanged(false);
		internals.onPlaybackChanged(true);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();
		expect(root.querySelector(".track-metadata-scene")).toBeNull();
		app.destroy();
	});

	test.each([
		{ delayMs: 1_000, initialTimestampSec: 9, tickTimestampSec: 12 },
		{ delayMs: -1_000, initialTimestampSec: 11, tickTimestampSec: 14 },
	])("uses the synchronized timestamp with a $delayMs ms lyric delay for accept, tick, and resume", ({
		delayMs,
		initialTimestampSec,
		tickTimestampSec,
	}) => {
		const { spicetify } = createSpicetify();
		let playerProgressMs = 10_000;
		spicetify.Player.getProgress = vi.fn(() => playerProgressMs);
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack(`spotify:track:delay-${delayMs}`);
		const snapshot = readySnapshotAt(track, 20);
		const mount = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement; setPlaying: (isPlaying: boolean) => void };
			settings: { get: () => ExtensionSettings; update: (patch: Partial<ExtensionSettings>) => void };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			introGate: IntroPresentationGate;
			isPlaybackActive: boolean;
			playbackSynchronizer: PlaybackSynchronizer;
			renderer: { update: (timestampSec: number, deltaTimeSec: number) => void };
			mountReadySnapshot: typeof mount;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			tick: (deltaTimeSec: number) => void;
			onPlaybackChanged: (isPlaying: boolean) => void;
		};
		internals.settings.update({ lyricsDelayMs: delayMs });
		internals.session = { root: document.createElement("main"), setPlaying: vi.fn() };
		internals.trackSession = { getSnapshot: () => snapshot, invalidate: vi.fn() };
		internals.mountReadySnapshot = mount;
		internals.isPlaybackActive = true;
		const update = vi.spyOn(internals.renderer, "update");
		internals.playbackSynchronizer.resync();
		internals.introGate.beginTrackEpoch();

		internals.presentReadySnapshot(snapshot);

		expect(internals.playbackSynchronizer.timestampSec).toBe(initialTimestampSec);
		expect(internals.introGate.isHolding()).toBe(true);
		playerProgressMs = 13_000;
		internals.tick(0.25);
		expect(internals.playbackSynchronizer.timestampSec).toBe(tickTimestampSec);
		expect(update).not.toHaveBeenCalled();

		internals.onPlaybackChanged(false);
		playerProgressMs = 18_000 + delayMs;
		internals.onPlaybackChanged(true);

		expect(internals.playbackSynchronizer.timestampSec).toBe(18);
		expect(mount).toHaveBeenCalledWith(snapshot);
		expect(update).toHaveBeenLastCalledWith(18, 0);
		app.destroy();
	});

	test("shows persistent metadata once at the exact outro threshold and stops lyric animation updates", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:outro-exact", { durationMs: 12_000 });
		const snapshot = outroSnapshot(track);
		let timestampSec = 9.999;
		const showTrackMetadata = vi.fn();
		const update = vi.fn();
		const mount = vi.fn();
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			update: (deltaTimeSec: number) => {
				timestampSec += deltaTimeSec;
			},
			resync: vi.fn(),
		};
		const internals = app as unknown as {
			session: { root: HTMLElement };
			playbackSynchronizer: typeof synchronizer;
			renderer: { destroy: () => void; showTrackMetadata: typeof showTrackMetadata; update: typeof update };
			mountReadySnapshot: typeof mount;
			isPlaybackActive: boolean;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			tick: (deltaTimeSec: number) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main") };
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = mount;
		internals.isPlaybackActive = true;

		internals.presentReadySnapshot(snapshot);
		expect(mount).toHaveBeenCalledOnce();
		expect(update).toHaveBeenLastCalledWith(9.999, 0);

		internals.tick(0.001);

		expect(showTrackMetadata).toHaveBeenCalledOnce();
		expect(showTrackMetadata).toHaveBeenCalledWith(internals.session.root, { mode: "persistent", track }, internalsSettingsOf(app), {
			direction: "up",
			animate: true,
		});
		expect(update).toHaveBeenCalledTimes(1);

		internals.tick(1);

		expect(showTrackMetadata).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledTimes(1);
		app.destroy();
	});

	test("renders a ready load accepted at the outro threshold directly as metadata without mounting lyrics", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 10_000;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:late-outro-load", { durationMs: 12_000 });
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		await internals.onTrackChanged(track);
		internals.session = { root, setCover: vi.fn(), applyTheme: vi.fn() };
		internals.lyricsService = {
			load: vi.fn(async () => readyLoadStateAt(track, 4)),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};
		const mount = vi.spyOn(internals, "mountReadySnapshot");

		await internals.loadCurrentTrack(false);

		expect(mount).not.toHaveBeenCalled();
		expect(root.querySelector(".lyrics-track")).toBeNull();
		expect(root.querySelector(".track-metadata-scene.persistent .track-metadata-title")?.textContent).toBe(track.title);
		app.destroy();
	});

	test("reopens beyond the outro threshold directly to metadata while the refreshed load is pending", async () => {
		const { spicetify } = createSpicetify();
		const track = metadataTrack("spotify:track:outro-reopen", { durationMs: 12_000 });
		let progressMs = 9_000;
		spicetify.Player.getProgress = () => progressMs;
		spicetify.Player.data = {
			item: {
				uri: track.uri,
				metadata: {
					title: track.title,
					artist_name: track.artist,
					album_title: track.album,
					duration: String(track.durationMs),
				},
			},
		};
		spicetify.URI = { isTrack: () => true, isLocalTrack: () => false };
		const app = new ExtensionApp(spicetify);
		const roots: HTMLElement[] = [];
		const reopenResult = deferred<LyricsLoadState>();
		const open = vi.fn(async () => {
			const root = document.createElement("main");
			roots.push(root);
			return {
				window,
				root,
				setCover: vi.fn(),
				setPlaying: vi.fn(),
				applyTheme: vi.fn(),
				applySettings: vi.fn(),
			};
		});
		vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
		const internals = app as unknown as {
			pip: { open: typeof open; close: () => void };
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			mountReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			openPip: () => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
		};
		internals.pip = { open, close: vi.fn() };
		internals.lyricsService = {
			load: vi
				.fn()
				.mockResolvedValueOnce(readyLoadStateAt(track, 4))
				.mockImplementationOnce(() => reopenResult.promise),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};
		const mount = vi.spyOn(internals, "mountReadySnapshot");

		await internals.openPip();
		expect(roots[0]?.querySelector(".lyrics-track")).not.toBeNull();
		internals.closePip(false);
		progressMs = 10_000;
		mount.mockClear();

		const reopening = internals.openPip();
		await vi.waitFor(() => expect(roots).toHaveLength(2));

		expect(mount).not.toHaveBeenCalled();
		expect(roots[1]?.querySelector(".lyrics-track")).toBeNull();
		expect(roots[1]?.querySelector(".track-metadata-scene.persistent .track-metadata-title")?.textContent).toBe(track.title);
		reopenResult.resolve(readyLoadStateAt(track, 4));
		await reopening;
		internals.closePip(false);
		app.destroy();
	});

	test("resyncs paused progress seeks across the outro threshold and restores the latest lyrics immediately", async () => {
		const { spicetify } = createSpicetify();
		let progressMs = 9_000;
		let progressListener: ((event: { data: number }) => void) | undefined;
		spicetify.Player.getProgress = () => progressMs;
		spicetify.Player.addEventListener = vi.fn((event: string, listener: (event: { data: number }) => void) => {
			if (event === "onprogress") progressListener = listener;
		});
		const app = new ExtensionApp(spicetify);
		app.start();
		const track = metadataTrack("spotify:track:paused-outro-seek", { durationMs: 12_000 });
		const initial = outroSnapshot(track, 7);
		const latest = outroSnapshot(track, 8, "cache");
		const showTrackMetadata = vi.fn();
		const update = vi.fn();
		const mount = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement; setPlaying: (isPlaying: boolean) => void };
			playbackSynchronizer: PlaybackSynchronizer;
			renderer: { destroy: () => void; showTrackMetadata: typeof showTrackMetadata; update: typeof update };
			mountReadySnapshot: typeof mount;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			onPlaybackChanged: (isPlaying: boolean) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main"), setPlaying: vi.fn() };
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = mount;
		internals.playbackSynchronizer.resync();
		internals.presentReadySnapshot(initial);
		internals.presentReadySnapshot(latest);
		mount.mockClear();
		update.mockClear();
		showTrackMetadata.mockClear();

		internals.onPlaybackChanged(false);
		expect(showTrackMetadata).not.toHaveBeenCalled();

		progressMs = 10_000;
		progressListener?.({ data: progressMs });
		expect(showTrackMetadata).toHaveBeenCalledOnce();

		progressMs = 9_000;
		progressListener?.({ data: progressMs });
		expect(mount).toHaveBeenCalledWith(latest);
		expect(update).toHaveBeenCalledWith(9, 0);

		progressMs = 10_000;
		progressListener?.({ data: progressMs });
		expect(showTrackMetadata).toHaveBeenCalledTimes(2);

		const resync = vi.spyOn(internals.playbackSynchronizer, "resync");
		app.destroy();
		const callsAfterDestroy = resync.mock.calls.length;
		progressMs = 9_000;
		progressListener?.({ data: progressMs });
		expect(resync).toHaveBeenCalledTimes(callsAfterDestroy);
	});

	test("keeps a held intro unchanged for regular playing progress events", async () => {
		const { spicetify } = createSpicetify();
		let progressMs = 0;
		let progressListener: ((event: { data: number }) => void) | undefined;
		spicetify.Player.getProgress = () => progressMs;
		spicetify.Player.addEventListener = vi.fn((event: string, listener: (event: { data: number }) => void) => {
			if (event === "onprogress") progressListener = listener;
		});
		const app = new ExtensionApp(spicetify);
		app.start();
		const track = metadataTrack("spotify:track:playing-progress-intro", { durationMs: 20_000 });
		const snapshot = readySnapshotAt(track, 10);
		const mount = vi.fn();
		const resume = vi.spyOn(introGateOf(app), "resume");
		const internals = app as unknown as {
			session: { root: HTMLElement };
			isPlaybackActive: boolean;
			mountReadySnapshot: typeof mount;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main") };
		internals.mountReadySnapshot = mount;
		internals.isPlaybackActive = true;
		internals.presentReadySnapshot(snapshot);
		expect(introGateOf(app).isHolding()).toBe(true);

		progressMs = 8_000;
		progressListener?.({ data: progressMs });

		expect(resume).not.toHaveBeenCalled();
		expect(mount).not.toHaveBeenCalled();
		expect(introGateOf(app).isHolding()).toBe(true);
		app.destroy();
	});

	test.each([
		{
			name: "static lyrics",
			lyrics: { type: "static", lines: [{ text: "Untimed" }] } as LyricsDocument,
			durationMs: 12_000,
		},
		{
			name: "interlude-only lyrics",
			lyrics: {
				type: "line",
				startTime: 0,
				endTime: 12,
				content: [{ type: "interlude", startTime: 0, endTime: 12 }],
			} as LyricsDocument,
			durationMs: 12_000,
		},
		{
			name: "a tail shorter than two seconds",
			lyrics: outroSnapshot(metadataTrack("spotify:track:short-tail-fixture"), 8).lyrics,
			durationMs: 9_999,
		},
	])("keeps $name in the lyrics presentation after any timestamp", async ({ name, lyrics, durationMs }) => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack(`spotify:track:no-outro-${name}`, { durationMs });
		const snapshot = readySnapshotWithLyrics(track, lyrics);
		const mount = vi.fn();
		const showTrackMetadata = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement };
			playbackSynchronizer: { timestampSec: number };
			renderer: { destroy: () => void; showTrackMetadata: typeof showTrackMetadata; update: () => void };
			mountReadySnapshot: typeof mount;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main") };
		internals.playbackSynchronizer = { timestampSec: 100 };
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update: vi.fn() };
		internals.mountReadySnapshot = mount;

		internals.presentReadySnapshot(snapshot);

		expect(mount).toHaveBeenCalledWith(snapshot);
		expect(showTrackMetadata).not.toHaveBeenCalled();
		app.destroy();
	});

	test("allows an outro threshold exactly equal to the track duration", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:outro-at-duration", { durationMs: 10_000 });
		const snapshot = outroSnapshot(track);
		const mount = vi.fn();
		const showTrackMetadata = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement };
			playbackSynchronizer: { timestampSec: number };
			renderer: { destroy: () => void; showTrackMetadata: typeof showTrackMetadata; update: () => void };
			mountReadySnapshot: typeof mount;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main") };
		internals.playbackSynchronizer = { timestampSec: 10 };
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update: vi.fn() };
		internals.mountReadySnapshot = mount;

		internals.presentReadySnapshot(snapshot);

		expect(mount).not.toHaveBeenCalled();
		expect(showTrackMetadata).toHaveBeenCalledOnce();
		app.destroy();
	});

	test("resyncs both pause and resume while applying the intro immediate threshold only on resume", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:pause-resume-outro", { durationMs: 12_000 });
		const snapshot = outroSnapshot(track);
		let playerTimestampSec = 9;
		let timestampSec = 0;
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			resync: vi.fn(() => {
				timestampSec = playerTimestampSec;
			}),
		};
		const showTrackMetadata = vi.fn();
		const resume = vi.spyOn(introGateOf(app), "resume");
		const internals = app as unknown as {
			session: { root: HTMLElement; setPlaying: (isPlaying: boolean) => void };
			playbackSynchronizer: typeof synchronizer;
			renderer: { destroy: () => void; showTrackMetadata: typeof showTrackMetadata; update: () => void };
			mountReadySnapshot: () => void;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			onPlaybackChanged: (isPlaying: boolean) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main"), setPlaying: vi.fn() };
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update: vi.fn() };
		internals.mountReadySnapshot = vi.fn();
		internals.playbackSynchronizer.resync();
		internals.presentReadySnapshot(snapshot);
		resume.mockClear();
		synchronizer.resync.mockClear();

		internals.onPlaybackChanged(false);

		expect(synchronizer.resync).toHaveBeenCalledOnce();
		expect(resume).not.toHaveBeenCalled();
		expect(showTrackMetadata).not.toHaveBeenCalled();

		playerTimestampSec = 10;
		internals.onPlaybackChanged(true);

		expect(synchronizer.resync).toHaveBeenCalledTimes(2);
		expect(resume).toHaveBeenCalledWith(10);
		expect(showTrackMetadata).toHaveBeenCalledOnce();
		app.destroy();
	});

	test("uses a fresh outro epoch for repeated URIs and preserves only the URI across PiP close", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const internals = app as unknown as {
			outroController?: OutroPresentationController;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			closePip: (closeWindow?: boolean) => void;
		};
		expect(internals.outroController).toBeDefined();
		if (!internals.outroController) return;
		const track = metadataTrack("spotify:track:repeated-outro", { durationMs: 12_000 });
		const snapshot = outroSnapshot(track);
		const beginTrackEpoch = vi.spyOn(internals.outroController, "beginTrackEpoch");
		const endTrackEpoch = vi.spyOn(internals.outroController, "endTrackEpoch");
		const discardSession = vi.spyOn(internals.outroController, "discardSession");

		await internals.onTrackChanged(track);
		expect(internals.outroController.accept(snapshot, internalsSettingsOf(app), 10).kind).toBe("show-metadata");
		await internals.onTrackChanged(track);

		expect(beginTrackEpoch).toHaveBeenCalledTimes(2);
		expect(internals.outroController.currentKind()).toBe("inactive");

		expect(internals.outroController.accept(snapshot, internalsSettingsOf(app), 10).kind).toBe("show-metadata");
		internals.closePip(false);
		expect(discardSession).toHaveBeenCalledOnce();
		expect(internals.outroController.currentKind()).toBe("inactive");
		expect(internals.outroController.accept(snapshot, internalsSettingsOf(app), 10).kind).toBe("show-metadata");

		await internals.onTrackChanged(undefined);
		expect(endTrackEpoch).toHaveBeenCalledOnce();
		expect(internals.outroController.currentKind()).toBe("inactive");

		await internals.onTrackChanged(track);
		app.destroy();
		expect(endTrackEpoch).toHaveBeenCalledTimes(2);
	});

	test("clears the outro session when a non-ready load replaces the current ready snapshot", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 10_000;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:non-ready-outro", { durationMs: 12_000 });
		const internals = app as unknown as {
			session: { root: HTMLElement; setCover: (url?: string) => void; applyTheme: (theme?: TrackTheme) => void };
			outroController?: OutroPresentationController;
			revealedSnapshot?: ReadyTrackSessionSnapshot;
			lyricsService: { load: () => Promise<LyricsLoadState>; refreshCooldowns: () => void; invalidate: () => void };
			playbackSynchronizer: PlaybackSynchronizer;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		expect(internals.outroController).toBeDefined();
		if (!internals.outroController) return;
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main"), setCover: vi.fn(), applyTheme: vi.fn() };
		internals.playbackSynchronizer.resync();
		internals.presentReadySnapshot(outroSnapshot(track));
		expect(internals.outroController.currentKind()).toBe("metadata");
		internals.lyricsService = {
			load: vi.fn(async (): Promise<LyricsLoadState> => ({ status: "error", track, message: "offline" })),
			refreshCooldowns: vi.fn(),
			invalidate: vi.fn(),
		};

		await internals.loadCurrentTrack(true);

		expect(internals.outroController.currentKind()).toBe("inactive");
		expect(internals.revealedSnapshot).toBeUndefined();
		app.destroy();
	});

	test("uses the latest enriched snapshot when a later outro threshold is crossed", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:enriched-outro", { durationMs: 16_000 });
		const initial = outroSnapshot(track, 8);
		const enriched = outroSnapshot(track, 12, "cache");
		let timestampSec = 11;
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			update: (deltaTimeSec: number) => {
				timestampSec += deltaTimeSec;
			},
			resync: vi.fn(),
		};
		const showTrackMetadata = vi.fn();
		const mount = vi.fn();
		const update = vi.fn();
		const session = { root: document.createElement("main") };
		const internals = app as unknown as {
			session: typeof session;
			currentTrack: TrackIdentity;
			trackSession: { isCurrent: (snapshot: TrackSessionSnapshot) => boolean; invalidate: () => void };
			playbackSynchronizer: typeof synchronizer;
			renderer: { destroy: () => void; showTrackMetadata: typeof showTrackMetadata; update: typeof update };
			mountReadySnapshot: typeof mount;
			isPlaybackActive: boolean;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			renderEnrichment: (
				enrichment: Promise<ReadyTrackSessionSnapshot | undefined>,
				initialSnapshot: ReadyTrackSessionSnapshot,
				track: TrackIdentity,
				activeSession: typeof session
			) => Promise<void>;
			tick: (deltaTimeSec: number) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = session;
		internals.currentTrack = track;
		internals.trackSession = { isCurrent: (snapshot) => snapshot === enriched, invalidate: vi.fn() };
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = mount;
		internals.isPlaybackActive = true;

		internals.presentReadySnapshot(initial);
		expect(showTrackMetadata).toHaveBeenCalledOnce();
		await internals.renderEnrichment(Promise.resolve(enriched), initial, track, session);

		expect(mount).toHaveBeenCalledWith(enriched);
		expect(update).toHaveBeenCalledWith(11, 0);
		internals.tick(3);
		expect(showTrackMetadata).toHaveBeenCalledTimes(2);
		expect(showTrackMetadata).toHaveBeenLastCalledWith(session.root, { mode: "persistent", track }, internalsSettingsOf(app), {
			direction: "up",
			animate: true,
		});
		app.destroy();
	});

	test("moves the outro threshold in both directions after structural sync-preference settings", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:settings-outro", { durationMs: 16_000 });
		const snapshot = readySyllableSnapshot(track, 8, 10);
		const settings = app as unknown as {
			settings: { get: () => ExtensionSettings; update: (patch: Partial<ExtensionSettings>) => void };
			appliedSettings: ExtensionSettings;
		};
		settings.settings.update({ syncPreference: "prefer-syllable" });
		settings.appliedSettings = settings.settings.get();
		const showTrackMetadata = vi.fn();
		const mount = vi.fn();
		const update = vi.fn();
		const synchronizer = { timestampSec: 13, resync: vi.fn() };
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: (settings: ExtensionSettings) => void };
			trackSession: {
				getSnapshot: () => TrackSessionSnapshot;
				updateSettings: (settings: ExtensionSettings) => Promise<TrackSessionSnapshot | undefined>;
				isCurrent: (snapshot: TrackSessionSnapshot) => boolean;
				invalidate: () => void;
			};
			playbackSynchronizer: typeof synchronizer;
			renderer: {
				destroy: () => void;
				applySettings: (settings: ExtensionSettings) => void;
				showTrackMetadata: typeof showTrackMetadata;
				update: typeof update;
			};
			mountReadySnapshot: typeof mount;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			applySettings: () => Promise<void>;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.trackSession = {
			getSnapshot: () => snapshot,
			updateSettings: vi.fn(async () => snapshot),
			isCurrent: (candidate) => candidate === snapshot,
			invalidate: vi.fn(),
		};
		internals.playbackSynchronizer = synchronizer;
		internals.renderer = { destroy: vi.fn(), applySettings: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = mount;

		internals.presentReadySnapshot(snapshot);
		expect(mount).toHaveBeenCalledOnce();
		settings.settings.update({ syncPreference: "line-only" });
		await internals.applySettings();
		expect(showTrackMetadata).toHaveBeenCalledOnce();

		settings.settings.update({ syncPreference: "prefer-syllable" });
		await internals.applySettings();

		expect(mount).toHaveBeenCalledTimes(2);
		expect(mount).toHaveBeenLastCalledWith(snapshot);
		expect(update).toHaveBeenLastCalledWith(13, 0);
		app.destroy();
	});

	test.each([
		{ delayMs: 1_000, initialProgressMs: 10_000, thresholdProgressMs: 11_000 },
		{ delayMs: -1_000, initialProgressMs: 8_000, thresholdProgressMs: 9_000 },
	])("shares one synchronized timestamp with renderer and outro policy for a $delayMs ms delay", async ({
		delayMs,
		initialProgressMs,
		thresholdProgressMs,
	}) => {
		const { spicetify } = createSpicetify();
		let progressMs = initialProgressMs;
		spicetify.Player.getProgress = () => progressMs;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack(`spotify:track:outro-delay-${delayMs}`, { durationMs: 12_000 });
		const snapshot = outroSnapshot(track);
		const internals = app as unknown as {
			settings: { update: (patch: Partial<ExtensionSettings>) => void };
			session: { root: HTMLElement; setPlaying: (isPlaying: boolean) => void };
			outroController?: OutroPresentationController;
			playbackSynchronizer: PlaybackSynchronizer;
			renderer: { destroy: () => void; showTrackMetadata: () => void; update: (timestampSec: number, deltaTimeSec: number) => void };
			mountReadySnapshot: () => void;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			onPlaybackChanged: (isPlaying: boolean) => void;
		};
		internals.settings.update({ lyricsDelayMs: delayMs });
		await internals.onTrackChanged(track);
		expect(internals.outroController).toBeDefined();
		if (!internals.outroController) return;
		internals.session = { root: document.createElement("main"), setPlaying: vi.fn() };
		const update = vi.fn();
		const showTrackMetadata = vi.fn();
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = vi.fn();
		const accept = vi.spyOn(internals.outroController, "accept");
		const evaluate = vi.spyOn(internals.outroController, "evaluate");
		internals.playbackSynchronizer.resync();

		internals.presentReadySnapshot(snapshot);

		expect(accept.mock.calls[0]?.[2]).toBe(9);
		expect(update).toHaveBeenCalledWith(9, 0);

		progressMs = thresholdProgressMs;
		internals.onPlaybackChanged(false);

		expect(evaluate).toHaveBeenLastCalledWith(10);
		expect(showTrackMetadata).toHaveBeenCalledOnce();
		app.destroy();
	});

	test("reevaluates a paused lyrics outro immediately when a runtime delay change moves playback past the threshold", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 10_000;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:runtime-delay-forward", { durationMs: 12_000 });
		const snapshot = outroSnapshot(track);
		const showTrackMetadata = vi.fn();
		const update = vi.fn();
		const mount = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: (settings: ExtensionSettings) => void };
			currentTrack: TrackIdentity;
			settings: { get: () => ExtensionSettings; update: (patch: Partial<ExtensionSettings>) => void };
			appliedSettings: ExtensionSettings;
			playbackSynchronizer: PlaybackSynchronizer;
			renderer: {
				destroy: () => void;
				applySettings: (settings: ExtensionSettings) => void;
				showTrackMetadata: typeof showTrackMetadata;
				update: typeof update;
			};
			mountReadySnapshot: typeof mount;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			applySettings: () => Promise<void>;
		};
		internals.settings.update({ lyricsDelayMs: 1_000 });
		internals.appliedSettings = internals.settings.get();
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = track;
		internals.renderer = { destroy: vi.fn(), applySettings: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = mount;
		internals.playbackSynchronizer.resync();
		internals.presentReadySnapshot(snapshot);
		expect(outroControllerOf(app).currentKind()).toBe("lyrics");
		mount.mockClear();
		update.mockClear();

		internals.settings.update({ lyricsDelayMs: 500 });
		await internals.applySettings();

		expect(outroControllerOf(app).currentKind()).toBe("lyrics");
		expect(showTrackMetadata).not.toHaveBeenCalled();
		expect(mount).not.toHaveBeenCalled();
		expect(update).toHaveBeenCalledWith(9.5, 0);

		update.mockClear();
		internals.settings.update({ lyricsDelayMs: 0 });
		await internals.applySettings();

		expect(outroControllerOf(app).currentKind()).toBe("metadata");
		expect(showTrackMetadata).toHaveBeenCalledOnce();
		expect(update).not.toHaveBeenCalled();
		app.destroy();
	});

	test("restores the latest lyrics immediately when a paused runtime delay change moves playback before the threshold", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.getProgress = () => 10_000;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:runtime-delay-backward", { durationMs: 12_000 });
		const initial = outroSnapshot(track, 7);
		const latest = outroSnapshot(track, 8, "cache");
		const showTrackMetadata = vi.fn();
		const update = vi.fn();
		const mount = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement; applySettings: (settings: ExtensionSettings) => void };
			currentTrack: TrackIdentity;
			settings: { update: (patch: Partial<ExtensionSettings>) => void };
			playbackSynchronizer: PlaybackSynchronizer;
			renderer: {
				destroy: () => void;
				applySettings: (settings: ExtensionSettings) => void;
				showTrackMetadata: typeof showTrackMetadata;
				update: typeof update;
			};
			mountReadySnapshot: typeof mount;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			applySettings: () => Promise<void>;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = track;
		internals.renderer = { destroy: vi.fn(), applySettings: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = mount;
		internals.playbackSynchronizer.resync();
		internals.presentReadySnapshot(initial);
		internals.presentReadySnapshot(latest);
		expect(outroControllerOf(app).currentKind()).toBe("metadata");
		mount.mockClear();
		update.mockClear();

		internals.settings.update({ lyricsDelayMs: 1_000 });
		await internals.applySettings();

		expect(outroControllerOf(app).currentKind()).toBe("lyrics");
		expect(mount).toHaveBeenCalledOnce();
		expect(mount).toHaveBeenCalledWith(latest);
		expect(update).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledWith(9, 0);
		app.destroy();
	});

	test("restores lyrics once after a playing seek snap below the outro threshold and shows metadata once when playback crosses again", async () => {
		const { spicetify } = createSpicetify();
		const getProgress = vi.fn().mockReturnValueOnce(10_000).mockReturnValueOnce(9_000).mockReturnValue(10_000);
		spicetify.Player.getProgress = getProgress;
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:playing-outro-seek", { durationMs: 12_000 });
		const snapshot = outroSnapshot(track);
		const showTrackMetadata = vi.fn();
		const update = vi.fn();
		const mount = vi.fn();
		const internals = app as unknown as {
			session: { root: HTMLElement };
			currentTrack: TrackIdentity;
			playbackSynchronizer: PlaybackSynchronizer;
			renderer: { destroy: () => void; showTrackMetadata: typeof showTrackMetadata; update: typeof update };
			mountReadySnapshot: typeof mount;
			isPlaybackActive: boolean;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			tick: (deltaTimeSec: number) => void;
		};
		await internals.onTrackChanged(track);
		internals.session = { root: document.createElement("main") };
		internals.currentTrack = track;
		internals.renderer = { destroy: vi.fn(), showTrackMetadata, update };
		internals.mountReadySnapshot = mount;
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer.resync();
		internals.presentReadySnapshot(snapshot);
		expect(outroControllerOf(app).currentKind()).toBe("metadata");
		showTrackMetadata.mockClear();
		mount.mockClear();
		update.mockClear();

		internals.tick(0.25);

		expect(outroControllerOf(app).currentKind()).toBe("lyrics");
		expect(mount).toHaveBeenCalledOnce();
		expect(mount).toHaveBeenCalledWith(snapshot);
		expect(update).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledWith(9, 0);
		expect(showTrackMetadata).not.toHaveBeenCalled();

		internals.tick(1);

		expect(outroControllerOf(app).currentKind()).toBe("metadata");
		expect(showTrackMetadata).toHaveBeenCalledOnce();
		expect(mount).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledOnce();
		app.destroy();
	});

	test("applies reduced motion to a single immediate outro metadata scene", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const track = metadataTrack("spotify:track:reduced-motion-outro", { durationMs: 12_000 });
		const snapshot = outroSnapshot(track);
		let timestampSec = 9;
		const synchronizer = {
			get timestampSec() {
				return timestampSec;
			},
			update: () => {
				timestampSec = 10;
			},
			resync: vi.fn(),
		};
		const root = document.createElement("main");
		const internals = app as unknown as {
			settings: { update: (patch: Partial<ExtensionSettings>) => void };
			session: { root: HTMLElement };
			playbackSynchronizer: typeof synchronizer;
			isPlaybackActive: boolean;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
			presentReadySnapshot: (snapshot: ReadyTrackSessionSnapshot) => void;
			tick: (deltaTimeSec: number) => void;
		};
		internals.settings.update({ reduceMotion: true });
		await internals.onTrackChanged(track);
		internals.session = { root };
		internals.playbackSynchronizer = synchronizer;
		internals.isPlaybackActive = true;
		internals.presentReadySnapshot(snapshot);
		expect(root.querySelector(".lyrics-track")).not.toBeNull();

		internals.tick(1);

		expect(root.children).toHaveLength(1);
		expect(root.querySelector(".lyrics-track")).toBeNull();
		expect(root.querySelector(".track-metadata-scene.persistent")).not.toBeNull();
		expect(root.className).not.toContain("scene-transition-");
		app.destroy();
	});

	test("starts and applies the complete track theme without blocking lyrics loading", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:accent",
				metadata: {
					title: "Accent Track",
					artist_name: "Aura",
					album_title: "Palette",
					duration: "180000",
					image_url: "https://example.com/cover.jpg",
				},
			},
		};
		spicetify.URI = {
			isTrack: () => true,
			isLocalTrack: () => false,
		};
		const colors = {
			DARK_VIBRANT: "#101010",
			DESATURATED: "#777777",
			LIGHT_VIBRANT: "#eeeeee",
			PROMINENT: "#abcdef",
			VIBRANT: "#ff00aa",
			VIBRANT_NON_ALARMING: "#2d9cdb",
		};
		spicetify.colorExtractor = vi.fn(async () => colors);
		const app = new ExtensionApp(spicetify);
		const applyTheme = vi.fn();
		let resolveLyrics!: (value: { status: "empty"; reason: "no-synced-lyrics"; track: { title: string } }) => void;
		const lyricsResult = new Promise<{ status: "empty"; reason: "no-synced-lyrics"; track: { title: string } }>((resolve) => {
			resolveLyrics = resolve;
		});
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			lyricsService: {
				load: () => Promise<{ status: "empty"; reason: "no-synced-lyrics"; track: { title: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			applyTheme,
		};
		internals.lyricsService = {
			load: vi.fn(() => lyricsResult),
		};

		const loading = internals.loadCurrentTrack(false);
		await vi.waitFor(() => expect(applyTheme).toHaveBeenCalledOnce());

		expect(spicetify.colorExtractor).toHaveBeenCalledWith("spotify:track:accent");
		expect(applyTheme).toHaveBeenCalledWith(buildTrackTheme(colors));
		resolveLyrics({ status: "empty", reason: "no-synced-lyrics", track: { title: "Accent Track" } });
		await loading;
	});

	test("does not apply an older theme generation when the same track is reloaded", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:same-theme",
				metadata: {
					title: "Same Theme",
					artist_name: "Aura",
					album_title: "Generations",
					duration: "180000",
				},
			},
		};
		spicetify.URI = {
			isTrack: () => true,
			isLocalTrack: () => false,
		};
		const olderColors = {
			DARK_VIBRANT: "#101010",
			DESATURATED: "#777777",
			LIGHT_VIBRANT: "#eeeeee",
			PROMINENT: "#112233",
			VIBRANT: "#ff00aa",
			VIBRANT_NON_ALARMING: "#2d9cdb",
		};
		const newerColors = { ...olderColors, PROMINENT: "#f0e2c4", VIBRANT_NON_ALARMING: "#8a4fff" };
		const olderResult = deferred<typeof olderColors>();
		const newerResult = deferred<typeof newerColors>();
		spicetify.colorExtractor = vi.fn().mockReturnValueOnce(olderResult.promise).mockReturnValueOnce(newerResult.promise);
		const app = new ExtensionApp(spicetify);
		const applyTheme = vi.fn();
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			lyricsService: {
				load: () => Promise<{ status: "empty"; reason: "no-synced-lyrics"; track: { title: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			applyTheme,
		};
		internals.lyricsService = {
			load: vi.fn(async () => ({ status: "empty", reason: "no-synced-lyrics", track: { title: "Same Theme" } }) as const),
		};

		await internals.loadCurrentTrack(false);
		await internals.loadCurrentTrack(false);
		newerResult.resolve(newerColors);
		await vi.waitFor(() => expect(applyTheme).toHaveBeenCalledWith(buildTrackTheme(newerColors)));
		olderResult.resolve(olderColors);
		await Promise.resolve();
		await Promise.resolve();

		expect(applyTheme).toHaveBeenCalledTimes(1);
	});

	test("clears the previous cover and theme when the player loses its current track", async () => {
		const { spicetify } = createSpicetify();
		const track = metadataTrack("spotify:track:disappearing");
		const firstColors = {
			DARK_VIBRANT: "#101010",
			DESATURATED: "#777777",
			LIGHT_VIBRANT: "#eeeeee",
			PROMINENT: "#18324a",
			VIBRANT: "#ff00aa",
			VIBRANT_NON_ALARMING: "#2d9cdb",
		};
		const delayedColors = { ...firstColors, PROMINENT: "#f0e2c4", VIBRANT_NON_ALARMING: "#8a4fff" };
		const delayedTheme = deferred<typeof delayedColors>();
		spicetify.colorExtractor = vi.fn().mockResolvedValueOnce(firstColors).mockReturnValueOnce(delayedTheme.promise);
		const app = new ExtensionApp(spicetify);
		const setCover = vi.fn();
		const applyTheme = vi.fn();
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			currentTrack?: TrackIdentity;
			lyricsService: { invalidate: () => void; load: (track: TrackIdentity) => Promise<LyricsLoadState> };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
			onTrackChanged: (track: TrackIdentity | undefined) => Promise<void>;
		};
		internals.session = { root, setCover, applyTheme };
		internals.currentTrack = track;
		internals.lyricsService = {
			invalidate: vi.fn(),
			load: vi.fn(async (currentTrack): Promise<LyricsLoadState> => ({ status: "empty", track: currentTrack, reason: "no-lyrics" })),
		};

		await internals.loadCurrentTrack(false);
		await vi.waitFor(() => expect(applyTheme).toHaveBeenCalledWith(buildTrackTheme(firstColors)));
		await internals.loadCurrentTrack(false);
		expect(spicetify.colorExtractor).toHaveBeenCalledTimes(2);

		await internals.onTrackChanged(undefined);

		expect(setCover).toHaveBeenLastCalledWith(undefined);
		expect(applyTheme).toHaveBeenLastCalledWith(undefined);
		expect(root.textContent).toContain("Waiting for music");

		delayedTheme.resolve(delayedColors);
		await Promise.resolve();
		await Promise.resolve();

		expect(applyTheme).toHaveBeenCalledTimes(2);
	});

	test("ignores invalid extracted colors and falls back to the next valid palette color", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:accent-fallback",
				metadata: {
					title: "Accent Fallback",
					artist_name: "Aura",
					album_title: "Palette",
					duration: "180000",
				},
			},
		};
		spicetify.URI = {
			isTrack: () => true,
			isLocalTrack: () => false,
		};
		spicetify.colorExtractor = vi.fn(
			async () =>
				({
					DARK_VIBRANT: "#101010",
					DESATURATED: "#777777",
					LIGHT_VIBRANT: "#eeeeee",
					PROMINENT: "",
					VIBRANT: "rgb(255, 0, 170)",
					VIBRANT_NON_ALARMING: undefined,
				}) as never
		);
		const app = new ExtensionApp(spicetify);
		const applyTheme = vi.fn();
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			lyricsService: {
				load: () => Promise<{ status: "empty"; reason: "no-synced-lyrics"; track: { title: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			applyTheme,
		};
		internals.lyricsService = {
			load: vi.fn(async () => ({ status: "empty", reason: "no-synced-lyrics", track: { title: "Accent Fallback" } }) as const),
		};

		await internals.loadCurrentTrack(false);

		expect(applyTheme).toHaveBeenCalledWith(
			expect.objectContaining({ accent: "#101010", background: "#101010", foreground: "#ffffff", surfaceTone: "dark" })
		);
	});

	test("shows instrumental tracks as plain album art instead of a status card", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:instrumental",
				metadata: {
					title: "Instrumental Track",
					artist_name: "Aura",
					album_title: "Still Cover",
					duration: "180000",
					image_url: "https://i.scdn.co/image/cover",
				},
			},
		};
		spicetify.URI = {
			isTrack: () => true,
			isLocalTrack: () => false,
		};
		const app = new ExtensionApp(spicetify);
		const pipRoot = document.createElement("div");
		const content = document.createElement("main");
		pipRoot.append(content);
		const setCover = vi.fn();
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			lyricsService: {
				load: () => Promise<{ status: "empty"; reason: "instrumental"; track: { title: string; coverUrl?: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: content,
			setCover,
			applyTheme: vi.fn(),
		};
		internals.lyricsService = {
			load: vi.fn(
				async () =>
					({
						status: "empty",
						reason: "instrumental",
						track: { title: "Instrumental Track", coverUrl: "https://i.scdn.co/image/cover" },
					}) as const
			),
		};
		const acceptIntro = vi.spyOn(introGateOf(app), "accept");

		await internals.loadCurrentTrack(false);

		expect(setCover).toHaveBeenCalledWith("https://i.scdn.co/image/cover");
		expect(pipRoot.classList.contains("album-art-mode")).toBe(true);
		expect(content.children).toHaveLength(1);
		expect(content.firstElementChild?.classList.contains("album-art-scene")).toBe(true);
		expect(content.querySelector(".aura-lyrics, .status-card, .track-metadata-scene")).toBeNull();
		expect(content.textContent).not.toContain("Instrumental");
		expect(acceptIntro).not.toHaveBeenCalled();
	});

	test("clears provider cooldowns before a manual lyrics refresh", async () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const refreshCooldowns = vi.fn();
		const load = vi.fn(async () => ({
			status: "empty" as const,
			reason: "no-lyrics" as const,
			track: {
				uri: "spotify:track:refresh",
				title: "Refresh Track",
				artist: "Aura",
				album: "Manual",
				durationMs: 180000,
				isLocal: false,
			},
		}));
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			currentTrack: {
				uri: string;
				title: string;
				artist: string;
				album: string;
				durationMs: number;
				isLocal: boolean;
			};
			lyricsService: { refreshCooldowns: () => void; load: typeof load };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			applyTheme: vi.fn(),
		};
		internals.currentTrack = {
			uri: "spotify:track:refresh",
			title: "Refresh Track",
			artist: "Aura",
			album: "Manual",
			durationMs: 180000,
			isLocal: false,
		};
		internals.lyricsService = { refreshCooldowns, load };

		await internals.loadCurrentTrack(true);

		expect(refreshCooldowns).toHaveBeenCalledOnce();
		expect(refreshCooldowns.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
	});

	test("renders interlude waveforms from Spicetify audio analysis when wave style is selected", async () => {
		const { spicetify } = createSpicetify();
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 14,
			content: [
				{ type: "vocal", text: "Before", startTime: 0, endTime: 4, oppositeAligned: false },
				{ type: "interlude", startTime: 4, endTime: 10 },
				{ type: "vocal", text: "After", startTime: 10, endTime: 14, oppositeAligned: false },
			],
		};
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:wave",
				metadata: {
					title: "Wave Track",
					artist_name: "Aura",
					album_title: "Breaks",
					duration: "180000",
				},
			},
		};
		spicetify.URI = {
			isTrack: () => true,
			isLocalTrack: () => false,
		};
		spicetify.getAudioData = vi.fn(async () => ({
			track: { tempo: 150, tempo_confidence: 0.92 },
			segments: [
				{ start: 4, duration: 1, loudness_max: -28 },
				{ start: 5, duration: 1, loudness_max: -18 },
				{ start: 6, duration: 1, loudness_max: -8 },
				{ start: 7, duration: 1, loudness_max: -3 },
			],
		}));
		const app = new ExtensionApp(spicetify);
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			settings: { update: (patch: unknown) => void };
			trackSession: { getSnapshot: () => TrackSessionSnapshot };
			revealedSnapshot?: ReadyTrackSessionSnapshot;
			outroController: OutroPresentationController;
			lyricsService: { load: (track: TrackIdentity) => Promise<LyricsLoadState> };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root,
			setCover: vi.fn(),
			applyTheme: vi.fn(),
		};
		internals.settings.update({ interludeStyle: "wave" });
		internals.lyricsService = {
			load: vi.fn(
				async (track: TrackIdentity): Promise<LyricsLoadState> => ({
					status: "ready",
					track,
					lyrics,
					provider: "spotify",
					source: "network",
					diagnostics: { cache: { status: "miss" }, attempts: [] },
				})
			),
		};
		beginIntroEpoch(app);

		await internals.loadCurrentTrack(false);
		await vi.waitFor(() => expect(internals.trackSession.getSnapshot().waveformProfile).toBeDefined());
		expect(internals.outroController.currentKind()).toBe("lyrics");
		expect(internals.revealedSnapshot?.waveformProfile).toBeDefined();
		await vi.waitFor(() => expect(root.querySelector<HTMLElement>(".aura-lyrics")?.style.getPropertyValue("--interlude-wave-cycle")).toBe("1.056s"));

		expect(spicetify.getAudioData).toHaveBeenCalledWith("spotify:track:wave");
		expect(root.querySelector<HTMLElement>(".aura-lyrics")?.style.getPropertyValue("--interlude-wave-cycle")).toBe("1.056s");
		expect(root.querySelector<HTMLElement>(".interlude")?.dataset.waveformSource).toBe("audio-analysis");
		expect(root.querySelectorAll(".interlude-wave-bar").length).toBeGreaterThan(0);
	});

	test("re-synthesizes pseudo-karaoke when a new load returns different line lyrics for the same track", async () => {
		const { spicetify } = createSpicetify();
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:pseudo",
				metadata: {
					title: "Pseudo Track",
					artist_name: "Aura",
					album_title: "Karaoke",
					duration: "180000",
				},
			},
		};
		spicetify.URI = {
			isTrack: () => true,
			isLocalTrack: () => false,
		};
		spicetify.getAudioData = vi.fn(async () => buildVocalAnalysis(0, 10));
		const makeLyrics = (offset: number): LineLyrics => ({
			type: "line",
			startTime: offset,
			endTime: offset + 4,
			content: [{ type: "vocal", text: "별빛이 내린 밤에", startTime: offset, endTime: offset + 4, oppositeAligned: false }],
		});
		const lyricsA = makeLyrics(1);
		const lyricsB = makeLyrics(2);
		const readyState = (lyrics: LineLyrics) =>
			({
				status: "ready",
				lyrics,
				provider: "lrclib",
				source: "network",
				track: { uri: "spotify:track:pseudo", title: "Pseudo Track" },
			}) as const;
		const app = new ExtensionApp(spicetify);
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			lyricsService: { load: () => Promise<ReturnType<typeof readyState>> };
			trackSession: { getSnapshot: () => TrackSessionSnapshot };
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			applyTheme: vi.fn(),
		};
		internals.lyricsService = {
			load: vi.fn().mockResolvedValueOnce(readyState(lyricsA)).mockResolvedValueOnce(readyState(lyricsB)),
		};

		await internals.loadCurrentTrack(false);
		await vi.waitFor(() => expect(internals.trackSession.getSnapshot().timingSource).toBe("synthetic"));
		const snapshotA = internals.trackSession.getSnapshot();
		expect(snapshotA.loadState).toMatchObject({ status: "ready", lyrics: lyricsA });
		expect(snapshotA.lyrics?.type).toBe("syllable");
		expect(snapshotA.timingSource).toBe("synthetic");

		await internals.loadCurrentTrack(false);
		await vi.waitFor(() => expect(internals.trackSession.getSnapshot().timingSource).toBe("synthetic"));
		const snapshotB = internals.trackSession.getSnapshot();
		expect(snapshotB.loadState).toMatchObject({ status: "ready", lyrics: lyricsB });
		expect(snapshotB.lyrics).not.toBe(snapshotA.lyrics);
		expect(snapshotB.timingSource).toBe("synthetic");
	});

	test("starts audio analysis while lyrics are still loading", async () => {
		const { spicetify } = createSpicetify();
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 4,
			content: [{ type: "vocal", text: "Parallel", startTime: 0, endTime: 4, oppositeAligned: false }],
		};
		spicetify.Player.data = {
			item: {
				uri: "spotify:track:parallel",
				metadata: {
					title: "Parallel Track",
					artist_name: "Aura",
					album_title: "Fast",
					duration: "180000",
				},
			},
		};
		spicetify.URI = {
			isTrack: () => true,
			isLocalTrack: () => false,
		};
		spicetify.getAudioData = vi.fn(async () => ({
			track: { tempo: 120, tempo_confidence: 1 },
			segments: [{ start: 0, duration: 1, loudness_max: -8 }],
		}));
		let resolveLyrics: (() => void) | undefined;
		const lyricsReady = new Promise<void>((resolve) => {
			resolveLyrics = resolve;
		});
		const app = new ExtensionApp(spicetify);
		const root = document.createElement("main");
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				applyTheme: (theme?: TrackTheme) => void;
			};
			settings: { update: (patch: unknown) => void };
			lyricsService: {
				load: () => Promise<{ status: "ready"; lyrics: LineLyrics; provider: "spotify"; track: { title: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root,
			setCover: vi.fn(),
			applyTheme: vi.fn(),
		};
		internals.settings.update({ interludeStyle: "wave" });
		internals.lyricsService = {
			load: vi.fn(async () => {
				await lyricsReady;
				return {
					status: "ready",
					lyrics,
					provider: "spotify",
					track: { title: "Parallel Track" },
				} as const;
			}),
		};

		const loadPromise = internals.loadCurrentTrack(false);
		await Promise.resolve();

		expect(spicetify.getAudioData).toHaveBeenCalledWith("spotify:track:parallel");

		resolveLyrics?.();
		await loadPromise;
	});
});
