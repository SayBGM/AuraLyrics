import { describe, expect, test } from "vitest";
import { splitHangulSyllables } from "../../src/lyrics/splitHangulSyllables";
import type { Syllable, SyllableLyrics, SyllableVocal } from "../../src/lyrics/types";
import { buildSyllableRows, type SyllableVisualGroup } from "../../src/renderer/lyrics/syllableRows";

const vocal = (text: string, startTime = 0, endTime = 4): SyllableVocal => ({
	startTime,
	endTime,
	syllables: [{ text, startTime, endTime, isPartOfWord: false }],
});

const mainText = (row: ReturnType<typeof buildSyllableRows>["rows"][number]): string =>
	row.main.words.flatMap((word) => word.tokens.map((token) => token.text)).join("");

const echoText = (row: ReturnType<typeof buildSyllableRows>["rows"][number]): string =>
	row.echo.words.flatMap((word) => word.tokens.map((token) => token.text)).join("");

describe("buildSyllableRows", () => {
	test("keeps a multi-token Korean parenthetical in the echo after Hangul splitting", () => {
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 168.06,
			endTime: 170.984,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 168.06,
						endTime: 170.984,
						syllables: [
							{ text: "너와", startTime: 168.06, endTime: 168.214, isPartOfWord: false },
							{ text: "나", startTime: 168.214, endTime: 168.385, isPartOfWord: false },
							{ text: "둘이", startTime: 168.385, endTime: 168.594, isPartOfWord: false },
							{ text: "이", startTime: 168.594, endTime: 168.942, isPartOfWord: false },
							{ text: "밤을", startTime: 168.942, endTime: 169.407, isPartOfWord: false },
							{ text: "새워", startTime: 169.407, endTime: 170.057, isPartOfWord: false },
							{ text: "(이", startTime: 170.057, endTime: 170.522, isPartOfWord: false },
							{ text: "밤을", startTime: 170.522, endTime: 170.869, isPartOfWord: false },
							{ text: "새워)", startTime: 170.869, endTime: 170.984, isPartOfWord: false },
						],
					},
				},
			],
		};
		const split = splitHangulSyllables(lyrics);
		const item = split.content[0];
		if (item.type !== "vocal") {
			throw new Error("expected vocal");
		}
		const model = buildSyllableRows(item.lead);
		const words = (group: SyllableVisualGroup): string[] => group.words.map((word) => word.tokens.map((token) => token.text).join(""));

		expect(model.rows).toHaveLength(1);
		expect(words(model.rows[0].main)).toEqual(["너와", "나", "둘이", "이", "밤을", "새워"]);
		expect(words(model.rows[0].echo)).toEqual(["이", "밤을", "새워"]);
		expect(words(model.rows[0].main).join("")).not.toContain(")");
	});

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

	test("stacks an inline short ad-lib before comma-led following lyrics", () => {
		const model = buildSyllableRows(vocal("피땀으로 (hey), 눈물로 (hey)", 0, 4));

		expect(model.rows.map(mainText)).toEqual(["피땀으로", "", "눈물로"]);
		expect(model.rows.map(echoText)).toEqual(["", "hey", "hey"]);
		expect(model.rows[1].rowClasses).toContain("parenthetical-only");
		expect(model.rows[1].rowClasses).not.toContain("standalone-parenthetical");
		expect(model.rows[2].main.words[0].tokens[0].text.startsWith(",")).toBe(false);
	});

	test("stacks a leading parenthetical ad-lib before the following lyric", () => {
		const model = buildSyllableRows(vocal("(hey), 눈물로", 0, 3));

		expect(model.rows.map(mainText)).toEqual(["", "눈물로"]);
		expect(model.rows.map(echoText)).toEqual(["hey", ""]);
		expect(model.rows[0].rowClasses).toContain("parenthetical-only");
		expect(model.rows[0].rowClasses).not.toContain("standalone-parenthetical");
	});

	test("stacks repeated short ad-libs while leaving the following lyric clean", () => {
		const model = buildSyllableRows(vocal("피땀으로 (hey), 눈물로 (hey) 채운게 미련하다고", 0, 6));

		expect(model.rows.map(mainText)).toEqual(["피땀으로", "", "눈물로", "", "채운게 미련하다고"]);
		expect(model.rows.map(echoText)).toEqual(["", "hey", "", "hey", ""]);
	});

	test("stacks provider-split short ad-libs before following lyric tokens", () => {
		const model = buildSyllableRows({
			startTime: 0,
			endTime: 6,
			syllables: [
				{ text: "피땀으로", startTime: 0, endTime: 1, isPartOfWord: false },
				{ text: "(hey),", startTime: 1, endTime: 2, isPartOfWord: false },
				{ text: "눈물로", startTime: 2, endTime: 3, isPartOfWord: false },
				{ text: "(hey)", startTime: 3, endTime: 4, isPartOfWord: false },
				{ text: "채운게", startTime: 4, endTime: 5, isPartOfWord: false },
				{ text: "미련하다고", startTime: 5, endTime: 6, isPartOfWord: false },
			],
		});

		expect(model.rows.map(mainText)).toEqual(["피땀으로", "", "눈물로", "", "채운게미련하다고"]);
		expect(model.rows.map(echoText)).toEqual(["", "hey", "", "hey", ""]);
	});

	test("stacks hyphenated English ad-libs before a trailing lyric", () => {
		const model = buildSyllableRows(vocal("But friends know la-la-la (la-la), huh", 0, 5));

		expect(model.rows.map(mainText)).toEqual(["But friends know la-la-la", "", "huh"]);
		expect(model.rows.map(echoText)).toEqual(["", "la-la", ""]);
	});

	test("marks a fully parenthesized lyric row as standalone", () => {
		const model = buildSyllableRows(vocal("(괜찮아)", 0, 2));

		expect(model.rows.map(mainText)).toEqual([""]);
		expect(model.rows.map(echoText)).toEqual(["괜찮아"]);
		expect(model.rows[0].rowClasses).toContain("parenthetical-only");
		expect(model.rows[0].rowClasses).toContain("standalone-parenthetical");
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

	test("applies melisma sustain classes to a split final single-char syllable held long enough", () => {
		const model = buildSyllableRows({
			startTime: 2.0,
			endTime: 8.0,
			syllables: [
				{ text: "사", startTime: 2.0, endTime: 2.3, isPartOfWord: false },
				{ text: "랑", startTime: 2.3, endTime: 2.6, isPartOfWord: true },
				{ text: "해", startTime: 2.6, endTime: 8.0, isPartOfWord: true },
			],
		});
		const tailWord = model.rows[0].main.words.at(-1);

		expect(tailWord?.tokens.at(-1)).toEqual(
			expect.objectContaining({
				text: "해",
				extraClasses: ["korean-tail-sustain", "korean-melisma-sustain"],
			})
		);
		expect(tailWord?.extraClasses).toContain("korean-melisma-word");
	});

	test("applies only the sustain class (no melisma) for a moderately held final split syllable", () => {
		const model = buildSyllableRows({
			startTime: 0,
			endTime: 4.4,
			syllables: [
				{ text: "사", startTime: 0, endTime: 0.3, isPartOfWord: false },
				{ text: "랑", startTime: 0.3, endTime: 0.6, isPartOfWord: true },
				{ text: "해", startTime: 0.6, endTime: 4.4, isPartOfWord: true },
			],
		});
		const tailWord = model.rows[0].main.words.at(-1);

		expect(tailWord?.tokens.at(-1)).toEqual(
			expect.objectContaining({
				text: "해",
				extraClasses: ["korean-tail-sustain"],
			})
		);
		expect(tailWord?.extraClasses).toContain("korean-tail-word");
		expect(tailWord?.extraClasses).not.toContain("korean-melisma-word");
	});

	test("applies no melisma sustain classes when the final split syllable is short", () => {
		const model = buildSyllableRows({
			startTime: 0,
			endTime: 0.9,
			syllables: [
				{ text: "사", startTime: 0, endTime: 0.3, isPartOfWord: false },
				{ text: "랑", startTime: 0.3, endTime: 0.6, isPartOfWord: true },
				{ text: "해", startTime: 0.6, endTime: 0.9, isPartOfWord: true },
			],
		});
		const tailWord = model.rows[0].main.words.at(-1);

		expect(tailWord?.tokens.at(-1)?.extraClasses).toEqual([]);
		expect(tailWord?.extraClasses).not.toContain("korean-tail-word");
	});
});

describe("buildSyllableRows isPartOfWord grouping", () => {
	const syl = (text: string, startTime: number, endTime: number, isPartOfWord: boolean): Syllable => ({ text, startTime, endTime, isPartOfWord });
	const wordTexts = (model: ReturnType<typeof buildSyllableRows>): string[][] =>
		model.rows.flatMap((row) => row.main.words.map((word) => word.tokens.map((token) => token.text)));

	test("groups consecutive in-word syllables into one word", () => {
		const model = buildSyllableRows({
			startTime: 2.0,
			endTime: 3.0,
			syllables: [
				syl("별", 2.0, 2.2, false),
				syl("빛", 2.2, 2.4, true),
				syl("이", 2.4, 2.6, true),
				syl("내", 2.6, 2.8, false),
				syl("린", 2.8, 3.0, true),
			],
		});
		expect(wordTexts(model)).toEqual([
			["별", "빛", "이"],
			["내", "린"],
		]);
	});
});
