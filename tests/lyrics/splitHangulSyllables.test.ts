import { describe, expect, test } from "vitest";
import { getUnitWeight } from "../../src/lyrics/pseudoKaraoke/unitWeights";
import { splitHangulSyllables } from "../../src/lyrics/splitHangulSyllables";
import type { Syllable, SyllableLyrics } from "../../src/lyrics/types";

const lyricsWithSyllables = (syllables: Syllable[]): SyllableLyrics => ({
	type: "syllable",
	startTime: syllables[0]?.startTime ?? 0,
	endTime: syllables.at(-1)?.endTime ?? 0,
	content: [
		{ type: "vocal", oppositeAligned: false, lead: { startTime: syllables[0]?.startTime ?? 0, endTime: syllables.at(-1)?.endTime ?? 0, syllables } },
	],
});

const leadSyllables = (lyrics: SyllableLyrics): Syllable[] => {
	const item = lyrics.content[0];
	if (item.type !== "vocal") {
		throw new Error("expected vocal");
	}
	return item.lead.syllables;
};

describe("splitHangulSyllables", () => {
	test("splits a pure Hangul word proportionally by linguistic weight", () => {
		const syllable: Syllable = { text: "안녕", startTime: 1, endTime: 2, isPartOfWord: false };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));

		expect(result.map((s) => s.text)).toEqual(["안", "녕"]);
		expect(result[0].startTime).toBeCloseTo(1, 5);
		expect(result.at(-1)?.endTime).toBeCloseTo(2, 5);
		expect(result[0].endTime).toBeCloseTo(result[1].startTime, 5);

		const wAn = getUnitWeight("안");
		const wNyeong = getUnitWeight("녕");
		const expectedRatio = wAn / (wAn + wNyeong);
		const actualRatio = (result[0].endTime - result[0].startTime) / ((result.at(-1)?.endTime ?? 0) - syllable.startTime);
		expect(actualRatio).toBeCloseTo(expectedRatio, 5);
	});

	test("inherits isPartOfWord on the first char and sets true for the rest", () => {
		const syllable: Syllable = { text: "사랑해", startTime: 0, endTime: 1.5, isPartOfWord: true };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));

		expect(result.map((s) => s.isPartOfWord)).toEqual([true, true, true]);

		const syllable2: Syllable = { text: "사랑해", startTime: 0, endTime: 1.5, isPartOfWord: false };
		const result2 = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable2])));
		expect(result2.map((s) => s.isPartOfWord)).toEqual([false, true, true]);
	});

	test("leaves mixed, Latin, and parenthetical text unsplit", () => {
		const mixed: Syllable = { text: "안녕(Hi)", startTime: 0, endTime: 2, isPartOfWord: false };
		const latin: Syllable = { text: "Hello", startTime: 0, endTime: 1, isPartOfWord: false };
		const singleChar: Syllable = { text: "안", startTime: 0, endTime: 1, isPartOfWord: false };
		const romanized: Syllable = { text: "안녕", romanizedText: "annyeong", startTime: 0, endTime: 2, isPartOfWord: false };

		for (const syllable of [mixed, latin, singleChar, romanized]) {
			const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));
			expect(result).toEqual([syllable]);
		}
	});

	test("does not split ultra-short words below the per-char duration floor", () => {
		const syllable: Syllable = { text: "안녕", startTime: 0, endTime: 0.08, isPartOfWord: false };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));
		expect(result).toEqual([syllable]);
	});

	test("caps non-final char duration during melisma and shifts surplus to the last char", () => {
		const syllable: Syllable = { text: "사랑", startTime: 0, endTime: 3, isPartOfWord: false };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));

		const firstDurationMs = (result[0].endTime - result[0].startTime) * 1000;
		expect(firstDurationMs).toBeLessThanOrEqual(900 + 1e-6);
		const last = result.at(-1);
		expect(last?.endTime).toBeCloseTo(3, 5);
		expect((last?.endTime ?? 0) - (last?.startTime ?? 0)).toBeGreaterThan(1.5);
	});

	test("is idempotent — already single-character syllables pass through unchanged", () => {
		const syllable: Syllable = { text: "안녕", startTime: 0, endTime: 2, isPartOfWord: false };
		const once = splitHangulSyllables(lyricsWithSyllables([syllable]));
		const twice = splitHangulSyllables(once);
		expect(leadSyllables(twice)).toEqual(leadSyllables(once));
	});

	test("splits a trailing-punctuation Hangul word, attaching the punctuation to the last char", () => {
		const syllable: Syllable = { text: "사랑해,", startTime: 0, endTime: 1.5, isPartOfWord: false };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));

		expect(result.map((s) => s.text)).toEqual(["사", "랑", "해,"]);
		expect(result[0].startTime).toBeCloseTo(0, 5);
		expect(result.at(-1)?.endTime).toBeCloseTo(1.5, 5);
		expect(result[0].endTime).toBeCloseTo(result[1].startTime, 5);
		expect(result[1].endTime).toBeCloseTo(result[2].startTime, 5);
	});

	test("does not split parenthesized Hangul text", () => {
		const syllable: Syllable = { text: "(사랑해)", startTime: 0, endTime: 1.5, isPartOfWord: false };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));
		expect(result).toEqual([syllable]);
	});

	test("preserves Hangul tokens inside a parenthetical spanning provider tokens", () => {
		const syllables: Syllable[] = [
			{ text: "사랑해", startTime: 0, endTime: 0.9, isPartOfWord: false },
			{ text: "(이", startTime: 0.9, endTime: 1.2, isPartOfWord: false },
			{ text: "밤을", startTime: 1.2, endTime: 1.8, isPartOfWord: false },
			{ text: "새워)", startTime: 1.8, endTime: 2.4, isPartOfWord: false },
			{ text: "오늘도", startTime: 2.4, endTime: 3.3, isPartOfWord: false },
		];

		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables(syllables)));

		expect(result.map((item) => item.text)).toEqual(["사", "랑", "해", "(이", "밤을", "새워)", "오", "늘", "도"]);
		expect(result.slice(3, 6)).toEqual(syllables.slice(1, 4));
	});

	test("splits a leading-punctuation Hangul word, attaching the punctuation to the first char", () => {
		const syllable: Syllable = { text: "'그대여", startTime: 0, endTime: 1.5, isPartOfWord: false };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));
		expect(result.map((s) => s.text)).toEqual(["'그", "대", "여"]);
	});

	test("is idempotent for punctuated splits", () => {
		const syllable: Syllable = { text: "사랑해,", startTime: 0, endTime: 1.5, isPartOfWord: false };
		const once = splitHangulSyllables(lyricsWithSyllables([syllable]));
		const twice = splitHangulSyllables(once);
		expect(leadSyllables(twice)).toEqual(leadSyllables(once));
	});

	test("distributes duration by core-character weight only, ignoring trailing punctuation", () => {
		const syllable: Syllable = { text: "사랑해~", startTime: 0, endTime: 1.8, isPartOfWord: false };
		const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables([syllable])));

		expect(result.map((s) => s.text)).toEqual(["사", "랑", "해~"]);
		const w1 = getUnitWeight("사");
		const w2 = getUnitWeight("랑");
		const w3 = getUnitWeight("해");
		const total = w1 + w2 + w3;
		const totalDuration = (result.at(-1)?.endTime ?? 0) - syllable.startTime;

		const d1 = result[0].endTime - result[0].startTime;
		const d2 = result[1].endTime - result[1].startTime;
		expect(d1 / totalDuration).toBeCloseTo(w1 / total, 5);
		expect(d2 / totalDuration).toBeCloseTo(w2 / total, 5);
	});
});
