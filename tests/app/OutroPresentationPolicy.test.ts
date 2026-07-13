import { describe, expect, test } from "vitest";
import {
	isNaturalTrackEnd,
	lastRenderedVocalEndSec,
	NATURAL_END_TOLERANCE_SEC,
	OUTRO_METADATA_DELAY_SEC,
	outroMetadataThresholdSec,
	type PreviousTrackProgress,
} from "../../src/app/OutroPresentationPolicy";
import type { LineLyrics, StaticLyrics, SyllableLyrics } from "../../src/lyrics/types";

const staticLyrics: StaticLyrics = {
	type: "static",
	lines: [{ text: "Untimed lyrics" }],
};

const lineLyricsWithOutro: LineLyrics = {
	type: "line",
	startTime: 0,
	endTime: 12,
	content: [
		{ type: "vocal", startTime: 4, endTime: 8, text: "Last line", oppositeAligned: false },
		{ type: "interlude", startTime: 8, endTime: 12, generated: true },
	],
};

const interludeOnlyLyrics: LineLyrics = {
	type: "line",
	startTime: 0,
	endTime: 10,
	content: [{ type: "interlude", startTime: 0, endTime: 10 }],
};

const syllableLyricsWithLateBackground: SyllableLyrics = {
	type: "syllable",
	startTime: 0,
	endTime: 10,
	content: [
		{
			type: "vocal",
			oppositeAligned: false,
			lead: {
				startTime: 4,
				endTime: 8,
				syllables: [{ text: "Lead", startTime: 4, endTime: 8, isPartOfWord: false }],
			},
			background: [
				{
					startTime: 8,
					endTime: 10,
					syllables: [{ text: "Late echo", startTime: 8, endTime: 10, isPartOfWord: false }],
				},
			],
		},
	],
};

describe("lastRenderedVocalEndSec", () => {
	test("returns undefined for static lyrics", () => {
		expect(lastRenderedVocalEndSec(staticLyrics, "prefer-syllable")).toBeUndefined();
	});

	test("ignores a trailing interlude in line lyrics", () => {
		expect(lastRenderedVocalEndSec(lineLyricsWithOutro, "prefer-syllable")).toBe(8);
	});

	test("returns undefined for interlude-only lyrics", () => {
		expect(lastRenderedVocalEndSec(interludeOnlyLyrics, "prefer-syllable")).toBeUndefined();
	});

	test("includes background vocals in syllable rendering", () => {
		expect(lastRenderedVocalEndSec(syllableLyricsWithLateBackground, "prefer-syllable")).toBe(10);
	});

	test("uses only lead vocals for the line-only view", () => {
		expect(lastRenderedVocalEndSec(syllableLyricsWithLateBackground, "line-only")).toBe(8);
	});
});

describe("outroMetadataThresholdSec", () => {
	test("adds the metadata delay to the last rendered vocal end", () => {
		expect(outroMetadataThresholdSec(lineLyricsWithOutro, "prefer-syllable", 12)).toBe(10);
	});

	test("keeps a threshold that equals the track duration", () => {
		expect(outroMetadataThresholdSec(lineLyricsWithOutro, "prefer-syllable", 10)).toBe(10);
	});

	test("returns undefined instead of shortening a threshold beyond the track duration", () => {
		expect(outroMetadataThresholdSec(lineLyricsWithOutro, "prefer-syllable", 9.999)).toBeUndefined();
	});
});

describe("isNaturalTrackEnd", () => {
	test("includes the exact natural-end tolerance boundary", () => {
		expect(isNaturalTrackEnd({ previousProgressSec: 98, previousDurationSec: 100 })).toBe(true);
	});

	test("rejects progress immediately before the natural-end tolerance boundary", () => {
		expect(isNaturalTrackEnd({ previousProgressSec: 97.999, previousDurationSec: 100 })).toBe(false);
	});

	test("returns false when either previous progress value is missing", () => {
		const missingProgress: PreviousTrackProgress = { previousDurationSec: 100 };
		const missingDuration: PreviousTrackProgress = { previousProgressSec: 100 };

		expect(isNaturalTrackEnd()).toBe(false);
		expect(isNaturalTrackEnd(missingProgress)).toBe(false);
		expect(isNaturalTrackEnd(missingDuration)).toBe(false);
	});
});

test("exports the outro timing constants", () => {
	expect(OUTRO_METADATA_DELAY_SEC).toBe(2);
	expect(NATURAL_END_TOLERANCE_SEC).toBe(2);
});
