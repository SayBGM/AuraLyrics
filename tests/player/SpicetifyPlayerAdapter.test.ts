import { describe, expect, test, vi } from "vitest";
import { SpicetifyPlayerAdapter } from "../../src/player/SpicetifyPlayerAdapter";
import type { SpicetifyGlobal } from "../../src/runtime/spicetify";

type ProgressEvent = { data: number };

type PlayerEventListeners = {
	songchange?: () => void;
	onplaypause?: () => void;
	onprogress?: (event: ProgressEvent) => void;
};

const createSpicetify = (overrides: Partial<SpicetifyGlobal["Player"]>): SpicetifyGlobal =>
	({
		Player: {
			addEventListener: vi.fn(),
			getDuration: () => 0,
			getProgress: () => 0,
			...overrides,
		},
	}) as unknown as SpicetifyGlobal;

const playerItem = (uri: string, durationMs: number) => ({
	uri,
	metadata: {
		title: `Title ${uri}`,
		artist_name: "Artist",
		album_title: "Album",
		duration: String(durationMs),
	},
});

const capturePlayerListeners = () => {
	const listeners: PlayerEventListeners = {};
	const addEventListener = vi.fn((event: string, listener: unknown) => {
		if (event === "songchange") listeners.songchange = listener as () => void;
		if (event === "onplaypause") listeners.onplaypause = listener as () => void;
		if (event === "onprogress") listeners.onprogress = listener as (event: ProgressEvent) => void;
	});
	return { addEventListener, listeners };
};

describe("SpicetifyPlayerAdapter", () => {
	test("subscribes to playback changes through Spicetify player events", () => {
		const addEventListener = vi.fn();
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				isPlaying: () => false,
				addEventListener,
			})
		);

		player.attach();

		expect(addEventListener).toHaveBeenCalledWith("songchange", expect.any(Function));
		expect(addEventListener).toHaveBeenCalledWith("onplaypause", expect.any(Function));
		expect(addEventListener).toHaveBeenCalledWith("onprogress", expect.any(Function));
		expect(addEventListener).toHaveBeenCalledTimes(3);
	});

	test("removes the same three player listeners when detached", () => {
		const { addEventListener, listeners } = capturePlayerListeners();
		const removeEventListener = vi.fn();
		const player = new SpicetifyPlayerAdapter(createSpicetify({ addEventListener, removeEventListener }));

		player.attach();
		player.detach();

		expect(removeEventListener).toHaveBeenCalledWith("songchange", listeners.songchange);
		expect(removeEventListener).toHaveBeenCalledWith("onplaypause", listeners.onplaypause);
		expect(removeEventListener).toHaveBeenCalledWith("onprogress", listeners.onprogress);
		expect(removeEventListener).toHaveBeenCalledTimes(3);
	});

	test("emits progress events in seconds", () => {
		const { addEventListener, listeners } = capturePlayerListeners();
		const player = new SpicetifyPlayerAdapter(createSpicetify({ addEventListener }));
		const listener = vi.fn();
		player.progressChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 12_500 });

		expect(listener).toHaveBeenCalledWith(12.5);
	});

	test("ignores non-finite and negative progress events", () => {
		const previousUri = "spotify:track:invalid-progress";
		const nextUri = "spotify:track:next";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(previousUri, 180_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const progressListener = vi.fn();
		const trackListener = vi.fn();
		player.progressChanged.subscribe(progressListener);
		player.trackChanged.subscribe(trackListener);

		player.attach();
		listeners.onprogress?.({ data: Number.NaN });
		listeners.onprogress?.({ data: Number.POSITIVE_INFINITY });
		listeners.onprogress?.({ data: -1 });
		spicetify.Player.data = { item: playerItem(nextUri, 240_000) };
		listeners.songchange?.();

		expect(progressListener).not.toHaveBeenCalled();
		expect(trackListener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: nextUri }),
			previousTrackUri: previousUri,
			previousProgressSec: undefined,
			previousDurationSec: undefined,
		});
	});

	test.each([
		{ name: "NaN", durationMs: Number.NaN },
		{ name: "infinite", durationMs: Number.POSITIVE_INFINITY },
		{ name: "zero", durationMs: 0 },
		{ name: "negative", durationMs: -1_000 },
	])("emits valid progress but stores undefined $name duration", ({ durationMs }) => {
		const previousUri = "spotify:track:invalid-duration";
		const nextUri = "spotify:track:next";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(previousUri, durationMs) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const progressListener = vi.fn();
		const trackListener = vi.fn();
		player.progressChanged.subscribe(progressListener);
		player.trackChanged.subscribe(trackListener);

		player.attach();
		listeners.onprogress?.({ data: 1_000 });
		spicetify.Player.data = { item: playerItem(nextUri, 240_000) };
		listeners.songchange?.();

		expect(progressListener).toHaveBeenCalledWith(1);
		expect(trackListener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: nextUri }),
			previousTrackUri: previousUri,
			previousProgressSec: 1,
			previousDurationSec: undefined,
		});
	});

	test("preserves previous track progress and duration in song change events", () => {
		const previousUri = "spotify:track:previous";
		const nextUri = "spotify:track:next";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(previousUri, 180_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 42_500 });
		spicetify.Player.data = { item: playerItem(nextUri, 240_000) };
		listeners.songchange?.();

		expect(listener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: nextUri }),
			previousTrackUri: previousUri,
			previousProgressSec: 42.5,
			previousDurationSec: 180,
		});
	});

	test("emits safe undefined progress context when no previous progress was observed", () => {
		const previousUri = "spotify:track:no-progress";
		const nextUri = "spotify:track:next";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(previousUri, 180_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		spicetify.Player.data = { item: playerItem(nextUri, 240_000) };
		listeners.songchange?.();

		expect(listener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: nextUri }),
			previousTrackUri: previousUri,
			previousProgressSec: undefined,
			previousDurationSec: undefined,
		});
	});

	test("keeps URI-specific progress when the new track reports progress before songchange", () => {
		const previousUri = "spotify:track:previous";
		const nextUri = "spotify:track:next";
		const finalUri = "spotify:track:final";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(previousUri, 180_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 90_000 });
		spicetify.Player.data = { item: playerItem(nextUri, 240_000) };
		listeners.onprogress?.({ data: 2_000 });
		listeners.songchange?.();

		expect(listener).toHaveBeenNthCalledWith(1, {
			track: expect.objectContaining({ uri: nextUri }),
			previousTrackUri: previousUri,
			previousProgressSec: 90,
			previousDurationSec: 180,
		});

		spicetify.Player.data = { item: playerItem(finalUri, 300_000) };
		listeners.songchange?.();

		expect(listener).toHaveBeenNthCalledWith(2, {
			track: expect.objectContaining({ uri: finalUri }),
			previousTrackUri: nextUri,
			previousProgressSec: 2,
			previousDurationSec: 240,
		});
	});

	test("prunes orphan progress slots before emitting a song change and preserves the new current slot", () => {
		const previousUri = "spotify:track:previous";
		const orphanUri = "spotify:track:orphan";
		const currentUri = "spotify:track:current";
		const finalUri = "spotify:track:final";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(previousUri, 180_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const progressSlots = () => Array.from((player as unknown as { progressByTrackUri: Map<string, unknown> }).progressByTrackUri.keys());
		const slotsAtEmit: string[][] = [];
		const listener = vi.fn(() => slotsAtEmit.push(progressSlots()));
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 90_000 });
		spicetify.Player.data = { item: playerItem(orphanUri, 200_000) };
		listeners.onprogress?.({ data: 1_000 });
		spicetify.Player.data = { item: playerItem(currentUri, 240_000) };
		listeners.onprogress?.({ data: 2_000 });
		listeners.songchange?.();

		expect(slotsAtEmit[0]).toEqual([currentUri]);
		expect(listener).toHaveBeenNthCalledWith(1, {
			track: expect.objectContaining({ uri: currentUri }),
			previousTrackUri: previousUri,
			previousProgressSec: 90,
			previousDurationSec: 180,
		});

		spicetify.Player.data = { item: playerItem(finalUri, 300_000) };
		listeners.songchange?.();

		expect(listener).toHaveBeenNthCalledWith(2, {
			track: expect.objectContaining({ uri: finalUri }),
			previousTrackUri: currentUri,
			previousProgressSec: 2,
			previousDurationSec: 240,
		});
	});

	test("preserves near-end context and the latest slot across a same-URI repeat reset", () => {
		const repeatedUri = "spotify:track:repeat";
		const nextUri = "spotify:track:next";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(repeatedUri, 180_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 179_000 });
		listeners.onprogress?.({ data: 500 });
		listeners.songchange?.();

		expect(listener).toHaveBeenNthCalledWith(1, {
			track: expect.objectContaining({ uri: repeatedUri }),
			previousTrackUri: repeatedUri,
			previousProgressSec: 179,
			previousDurationSec: 180,
		});

		spicetify.Player.data = { item: playerItem(nextUri, 240_000) };
		listeners.songchange?.();

		expect(listener).toHaveBeenNthCalledWith(2, {
			track: expect.objectContaining({ uri: nextUri }),
			previousTrackUri: repeatedUri,
			previousProgressSec: 0.5,
			previousDurationSec: 180,
		});
	});

	test.each([
		{ name: "the old sample is not near the end", previousProgressMs: 177_999, nextProgressMs: 1_000 },
		{ name: "the new sample is outside the start window", previousProgressMs: 179_000, nextProgressMs: 2_001 },
	])("keeps latest same-URI progress when $name", ({ previousProgressMs, nextProgressMs }) => {
		const repeatedUri = "spotify:track:repeat";
		const durationMs = 180_000;
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(repeatedUri, durationMs) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: previousProgressMs });
		listeners.onprogress?.({ data: nextProgressMs });
		listeners.songchange?.();

		expect(listener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: repeatedUri }),
			previousTrackUri: repeatedUri,
			previousProgressSec: nextProgressMs / 1000,
			previousDurationSec: durationMs / 1000,
		});
	});

	test("preserves a repeat candidate when a short track rewinds by exactly two seconds", () => {
		const repeatedUri = "spotify:track:short-repeat";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(repeatedUri, 4_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 3_000 });
		listeners.onprogress?.({ data: 1_000 });
		listeners.songchange?.();

		expect(listener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: repeatedUri }),
			previousTrackUri: repeatedUri,
			previousProgressSec: 3,
			previousDurationSec: 4,
		});
	});

	test("does not capture normal short-track progress growth before a repeat reset", () => {
		const repeatedUri = "spotify:track:short-growth";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			data: { item: playerItem(repeatedUri, 3_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 1_500 });
		listeners.onprogress?.({ data: 1_750 });
		listeners.onprogress?.({ data: 2_900 });
		listeners.onprogress?.({ data: 100 });
		listeners.songchange?.();

		expect(listener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: repeatedUri }),
			previousTrackUri: repeatedUri,
			previousProgressSec: 2.9,
			previousDurationSec: 3,
		});
	});

	test("clears stale progress context across detach and reattach", () => {
		const previousUri = "spotify:track:previous";
		const nextUri = "spotify:track:next";
		const { addEventListener, listeners } = capturePlayerListeners();
		const spicetify = createSpicetify({
			addEventListener,
			removeEventListener: vi.fn(),
			data: { item: playerItem(previousUri, 180_000) },
		});
		const player = new SpicetifyPlayerAdapter(spicetify);
		const listener = vi.fn();
		player.trackChanged.subscribe(listener);

		player.attach();
		listeners.onprogress?.({ data: 80_000 });
		player.detach();
		player.attach();
		spicetify.Player.data = { item: playerItem(nextUri, 240_000) };
		listeners.songchange?.();

		expect(listener).toHaveBeenCalledWith({
			track: expect.objectContaining({ uri: nextUri }),
			previousTrackUri: previousUri,
			previousProgressSec: undefined,
			previousDurationSec: undefined,
		});
	});

	test("emits playback state when Spicetify reports play/pause changes", () => {
		let playPauseListener: (() => void) | undefined;
		let isPlaying = true;
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				isPlaying: () => isPlaying,
				addEventListener: vi.fn((event: string, listener: () => void) => {
					if (event === "onplaypause") {
						playPauseListener = listener;
					}
				}),
			})
		);
		const listener = vi.fn();
		player.playbackChanged.subscribe(listener);

		player.attach();
		isPlaying = false;
		playPauseListener?.();

		expect(listener).toHaveBeenCalledWith(false);
	});

	test("uses explicit pause when currently playing", () => {
		const pause = vi.fn();
		const togglePlay = vi.fn();
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				isPlaying: () => true,
				pause,
				togglePlay,
			})
		);

		player.togglePlay();

		expect(pause).toHaveBeenCalledOnce();
		expect(togglePlay).not.toHaveBeenCalled();
	});

	test("uses explicit play when currently paused", () => {
		const play = vi.fn();
		const togglePlay = vi.fn();
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				isPlaying: () => false,
				play,
				togglePlay,
			})
		);

		player.togglePlay();

		expect(play).toHaveBeenCalledOnce();
		expect(togglePlay).not.toHaveBeenCalled();
	});

	test("falls back to togglePlay when explicit play controls are unavailable", () => {
		const togglePlay = vi.fn();
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				isPlaying: () => true,
				togglePlay,
			})
		);

		player.togglePlay();

		expect(togglePlay).toHaveBeenCalledOnce();
	});

	test("normalizes Spotify image URIs into CDN cover URLs", () => {
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				data: {
					item: {
						uri: "spotify:track:abc123",
						metadata: {
							title: "Title",
							artist_name: "Artist",
							album_title: "Album",
							duration: "1000",
							image_url: "spotify:image:ab67616d00001e02feedface",
						},
					},
				},
			})
		);

		expect(player.getCurrentTrack()?.coverUrl).toBe("https://i.scdn.co/image/ab67616d00001e02feedface");
	});

	test("falls back to alternate image metadata when image_url is missing", () => {
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				data: {
					item: {
						uri: "spotify:track:def456",
						metadata: {
							title: "Title",
							artist_name: "Artist",
							album_title: "Album",
							duration: "1000",
							image_xlarge_url: "spotify:image:ab67616d0000b273cafe",
						},
					},
				},
			})
		);

		expect(player.getCurrentTrack()?.coverUrl).toBe("https://i.scdn.co/image/ab67616d0000b273cafe");
	});

	test("normalizes internal Spotify image paths into CDN cover URLs", () => {
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				data: {
					item: {
						uri: "spotify:track:pathcover",
						metadata: {
							title: "Title",
							artist_name: "Artist",
							album_title: "Album",
							duration: "1000",
							image_url: "/image/ab67616d0000b273path",
						},
					},
				},
			})
		);

		expect(player.getCurrentTrack()?.coverUrl).toBe("https://i.scdn.co/image/ab67616d0000b273path");
	});

	test("skips non-renderable metadata image values before falling back", () => {
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				data: {
					item: {
						uri: "spotify:track:badcover",
						metadata: {
							title: "Title",
							artist_name: "Artist",
							album_title: "Album",
							duration: "1000",
							image_url: "spotify:image:",
							image_large_url: "spotify:image:ab67616d0000b273valid",
						},
					},
				},
			})
		);

		expect(player.getCurrentTrack()?.coverUrl).toBe("https://i.scdn.co/image/ab67616d0000b273valid");
	});

	test("extracts album art from player item image arrays when metadata images are absent", () => {
		const player = new SpicetifyPlayerAdapter(
			createSpicetify({
				data: {
					item: {
						uri: "spotify:track:itemimages",
						metadata: {
							title: "Title",
							artist_name: "Artist",
							album_title: "Album",
							duration: "1000",
						},
						images: [{ url: "" }, { url: "spotify:image:ab67616d0000b273array" }],
					},
				},
			})
		);

		expect(player.getCurrentTrack()?.coverUrl).toBe("https://i.scdn.co/image/ab67616d0000b273array");
	});
});
