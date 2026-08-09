import { describe, expect, test } from "vitest";
import type { Syllable } from "../../src/lyrics/types";
import {
	parseWordLevelParentheticals,
	tokenizeParentheticalSyllables,
	withParentheticalEventTiming,
	withSegmentTiming,
} from "../../src/renderer/lyrics/parentheticalSegments";

const syllable = (text: string, startTime: number, endTime: number): Syllable => ({
	text,
	startTime,
	endTime,
	isPartOfWord: false,
});

const mainTexts = (items: ReturnType<typeof tokenizeParentheticalSyllables>): string[] =>
	items.flatMap((item) => (item.kind === "main" ? [[item.text, ...(item.trailingPunctuation ?? [])].map((part) => part.segment.text).join("")] : []));

describe("parentheticalSegments", () => {
	test("splits word-level parentheticals into main and echo segments", () => {
		expect(parseWordLevelParentheticals("괜찮아 (괜찮아) 언젠가 (언젠가)", 0).segments).toEqual([
			{ text: "괜찮아", isParenthetical: false, continues: false },
			{ text: "괜찮아", isParenthetical: true, continues: false },
			{ text: "언젠가", isParenthetical: false, continues: false },
			{ text: "언젠가", isParenthetical: true, continues: false },
		]);
	});

	test("emits explicit boundaries while carrying depth across provider tokens", () => {
		const opening = parseWordLevelParentheticals("(", 0);
		const content = parseWordLevelParentheticals("메아리", opening.depthAfter);
		const closing = parseWordLevelParentheticals(")", content.depthAfter);

		expect(opening.events.map((event) => event.kind)).toEqual(["open"]);
		expect(content.segments).toEqual([{ text: "메아리", isParenthetical: true, continues: true }]);
		expect(closing.events.map((event) => event.kind)).toEqual(["close"]);
		expect(closing.depthAfter).toBe(0);
	});

	test("handles nested round parentheses without rendering delimiters", () => {
		const result = parseWordLevelParentheticals("본문 ((메아리)) 다음", 0);

		expect(result.segments).toEqual([
			{ text: "본문", isParenthetical: false, continues: false },
			{ text: "메아리", isParenthetical: true, continues: false },
			{ text: "다음", isParenthetical: false, continues: false },
		]);
		expect(result.events.map((event) => event.kind)).toEqual(["segment", "open", "segment", "close", "segment"]);
		expect(result.depthAfter).toBe(0);
	});

	test.each([",", "，", "、"])("removes one %s immediately after a closed group and keeps its hidden time", (comma) => {
		const items = tokenizeParentheticalSyllables([
			syllable("본문", 0, 1),
			syllable("(메아리)", 1, 2),
			syllable(comma, 2, 2.2),
			syllable("다음", 2.2, 3),
		]);
		const group = items.find((item) => item.kind === "parenthetical");

		expect(mainTexts(items)).toEqual(["본문", "다음"]);
		expect(group).toMatchObject({ kind: "parenthetical", closed: true, tailEndTime: 2.2 });
	});

	test("removes only the first comma-like suffix and preserves all following punctuation", () => {
		const items = tokenizeParentheticalSyllables([syllable("본문", 0, 1), syllable("(hey)", 1, 2), syllable(",，! 다음", 2, 3)]);

		expect(mainTexts(items)).toEqual(["본문，!", "다음"]);
	});

	test("preserves non-comma punctuation after a parenthetical", () => {
		const items = tokenizeParentheticalSyllables([
			syllable("본문", 0, 1),
			syllable("(메아리)", 1, 2),
			syllable("!", 2, 2.2),
			syllable("다음", 2.2, 3),
		]);

		expect(mainTexts(items)).toEqual(["본문!", "다음"]);
		const main = items.find((item) => item.kind === "main");
		const group = items.find((item) => item.kind === "parenthetical");
		expect(main?.trailingPunctuation).toEqual([
			expect.objectContaining({ segment: expect.objectContaining({ text: "!", startTime: 2, endTime: 2.2 }) }),
		]);
		expect(group).toMatchObject({ tailEndTime: 2.2 });
	});

	test("keeps punctuation after a leading parenthetical with the echo", () => {
		const items = tokenizeParentheticalSyllables([syllable("(hey)", 0, 1), syllable("! 다음", 1, 2)]);

		expect(mainTexts(items)).toEqual(["다음"]);
		expect(items.find((item) => item.kind === "parenthetical")).toMatchObject({
			trailingPunctuation: [expect.objectContaining({ segment: expect.objectContaining({ text: "!" }) })],
			tailEndTime: 1.5,
		});
	});

	test("produces the same vocal structure for combined and provider-split tokens", () => {
		const semanticItems = (tokens: Syllable[]) =>
			tokenizeParentheticalSyllables(tokens).map((item) =>
				item.kind === "main"
					? { kind: item.kind, text: [item.text, ...(item.trailingPunctuation ?? [])].map((part) => part.segment.text).join("") }
					: { kind: item.kind, text: item.segments.map((segment) => segment.segment.text).join(""), closed: item.closed }
			);
		const combined = [syllable("본문 (hey), 다음", 0, 3)];
		const split = [syllable("본문", 0, 1), syllable("(", 1, 1.1), syllable("hey", 1.1, 1.8), syllable("),", 1.8, 2), syllable("다음", 2, 3)];

		expect(semanticItems(split)).toEqual(semanticItems(combined));
	});

	test("distributes visible segment timing while retaining delimiter-only timing", () => {
		const source = syllable("괜찮아 (괜찮아)", 10, 12);
		const result = parseWordLevelParentheticals(source.text, 0);

		expect(withSegmentTiming(source, result.segments)).toEqual([
			{ text: "괜찮아", isParenthetical: false, continues: false, startTime: 10, endTime: 11 },
			{ text: "괜찮아", isParenthetical: true, continues: false, startTime: 11, endTime: 12 },
		]);
		const closeOnly = syllable(")", 12, 12.2);
		expect(withParentheticalEventTiming(closeOnly, parseWordLevelParentheticals(")", 1))).toEqual([{ kind: "close", startTime: 12, endTime: 12.2 }]);
	});
});
