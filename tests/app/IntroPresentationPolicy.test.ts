import { describe, expect, test } from "vitest";
import { firstRenderedVocalStartSec, introDecision } from "../../src/app/IntroPresentationPolicy";
import type { LineLyrics, StaticLyrics, SyllableLyrics } from "../../src/lyrics/types";

const staticLyrics: StaticLyrics = {
	type: "static",
	lines: [{ text: "Untimed lyrics" }],
};

const lineLyricsWithIntro: LineLyrics = {
	type: "line",
	startTime: 0,
	endTime: 12,
	content: [
		{ type: "interlude", startTime: 0, endTime: 8, generated: true },
		{ type: "vocal", startTime: 8, endTime: 12, text: "First line", oppositeAligned: false },
	],
};

const interludeOnlyLyrics: LineLyrics = {
	type: "line",
	startTime: 0,
	endTime: 10,
	content: [{ type: "interlude", startTime: 0, endTime: 10 }],
};

const syllableLyricsWithEarlyBackground: SyllableLyrics = {
	type: "syllable",
	startTime: 0,
	endTime: 10,
	content: [
		{
			type: "vocal",
			oppositeAligned: false,
			lead: {
				startTime: 7,
				endTime: 8,
				syllables: [{ text: "Lead", startTime: 7, endTime: 8, isPartOfWord: false }],
			},
			background: [
				{
					startTime: 9,
					endTime: 10,
					syllables: [{ text: "Late echo", startTime: 9, endTime: 10, isPartOfWord: false }],
				},
			],
		},
		{
			type: "vocal",
			oppositeAligned: false,
			lead: {
				startTime: 8,
				endTime: 10,
				syllables: [{ text: "Second lead", startTime: 8, endTime: 10, isPartOfWord: false }],
			},
			background: [
				{
					startTime: 4,
					endTime: 6,
					syllables: [{ text: "Early echo", startTime: 4, endTime: 6, isPartOfWord: false }],
				},
			],
		},
	],
};

describe("firstRenderedVocalStartSec", () => {
	test("returns undefined for static lyrics", () => {
		expect(firstRenderedVocalStartSec(staticLyrics, "prefer-syllable")).toBeUndefined();
	});

	test("ignores a generated opening interlude in line lyrics", () => {
		expect(firstRenderedVocalStartSec(lineLyricsWithIntro, "prefer-syllable")).toBe(8);
	});

	test("returns undefined for interlude-only lyrics", () => {
		expect(firstRenderedVocalStartSec(interludeOnlyLyrics, "prefer-syllable")).toBeUndefined();
	});

	test("includes background vocals in syllable rendering", () => {
		expect(firstRenderedVocalStartSec(syllableLyricsWithEarlyBackground, "prefer-syllable")).toBe(4);
	});

	test("uses only lead vocals for the line-only view", () => {
		expect(firstRenderedVocalStartSec(syllableLyricsWithEarlyBackground, "line-only")).toBe(7);
	});
});

describe("introDecision", () => {
	test.each([
		{ timestampSec: 8.001, applyImmediateThreshold: true, expected: "reveal" },
		{ timestampSec: 8, applyImmediateThreshold: true, expected: "reveal" },
		{ timestampSec: 7.999, applyImmediateThreshold: true, expected: "hold" },
		{ timestampSec: 9, applyImmediateThreshold: false, expected: "hold" },
		{ timestampSec: 10, applyImmediateThreshold: false, expected: "reveal" },
	] as const)("returns $expected at timestamp $timestampSec when threshold application is $applyImmediateThreshold", ({
		timestampSec,
		applyImmediateThreshold,
		expected,
	}) => {
		expect(
			introDecision({
				firstVocalStartSec: 10,
				timestampSec,
				applyImmediateThreshold,
			})
		).toBe(expected);
	});

	test("reveals when the first vocal start is unknown", () => {
		expect(
			introDecision({
				firstVocalStartSec: undefined,
				timestampSec: 0,
				applyImmediateThreshold: true,
			})
		).toBe("reveal");
	});
});
