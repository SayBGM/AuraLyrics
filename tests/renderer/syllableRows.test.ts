import { describe, expect, test } from "vitest";
import type { SyllableVocal } from "../../src/lyrics/types";
import { buildSyllableRows } from "../../src/renderer/lyrics/syllableRows";

const vocal = (text: string, startTime = 0, endTime = 4): SyllableVocal => ({
	startTime,
	endTime,
	syllables: [{ text, startTime, endTime, isPartOfWord: false }],
});

const rowText = (row: ReturnType<typeof buildSyllableRows>["rows"][number]): string =>
	[...row.main.words, ...row.echo.words].flatMap((word) => word.tokens.map((token) => token.text)).join("");

describe("buildSyllableRows", () => {
	test("models parenthetical echoes in the same visual rows as their main lyric", () => {
		const model = buildSyllableRows({
			startTime: 0,
			endTime: 7,
			syllables: [
				{ text: "괜찮아", startTime: 0, endTime: 1, isPartOfWord: false },
				{ text: "(괜찮아)", startTime: 1, endTime: 2, isPartOfWord: false },
				{ text: "언젠가", startTime: 2, endTime: 3, isPartOfWord: false },
				{ text: "(언젠가)", startTime: 3, endTime: 4, isPartOfWord: false },
				{ text: "바람아", startTime: 4, endTime: 5, isPartOfWord: false },
				{ text: "내게", startTime: 5, endTime: 6, isPartOfWord: false },
				{ text: "(흩날리듯이)", startTime: 6, endTime: 7, isPartOfWord: false },
			],
		});

		expect(model.hasParenthetical).toBe(true);
		expect(model.rows).toHaveLength(3);
		expect(model.rows.map((row) => row.rowClasses)).toEqual([["has-parenthetical-echo"], ["has-parenthetical-echo"], ["has-parenthetical-echo"]]);
		expect(model.rows.map((row) => row.main.words.flatMap((word) => word.tokens.map((token) => token.text)).join(""))).toEqual([
			"괜찮아",
			"언젠가",
			"바람아내게",
		]);
		expect(model.rows.map((row) => row.echo.words.flatMap((word) => word.tokens.map((token) => token.text)).join(""))).toEqual([
			"괜찮아",
			"언젠가",
			"흩날리듯이",
		]);
		expect(model.rows[0].echo.words[0].isParenthetical).toBe(true);
		expect(model.rows[0].echo.words[0].tokens[0]).toMatchObject({
			text: "괜찮아",
			isParenthetical: true,
			metadata: { startTime: 1, endTime: 2 },
		});
		expect(model.rows.map(({ startTime, endTime, holdEndTime }) => ({ startTime, endTime, holdEndTime }))).toEqual([
			{ startTime: 0, endTime: 2, holdEndTime: 2 },
			{ startTime: 2, endTime: 4, holdEndTime: 4 },
			{ startTime: 4, endTime: 7, holdEndTime: 7 },
		]);
	});

	test("stacks short ad-lib parentheticals as standalone rows", () => {
		const model = buildSyllableRows(vocal("내버려 둬 (hey), 터지게 둬 (hey) 유일한 지금일 테니", 0, 5));

		expect(model.rows.map(rowText)).toEqual(["내버려 둬", "hey", "터지게 둬", "hey", "유일한 지금일 테니"]);
		expect(model.rows.map((row) => row.rowClasses.includes("parenthetical-only"))).toEqual([false, true, false, true, false]);
		expect(model.rows.map((row) => row.echo.words.length)).toEqual([0, 0, 0, 0, 0]);
		expect(model.rows[1].main.words[0].tokens[0]).toMatchObject({
			text: "hey",
			isParenthetical: true,
		});
	});

	test("attaches punctuation after parenthetical echoes to the preceding main token", () => {
		const model = buildSyllableRows(vocal("피땀으로 (hey), 눈물로 (hey)", 0, 4));

		expect(model.rows).toHaveLength(2);
		expect(model.rows.map((row) => row.main.words.flatMap((word) => word.tokens.map((token) => token.text)).join(""))).toEqual([
			"피땀으로,",
			"눈물로",
		]);
		expect(model.rows.map((row) => row.echo.words.flatMap((word) => word.tokens.map((token) => token.text)).join(""))).toEqual(["hey", "hey"]);
	});

	test("splits Korean sustained tails into base and tail token metadata", () => {
		const model = buildSyllableRows({
			startTime: 0,
			endTime: 4,
			syllables: [
				{ text: "널", startTime: 0, endTime: 0.45, isPartOfWord: false },
				{ text: "사랑해", startTime: 0.45, endTime: 4, isPartOfWord: false },
			],
		});
		const tailWord = model.rows[0].main.words[1];

		expect(tailWord.extraClasses).toEqual(["korean-tail-word"]);
		expect(tailWord.tokens).toEqual([
			expect.objectContaining({
				text: "사랑",
				metadata: expect.objectContaining({ startTime: 0.45, endTime: 2.4025 }),
				extraClasses: ["korean-tail-base"],
			}),
			expect.objectContaining({
				text: "해",
				metadata: expect.objectContaining({ startTime: 2.4025, endTime: 4 }),
				extraClasses: ["korean-tail-sustain"],
			}),
		]);
	});
});
