import { describe, expect, test } from "vitest";
import { parseWordLevelParentheticals, withSegmentTiming } from "../../src/renderer/lyrics/parentheticalSegments";

describe("parentheticalSegments", () => {
	test("splits word-level parentheticals into main and echo segments", () => {
		expect(parseWordLevelParentheticals("괜찮아 (괜찮아) 언젠가 (언젠가)", false)).toEqual([
			{ text: "괜찮아", isParenthetical: false, continues: false },
			{ text: "괜찮아", isParenthetical: true, continues: false },
			{ text: "언젠가", isParenthetical: false, continues: false },
			{ text: "언젠가", isParenthetical: true, continues: false },
		]);
	});

	test("removes an ASCII comma immediately after a parenthetical", () => {
		expect(parseWordLevelParentheticals("피땀으로 (hey), 눈물로 (hey)", false)).toEqual([
			{ text: "피땀으로", isParenthetical: false, continues: false },
			{ text: "hey", isParenthetical: true, continues: false },
			{ text: "눈물로", isParenthetical: false, continues: false },
			{ text: "hey", isParenthetical: true, continues: false },
		]);
		expect(parseWordLevelParentheticals("(hey),", false)).toEqual([{ text: "hey", isParenthetical: true, continues: false }]);
	});

	test("keeps ordinary commas and other punctuation after a parenthetical", () => {
		expect(parseWordLevelParentheticals("피땀으로, 눈물로", false)).toEqual([{ text: "피땀으로, 눈물로", isParenthetical: false, continues: false }]);
		expect(parseWordLevelParentheticals("피땀으로 (hey)! 눈물로", false)).toEqual([
			{ text: "피땀으로!", isParenthetical: false, continues: false },
			{ text: "hey", isParenthetical: true, continues: false },
			{ text: "눈물로", isParenthetical: false, continues: false },
		]);
		expect(parseWordLevelParentheticals("피땀으로 (hey)， 눈물로", false)).toEqual([
			{ text: "피땀으로，", isParenthetical: false, continues: false },
			{ text: "hey", isParenthetical: true, continues: false },
			{ text: "눈물로", isParenthetical: false, continues: false },
		]);
	});

	test("keeps unclosed parenthetical state for the next syllable token", () => {
		expect(parseWordLevelParentheticals("(벚꽃", false)).toEqual([{ text: "벚꽃", isParenthetical: true, continues: true }]);
		expect(parseWordLevelParentheticals("잎이)", true)).toEqual([{ text: "잎이", isParenthetical: true, continues: false }]);
	});

	test("distributes syllable timing across parsed segments", () => {
		const timed = withSegmentTiming(
			{ text: "괜찮아 (괜찮아)", startTime: 10, endTime: 12, isPartOfWord: false },
			parseWordLevelParentheticals("괜찮아 (괜찮아)", false)
		);

		expect(timed).toEqual([
			{ text: "괜찮아", isParenthetical: false, continues: false, startTime: 10, endTime: 11 },
			{ text: "괜찮아", isParenthetical: true, continues: false, startTime: 11, endTime: 12 },
		]);
	});
});
