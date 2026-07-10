import { describe, expect, test, vi } from "vitest";
import { ExtensionApp } from "../../src/app/ExtensionApp";
import { type ReadyTrackSessionSnapshot, TrackSessionController, type TrackSessionSnapshot } from "../../src/app/TrackSessionController";
import { buildTrackTheme, type TrackTheme } from "../../src/app/TrackThemeService";
import type { LineLyrics, LyricsLoadState, TrackIdentity } from "../../src/lyrics/types";
import type { PlaybackSynchronizer } from "../../src/player/PlaybackSynchronizer";
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

describe("ExtensionApp", () => {
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
		await vi.waitFor(() => expect(root.querySelector("[data-aura-timing-marker]")).not.toBeNull());
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

		await internals.loadCurrentTrack(false);
		const initialLyricsScene = root.firstElementChild;
		await vi.waitFor(() => expect(internals.trackSession.getSnapshot().waveformProfile).toBeDefined());

		expect(root.textContent).toContain("Unchanged");
		expect(root.firstElementChild).toBe(initialLyricsScene);
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

		await internals.loadCurrentTrack(false);

		expect(root.querySelector(".track-metadata-title")?.textContent).toBe(track.title);
		expect(root.querySelector(".track-metadata-byline")?.textContent).toBe(`${track.artist} · ${track.album}`);
		expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
		expect(root.querySelector(".track-metadata-progress")).toBeNull();
		expect(root.querySelector(".status-card")).toBeNull();
		expect(root.querySelector("button")).toBeNull();
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
			trackSession: { updateSettings: typeof updateSettings; isCurrent: () => boolean };
			renderer: { applySettings: () => void; mount: typeof mount };
			applySettings: () => Promise<void>;
		};
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = snapshot.loadState.track;
		internals.trackSession = { updateSettings, isCurrent: () => true };
		internals.renderer = { applySettings: vi.fn(), mount };
		internals.settings.update({ showTranslation: false });

		await internals.applySettings();

		expect(updateSettings).toHaveBeenCalledOnce();
		expect(mount).toHaveBeenCalledOnce();
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
			trackSession: { updateSettings: typeof updateSettings; isCurrent: () => boolean };
			renderer: { applySettings: () => void; mount: typeof mount };
			applySettings: () => Promise<void>;
		};
		internals.session = { root: document.createElement("main"), applySettings: vi.fn() };
		internals.currentTrack = snapshot.loadState.track;
		internals.trackSession = { updateSettings, isCurrent: () => true };
		internals.renderer = { applySettings: vi.fn(), mount };

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
			renderer: { applySettings: () => void; mount: typeof mount };
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
		internals.renderer = { applySettings: vi.fn(), mount };

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

		expect(spicetify.Player.addEventListener).toHaveBeenCalledTimes(2);
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
		expect(getProgress).toHaveBeenCalledTimes(1);
		app.destroy();
	});

	test("advances lyrics from a sampled timestamp and resyncs player progress every 20 seconds", () => {
		const { spicetify } = createSpicetify();
		const getProgress = vi.fn().mockReturnValueOnce(10000).mockReturnValueOnce(11000).mockReturnValueOnce(5000);
		spicetify.Player.getProgress = getProgress;
		const app = new ExtensionApp(spicetify);
		const update = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackSynchronizer: PlaybackSynchronizer;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying: vi.fn() };
		internals.trackSession = {
			getSnapshot: () => ({ loadState: { status: "ready" } }) as unknown as TrackSessionSnapshot,
			invalidate: vi.fn(),
		};
		internals.renderer = { destroy: vi.fn(), update };
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer.resync();
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
		const update = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			trackSession: { getSnapshot: () => TrackSessionSnapshot; invalidate: () => void };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackSynchronizer: PlaybackSynchronizer;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying: vi.fn() };
		internals.trackSession = {
			getSnapshot: () => ({ loadState: { status: "ready" } }) as unknown as TrackSessionSnapshot,
			invalidate: vi.fn(),
		};
		internals.renderer = { destroy: vi.fn(), update };
		internals.isPlaybackActive = true;
		internals.playbackSynchronizer.resync();
		getProgress.mockClear();

		internals.tick(0.25);

		expect(getProgress).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenLastCalledWith(45, expect.any(Number));
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

		await internals.loadCurrentTrack(false);

		expect(setCover).toHaveBeenCalledWith("https://i.scdn.co/image/cover");
		expect(pipRoot.classList.contains("album-art-mode")).toBe(true);
		expect(content.children).toHaveLength(0);
		expect(content.textContent).not.toContain("Instrumental");
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
			load: vi.fn(
				async () =>
					({
						status: "ready",
						lyrics,
						provider: "spotify",
						track: { title: "Wave Track" },
					}) as const
			),
		};

		await internals.loadCurrentTrack(false);
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
