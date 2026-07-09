import { describe, expect, test } from "vitest";
import { buildPseudoKaraokeLyrics } from "../../../src/lyrics/pseudoKaraoke/buildPseudoKaraoke";
import type { LineLyrics } from "../../../src/lyrics/types";
import { buildVocalAnalysis } from "./fixtures";

const lineLyrics = (): LineLyrics => ({
	type: "line",
	startTime: 2,
	endTime: 9,
	content: [
		{ type: "vocal", text: "별빛이 내린 밤에", startTime: 2, endTime: 6, oppositeAligned: false },
		{ type: "interlude", startTime: 6, endTime: 7 },
		{ type: "vocal", text: "hello bright world", startTime: 7, endTime: 9, oppositeAligned: false },
	],
});

describe("buildPseudoKaraokeLyrics", () => {
	test("synthesizes syllable lyrics from line lyrics + analysis", () => {
		const analysis = buildVocalAnalysis(2, 9);
		const result = buildPseudoKaraokeLyrics(lineLyrics(), analysis);
		expect(result).not.toBeNull();
		if (!result) {
			throw new Error("expected synthesized lyrics");
		}
		expect(result.type).toBe("syllable");
		expect(result.content).toHaveLength(3);
	});

	test("passes interludes through unchanged", () => {
		const analysis = buildVocalAnalysis(2, 9);
		const result = buildPseudoKaraokeLyrics(lineLyrics(), analysis);
		expect(result?.content[1]).toEqual({ type: "interlude", startTime: 6, endTime: 7 });
	});

	test("syllables are ordered, non-overlapping, and within the line bounds (seconds)", () => {
		const analysis = buildVocalAnalysis(2, 9);
		const result = buildPseudoKaraokeLyrics(lineLyrics(), analysis);
		const first = result?.content[0];
		if (!first || first.type !== "vocal") {
			throw new Error("expected vocal set");
		}
		const { syllables } = first.lead;
		expect(syllables.length).toBeGreaterThan(1);
		for (let index = 0; index < syllables.length; index += 1) {
			const syllable = syllables[index];
			expect(syllable.endTime).toBeGreaterThan(syllable.startTime);
			// times are in seconds, within the original line window
			expect(syllable.startTime).toBeGreaterThanOrEqual(2 - 0.01);
			expect(syllable.endTime).toBeLessThanOrEqual(6 + 0.01);
			if (index > 0) {
				expect(syllable.startTime).toBeGreaterThanOrEqual(syllables[index - 1].endTime - 0.01);
			}
		}
	});

	test("starts the first syllable at the line start even when vocal energy begins later", () => {
		const analysis = buildVocalAnalysis(3.5, 6);
		const result = buildPseudoKaraokeLyrics(lineLyrics(), analysis);
		const first = result?.content[0];
		if (!first || first.type !== "vocal") {
			throw new Error("expected vocal set");
		}
		expect(first.lead.syllables[0].startTime).toBeCloseTo(2, 5);
	});

	test("keeps every syllable inside a short line window even with many units", () => {
		const analysis = buildVocalAnalysis(2, 6);
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 2,
			endTime: 2.3,
			content: [{ type: "vocal", text: "가나다라마바사아자차카타파하", startTime: 2, endTime: 2.3, oppositeAligned: false }],
		};
		const result = buildPseudoKaraokeLyrics(lyrics, analysis);
		const first = result?.content[0];
		if (!first || first.type !== "vocal") {
			throw new Error("expected vocal set");
		}
		let previousEnd = 2;
		for (const syllable of first.lead.syllables) {
			expect(syllable.startTime).toBeGreaterThanOrEqual(previousEnd - 1e-6);
			expect(syllable.endTime).toBeGreaterThanOrEqual(syllable.startTime);
			expect(syllable.startTime).toBeGreaterThanOrEqual(2 - 1e-6);
			expect(syllable.endTime).toBeLessThanOrEqual(2.3 + 1e-6);
			previousEnd = syllable.endTime;
		}
	});

	test("marks word boundaries via isPartOfWord", () => {
		const analysis = buildVocalAnalysis(2, 9);
		const result = buildPseudoKaraokeLyrics(lineLyrics(), analysis);
		const latin = result?.content[2];
		if (!latin || latin.type !== "vocal") {
			throw new Error("expected vocal set");
		}
		// "hello bright world" → each word starts a new word (isPartOfWord false).
		expect(latin.lead.syllables[0].isPartOfWord).toBe(false);
		expect(latin.lead.syllables.map((syllable) => syllable.text).join(" ")).toContain("hello");
	});

	test("returns null when no audio analysis is available", () => {
		expect(buildPseudoKaraokeLyrics(lineLyrics(), undefined)).toBeNull();
		expect(buildPseudoKaraokeLyrics(lineLyrics(), { segments: [] })).toBeNull();
	});

	test("carries per-line translations onto the synthesized vocal sets", () => {
		const analysis = buildVocalAnalysis(2, 9);
		const lyrics = lineLyrics();
		if (lyrics.content[0].type !== "vocal" || lyrics.content[2].type !== "vocal") {
			throw new Error("expected vocal lines");
		}
		lyrics.content[0].translatedText = "별빛 번역";
		const result = buildPseudoKaraokeLyrics(lyrics, analysis);
		const [first, , second] = result?.content ?? [];
		if (first?.type !== "vocal" || second?.type !== "vocal") {
			throw new Error("expected vocal sets");
		}
		expect(first.translatedText).toBe("별빛 번역");
		expect(second.translatedText).toBeUndefined();
	});
});
