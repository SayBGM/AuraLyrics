import { describe, expect, test, vi } from "vitest";
import { SpicetifyPlayerAdapter } from "../../src/player/SpicetifyPlayerAdapter";
import type { SpicetifyGlobal } from "../../src/runtime/spicetify";

const createSpicetify = (overrides: Partial<SpicetifyGlobal["Player"]>): SpicetifyGlobal =>
	({
		Player: {
			addEventListener: vi.fn(),
			getDuration: () => 0,
			getProgress: () => 0,
			...overrides,
		},
	}) as unknown as SpicetifyGlobal;

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
