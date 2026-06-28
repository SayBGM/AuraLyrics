import { describe, expect, test } from "vitest";
import { buildPseudoKaraokeLyrics } from "../../../src/lyrics/pseudoKaraoke/buildPseudoKaraoke";
import type { LineLyrics, SyllableVocal } from "../../../src/lyrics/types";
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

const leadOf = (lyrics: LineLyrics, analysis = buildVocalAnalysis(2, 9), index = 0): SyllableVocal => {
	const result = buildPseudoKaraokeLyrics(lyrics, analysis);
	if (!result) {
		throw new Error("expected synthesized lyrics");
	}
	const item = result.lyrics.content[index];
	if (!item || item.type !== "vocal") {
		throw new Error("expected vocal set");
	}
	return item.lead;
};

describe("buildPseudoKaraokeLyrics", () => {
	test("synthesizes syllable lyrics with an average confidence", () => {
		const result = buildPseudoKaraokeLyrics(lineLyrics(), buildVocalAnalysis(2, 9));
		expect(result).not.toBeNull();
		if (!result) {
			throw new Error("expected synthesized lyrics");
		}
		expect(result.lyrics.type).toBe("syllable");
		expect(result.lyrics.content).toHaveLength(3);
		expect(result.averageConfidence).toBeGreaterThan(0);
	});

	test("passes interludes through unchanged", () => {
		const result = buildPseudoKaraokeLyrics(lineLyrics(), buildVocalAnalysis(2, 9));
		expect(result?.lyrics.content[1]).toEqual({ type: "interlude", startTime: 6, endTime: 7 });
	});

	test("syllables are ordered, non-overlapping, and within the line bounds (seconds)", () => {
		const { syllables } = leadOf(lineLyrics());
		expect(syllables.length).toBeGreaterThan(1);
		for (let index = 0; index < syllables.length; index += 1) {
			const syllable = syllables[index];
			expect(syllable.endTime).toBeGreaterThan(syllable.startTime);
			expect(syllable.startTime).toBeGreaterThanOrEqual(2 - 0.01);
			expect(syllable.endTime).toBeLessThanOrEqual(6 + 0.01);
			if (index > 0) {
				expect(syllable.startTime).toBeGreaterThanOrEqual(syllables[index - 1].endTime - 0.01);
			}
		}
	});

	test("marks word boundaries via isPartOfWord", () => {
		const lead = leadOf(lineLyrics(), buildVocalAnalysis(2, 9), 2);
		expect(lead.syllables[0].isPartOfWord).toBe(false);
		expect(lead.syllables.map((syllable) => syllable.text).join(" ")).toContain("hello");
	});

	test("returns null when no audio analysis is available", () => {
		expect(buildPseudoKaraokeLyrics(lineLyrics(), undefined)).toBeNull();
		expect(buildPseudoKaraokeLyrics(lineLyrics(), { segments: [] })).toBeNull();
	});

	test("onset-aware merging reduces over-splitting when onsets are sparse", () => {
		const line: LineLyrics = {
			type: "line",
			startTime: 2,
			endTime: 6,
			content: [{ type: "vocal", text: "가나다라마바사아", startTime: 2, endTime: 6, oppositeAligned: false }],
		};
		const dense = leadOf(line, buildVocalAnalysis(2, 6, 0.18)).syllables.length;
		const sparse = leadOf(line, buildVocalAnalysis(2, 6, 0.6)).syllables.length;
		expect(sparse).toBeLessThanOrEqual(dense);
	});

	test("falls back to even weight distribution when the line has no candidates", () => {
		const line: LineLyrics = {
			type: "line",
			startTime: 10,
			endTime: 14,
			content: [{ type: "vocal", text: "가나다", startTime: 10, endTime: 14, oppositeAligned: false }],
		};
		// Analysis only covers 2–5s, so the 10–14s line has no vocal candidates.
		const { syllables } = leadOf(line, buildVocalAnalysis(2, 5));
		expect(syllables).toHaveLength(3);
		for (let index = 0; index < syllables.length; index += 1) {
			expect(syllables[index].startTime).toBeGreaterThanOrEqual(10 - 0.01);
			expect(syllables[index].endTime).toBeLessThanOrEqual(14 + 0.01);
			if (index > 0) {
				expect(syllables[index].startTime).toBeGreaterThanOrEqual(syllables[index - 1].endTime - 0.01);
			}
		}
	});

	test("splits parenthetical text into background vocals", () => {
		const line: LineLyrics = {
			type: "line",
			startTime: 2,
			endTime: 6,
			content: [{ type: "vocal", text: "shining bright (echo now)", startTime: 2, endTime: 6, oppositeAligned: false }],
		};
		const result = buildPseudoKaraokeLyrics(line, buildVocalAnalysis(2, 6));
		const item = result?.lyrics.content[0];
		if (!item || item.type !== "vocal") {
			throw new Error("expected vocal set");
		}
		expect(item.background?.length ?? 0).toBeGreaterThanOrEqual(1);
		const leadText = item.lead.syllables.map((syllable) => syllable.text).join(" ");
		expect(leadText).not.toContain("echo");
		const backgroundText = (item.background ?? []).flatMap((vocal) => vocal.syllables.map((syllable) => syllable.text)).join(" ");
		expect(backgroundText).toContain("echo");
	});

	test("lets a sustained final syllable hold (melisma) rather than being clipped", () => {
		const line: LineLyrics = {
			type: "line",
			startTime: 2,
			endTime: 8,
			content: [{ type: "vocal", text: "가나다라", startTime: 2, endTime: 8, oppositeAligned: false }],
		};
		const { syllables } = leadOf(line, buildVocalAnalysis(2, 8));
		const durations = syllables.map((syllable) => syllable.endTime - syllable.startTime);
		const last = durations[durations.length - 1];
		const others = durations.slice(0, -1).sort((a, b) => a - b);
		const median = others[Math.floor(others.length / 2)] ?? last;
		expect(last).toBeGreaterThanOrEqual(median * 0.8);
	});
});
