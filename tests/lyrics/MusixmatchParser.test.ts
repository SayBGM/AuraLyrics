import { describe, expect, test } from "vitest";
import { buildMusixmatchTranslationMap, parseMusixmatchRichsync, parseMusixmatchSubtitle } from "../../src/lyrics/parsers/MusixmatchParser";

describe("parseMusixmatchRichsync", () => {
	test("parses word-by-word richsync into syllable lyrics", () => {
		const lyrics = parseMusixmatchRichsync(
			JSON.stringify([
				{
					ts: 3.94,
					te: 7.24,
					l: [
						{ c: "Happy", o: 0 },
						{ c: " ", o: 0.33 },
						{ c: "birthday", o: 0.66 },
						{ c: " ", o: 1.8 },
						{ c: "to", o: 1.92 },
						{ c: " ", o: 2.235 },
						{ c: "you", o: 2.55 },
					],
					x: "Happy birthday to you",
				},
			])
		);

		expect(lyrics?.type).toBe("syllable");
		if (lyrics?.type !== "syllable") {
			throw new Error("expected syllable lyrics");
		}
		const vocal = lyrics.content[0];
		expect(vocal.type).toBe("vocal");
		if (vocal.type !== "vocal") {
			throw new Error("expected vocal");
		}
		expect(vocal.lead.syllables.map((syllable) => syllable.text)).toEqual(["Happy", "birthday", "to", "you"]);
		expect(vocal.lead.syllables[0]).toMatchObject({ startTime: 3.94, endTime: 4.6, isPartOfWord: false });
		expect(vocal.lead.syllables.at(-1)).toMatchObject({ startTime: 6.49, endTime: 7.24 });
	});

	test("attaches translations matched against the full richsync line text", () => {
		const translations = buildMusixmatchTranslationMap([
			{ translation: { subtitle_matched_line: "Happy birthday to you", description: "생일 축하해" } },
		]);
		const lyrics = parseMusixmatchRichsync(
			JSON.stringify([
				{
					ts: 3.94,
					te: 7.24,
					l: [
						{ c: "Happy", o: 0 },
						{ c: " ", o: 0.33 },
						{ c: "birthday", o: 0.66 },
						{ c: " ", o: 1.8 },
						{ c: "to", o: 1.92 },
						{ c: " ", o: 2.235 },
						{ c: "you", o: 2.55 },
					],
					x: "Happy birthday to you",
				},
			]),
			translations
		);

		if (lyrics?.type !== "syllable" || lyrics.content[0].type !== "vocal") {
			throw new Error("expected syllable vocal");
		}
		expect(lyrics.content[0].translatedText).toBe("생일 축하해");
	});

	test("repairs a final token at the line end from the preceding whitespace timing", () => {
		const lyrics = parseMusixmatchRichsync(
			JSON.stringify([
				{
					ts: 148.18,
					te: 149.805,
					l: [
						{ c: "되는", o: 0 },
						{ c: " ", o: 1.207 },
						{ c: "건", o: 1.625 },
					],
					x: "되는 건",
				},
			])
		);

		if (lyrics?.type !== "syllable" || lyrics.content[0].type !== "vocal") {
			throw new Error("expected syllable vocal");
		}
		const lead = lyrics.content[0].lead;
		expect(lead.startTime).toBe(148.18);
		expect(lead.endTime).toBe(149.805);
		expect(lead.syllables.map((syllable) => syllable.text)).toEqual(["되는", "건"]);
		expect(lead.syllables[0]).toMatchObject({ startTime: 148.18, endTime: 149.387 });
		expect(lead.syllables[1]).toMatchObject({ startTime: 149.387, endTime: 149.805 });
	});

	test("preserves adjacent tokens when their source offsets are reversed", () => {
		const lyrics = parseMusixmatchRichsync(
			JSON.stringify([
				{
					ts: 160.55,
					te: 164.358,
					l: [
						{ c: "시간은", o: 0 },
						{ c: " ", o: 1.207 },
						{ c: "조각칼을", o: 1.393 },
						{ c: " ", o: 3.297 },
						{ c: "든", o: 3.808 },
						{ c: " ", o: 3.807 },
						{ c: "채", o: 3.807 },
					],
					x: "시간은 조각칼을 든 채",
				},
			])
		);

		if (lyrics?.type !== "syllable" || lyrics.content[0].type !== "vocal") {
			throw new Error("expected syllable vocal");
		}
		const syllables = lyrics.content[0].lead.syllables;
		expect(syllables.map((syllable) => syllable.text)).toEqual(["시간은", "조각칼을", "든", "채"]);
		expect(syllables[2]).toMatchObject({ startTime: 163.847, endTime: 164.357 });
		expect(syllables[3]).toMatchObject({ startTime: 164.357, endTime: 164.358 });
		for (const [index, syllable] of syllables.entries()) {
			expect(syllable.endTime).toBeGreaterThan(syllable.startTime);
			if (index > 0) {
				expect(syllable.startTime).toBe(syllables[index - 1].endTime);
			}
		}
	});

	test("backfills a minimal positive range when no whitespace timing can repair the boundary", () => {
		const lyrics = parseMusixmatchRichsync(
			JSON.stringify([
				{
					ts: 10,
					te: 11,
					l: [
						{ c: "front", o: 0 },
						{ c: "back", o: 1 },
					],
					x: "frontback",
				},
			])
		);

		if (lyrics?.type !== "syllable" || lyrics.content[0].type !== "vocal") {
			throw new Error("expected syllable vocal");
		}
		const syllables = lyrics.content[0].lead.syllables;
		expect(syllables.map((syllable) => syllable.text)).toEqual(["front", "back"]);
		expect(syllables[0]).toMatchObject({ startTime: 10, endTime: 10.999 });
		expect(syllables[1]).toMatchObject({ startTime: 10.999, endTime: 11 });
	});

	test("ignores non-numeric token offsets while preserving valid tokens", () => {
		const lyrics = parseMusixmatchRichsync(
			JSON.stringify([
				{
					ts: 10,
					te: 12,
					l: [
						{ c: "valid", o: 0 },
						{ c: "invalid", o: "not-a-number" },
					],
					x: "valid invalid",
				},
			])
		);

		if (lyrics?.type !== "syllable" || lyrics.content[0].type !== "vocal") {
			throw new Error("expected syllable vocal");
		}
		expect(lyrics.content[0].lead.syllables.map((syllable) => syllable.text)).toEqual(["valid"]);
	});
});

describe("parseMusixmatchSubtitle", () => {
	test("attaches translations to matching lines and leaves the rest untranslated", () => {
		const translations = buildMusixmatchTranslationMap([
			{ translation: { subtitle_matched_line: "Loves all of you", description: "너의 모든 것을 사랑해" } },
			{ translation: { snippet: "ignored without description" } },
		]);
		const lyrics = parseMusixmatchSubtitle(
			JSON.stringify([
				{ text: "Loves all of you", time: { total: 1 } },
				{ text: "Second line", time: { total: 5 } },
			]),
			translations
		);

		if (lyrics?.type !== "line") {
			throw new Error("expected line lyrics");
		}
		const vocals = lyrics.content.filter((item) => item.type === "vocal");
		expect(vocals[0].translatedText).toBe("너의 모든 것을 사랑해");
		expect(vocals[1].translatedText).toBeUndefined();
	});

	test("matches translations case- and whitespace-insensitively and skips identity translations", () => {
		const translations = buildMusixmatchTranslationMap([
			{ translation: { subtitle_matched_line: "Loves  ALL of you ", description: "너의 모든 것을 사랑해" } },
			{ translation: { subtitle_matched_line: "같은 문장", description: "같은  문장" } },
		]);
		const lyrics = parseMusixmatchSubtitle(
			JSON.stringify([
				{ text: "loves all of YOU", time: { total: 1 } },
				{ text: "같은 문장", time: { total: 5 } },
			]),
			translations
		);

		if (lyrics?.type !== "line") {
			throw new Error("expected line lyrics");
		}
		const vocals = lyrics.content.filter((item) => item.type === "vocal");
		expect(vocals[0].translatedText).toBe("너의 모든 것을 사랑해");
		expect(vocals[1].translatedText).toBeUndefined();
	});
});
