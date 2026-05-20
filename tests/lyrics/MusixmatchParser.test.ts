import { describe, expect, test } from "vitest";
import { parseMusixmatchRichsync } from "../../src/lyrics/parsers/MusixmatchParser";

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
});
