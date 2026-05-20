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
});
