import { describe, expect, test, vi } from "vitest";
import type { LineLyrics } from "../../src/lyrics/types";
import { buildInterludeWaveformMap } from "../../src/renderer/interludeWaveforms";

describe("interludeWaveforms", () => {
	const lyrics: LineLyrics = {
		type: "line",
		startTime: 0,
		endTime: 20,
		content: [
			{ type: "vocal", text: "Before", startTime: 0, endTime: 4, oppositeAligned: false },
			{ type: "interlude", startTime: 4, endTime: 10 },
			{ type: "vocal", text: "After", startTime: 10, endTime: 14, oppositeAligned: false },
		],
	};

	test("builds waveform entries only for wave interlude style", () => {
		const waveformForInterlude = vi.fn(() => ({ bars: [0.2, 0.8], source: "seeded" as const }));
		const profile = { trackUri: "spotify:track:test", seed: 1, segments: [], source: "seeded" as const };

		expect(
			buildInterludeWaveformMap({
				lyrics,
				profile,
				interludeStyle: "wave",
				waveformForInterlude,
			})
		).toEqual({
			"4:10": { bars: [0.2, 0.8], source: "seeded" },
		});
		expect(waveformForInterlude).toHaveBeenCalledOnce();
	});

	test("returns an empty map when the style does not need waveforms", () => {
		const waveformForInterlude = vi.fn(() => ({ bars: [0.2, 0.8], source: "seeded" as const }));

		expect(
			buildInterludeWaveformMap({
				lyrics,
				profile: { trackUri: "spotify:track:test", seed: 1, segments: [], source: "seeded" },
				interludeStyle: "dots",
				waveformForInterlude,
			})
		).toEqual({});
		expect(waveformForInterlude).not.toHaveBeenCalled();
	});
});
