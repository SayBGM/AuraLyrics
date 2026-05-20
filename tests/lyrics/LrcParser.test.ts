import { describe, expect, test } from "vitest";
import { parseLrc } from "../../src/lyrics/parsers/LrcParser";

describe("parseLrc", () => {
	test("parses line-synced LRC into line lyrics with inferred end times", () => {
		const lyrics = parseLrc("[00:01.00]First line\n[00:04.50]Second line\n[00:07.00]");

		expect(lyrics.type).toBe("line");
		expect(lyrics.content).toHaveLength(3);
		expect(lyrics.content[0]).toMatchObject({ type: "vocal", text: "First line", startTime: 1, endTime: 4.5 });
		expect(lyrics.content[1]).toMatchObject({ type: "vocal", text: "Second line", startTime: 4.5, endTime: 7 });
		expect(lyrics.content[2]).toMatchObject({ type: "interlude", startTime: 7 });
	});

	test("parses enhanced LRC word timings into syllable lyrics", () => {
		const lyrics = parseLrc("[00:10.00]<00:10.00>Hello <00:10.50>world\n[00:12.00]Next");

		expect(lyrics.type).toBe("syllable");
		if (lyrics.type !== "syllable") {
			throw new Error("expected syllable lyrics");
		}
		const first = lyrics.content[0];
		expect(first.type).toBe("vocal");
		if (first.type !== "vocal") {
			throw new Error("expected vocal");
		}
		expect(first.lead.syllables.map((syllable) => syllable.text)).toEqual(["Hello", "world"]);
		expect(first.lead.syllables[0]).toMatchObject({ startTime: 10, endTime: 10.5, isPartOfWord: false });
	});
});
