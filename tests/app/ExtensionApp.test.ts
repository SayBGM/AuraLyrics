import { describe, expect, test, vi } from "vitest";
import { ExtensionApp } from "../../src/app/ExtensionApp";
import type { LineLyrics } from "../../src/lyrics/types";
import type { SpicetifyGlobal } from "../../src/runtime/spicetify";

const createSpicetify = () => {
	const values = new Map<string, string>();
	const topbarButtons: Array<{ element: HTMLElement; active?: boolean; deregister?: () => void }> = [];
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
	} as unknown as SpicetifyGlobal;
	return { spicetify, topbarButtons };
};

describe("ExtensionApp", () => {
	test("does not register duplicate listeners when started repeatedly", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);

		app.start();
		app.start();

		expect(spicetify.Player.addEventListener).toHaveBeenCalledTimes(2);
		expect(spicetify.Topbar?.Button).toHaveBeenCalledTimes(1);
		app.destroy();
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

	test("updates PiP play state from playback callbacks instead of the lyric frame tick", () => {
		const { spicetify } = createSpicetify();
		let playbackListener: (() => void) | undefined;
		let isPlaying = true;
		const getProgress = vi.fn(() => 0);
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
			lastLoadState: { status: string };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackTimestampSec: number;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying };
		internals.lastLoadState = { status: "ready" };
		internals.renderer = { destroy: vi.fn(), update: vi.fn() };
		internals.isPlaybackActive = true;
		internals.playbackTimestampSec = 12;

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
		const getProgress = vi.fn().mockReturnValueOnce(11000).mockReturnValueOnce(5000);
		spicetify.Player.getProgress = getProgress;
		const app = new ExtensionApp(spicetify);
		const update = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			lastLoadState: { status: string };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackTimestampSec: number;
			playbackResyncElapsedSec: number;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying: vi.fn() };
		internals.lastLoadState = { status: "ready" };
		internals.renderer = { destroy: vi.fn(), update };
		internals.isPlaybackActive = true;
		internals.playbackTimestampSec = 10;
		internals.playbackResyncElapsedSec = 0;

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
		const getProgress = vi.fn(() => 45000);
		spicetify.Player.getProgress = getProgress;
		const app = new ExtensionApp(spicetify);
		const update = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			lastLoadState: { status: string };
			renderer: { destroy: () => void; update: (timestamp: number, deltaTime: number) => void };
			isPlaybackActive: boolean;
			playbackTimestampSec: number;
			playbackResyncElapsedSec: number;
			playbackSeekProbeElapsedSec: number;
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying: vi.fn() };
		internals.lastLoadState = { status: "ready" };
		internals.renderer = { destroy: vi.fn(), update };
		internals.isPlaybackActive = true;
		internals.playbackTimestampSec = 10;
		internals.playbackResyncElapsedSec = 0;
		internals.playbackSeekProbeElapsedSec = 0;

		internals.tick(0.25);

		expect(getProgress).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenLastCalledWith(45, expect.any(Number));
		app.destroy();
	});

	test("applies extracted track colors to the PiP accent without blocking lyrics loading", async () => {
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
		spicetify.colorExtractor = vi.fn(async () => ({
			DARK_VIBRANT: "#101010",
			DESATURATED: "#777777",
			LIGHT_VIBRANT: "#eeeeee",
			PROMINENT: "#abcdef",
			VIBRANT: "#ff00aa",
			VIBRANT_NON_ALARMING: "#2d9cdb",
		}));
		const app = new ExtensionApp(spicetify);
		const setAccentColor = vi.fn();
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				setAccentColor: (color?: string) => void;
			};
			lyricsService: {
				load: () => Promise<{ status: "empty"; reason: "no-synced-lyrics"; track: { title: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			setAccentColor,
		};
		internals.lyricsService = {
			load: vi.fn(async () => ({ status: "empty", reason: "no-synced-lyrics", track: { title: "Accent Track" } }) as const),
		};

		await internals.loadCurrentTrack(false);

		expect(spicetify.colorExtractor).toHaveBeenCalledWith("spotify:track:accent");
		expect(setAccentColor).toHaveBeenCalledWith("#2d9cdb");
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
		const setAccentColor = vi.fn();
		const internals = app as unknown as {
			session: {
				root: HTMLElement;
				setCover: (url?: string) => void;
				setAccentColor: (color?: string) => void;
			};
			lyricsService: {
				load: () => Promise<{ status: "empty"; reason: "no-synced-lyrics"; track: { title: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: document.createElement("main"),
			setCover: vi.fn(),
			setAccentColor,
		};
		internals.lyricsService = {
			load: vi.fn(async () => ({ status: "empty", reason: "no-synced-lyrics", track: { title: "Accent Fallback" } }) as const),
		};

		await internals.loadCurrentTrack(false);

		expect(setAccentColor).toHaveBeenCalledWith("#101010");
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
				setAccentColor: (color?: string) => void;
			};
			lyricsService: {
				load: () => Promise<{ status: "empty"; reason: "instrumental"; track: { title: string; coverUrl?: string } }>;
			};
			loadCurrentTrack: (refresh: boolean) => Promise<void>;
		};
		internals.session = {
			root: content,
			setCover,
			setAccentColor: vi.fn(),
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
				setAccentColor: (color?: string) => void;
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
			setAccentColor: vi.fn(),
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

		expect(spicetify.getAudioData).toHaveBeenCalledWith("spotify:track:wave");
		expect(root.querySelector<HTMLElement>(".aura-lyrics")?.style.getPropertyValue("--interlude-wave-cycle")).toBe("1.056s");
		expect(root.querySelector<HTMLElement>(".interlude")?.dataset.waveformSource).toBe("audio-analysis");
		expect(root.querySelectorAll(".interlude-wave-bar").length).toBeGreaterThan(0);
	});
});
