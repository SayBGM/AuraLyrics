import { describe, expect, test } from "vitest";
import { addInterludes } from "../../src/lyrics/InterludeBuilder";
import type { LineLyrics, SyllableLyrics } from "../../src/lyrics/types";

describe("addInterludes", () => {
	test("adds automatic interludes only for gaps of at least six seconds", () => {
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 22,
			content: [
				{ type: "vocal", text: "First", startTime: 0, endTime: 4, oppositeAligned: false },
				{ type: "vocal", text: "Second", startTime: 9.5, endTime: 12, oppositeAligned: false },
				{ type: "vocal", text: "Third", startTime: 18, endTime: 22, oppositeAligned: false },
			],
		};

		const normalized = addInterludes(lyrics);

		expect(normalized.type).toBe("line");
		if (normalized.type !== "line") {
			throw new Error("expected line lyrics");
		}
		expect(normalized.content).toHaveLength(4);
		expect(normalized.content[1]).toMatchObject({ type: "vocal", text: "Second" });
		expect(normalized.content[2]).toMatchObject({ type: "interlude", startTime: 12, endTime: 17.75 });
	});

	test("removes trailing line interludes so outro gaps do not show a frame", () => {
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 14,
			content: [
				{ type: "vocal", text: "Last lyric", startTime: 0, endTime: 4, oppositeAligned: false },
				{ type: "interlude", startTime: 4, endTime: 14 },
			],
		};

		const normalized = addInterludes(lyrics);

		expect(normalized.type).toBe("line");
		if (normalized.type !== "line") {
			throw new Error("expected line lyrics");
		}
		expect(normalized.content).toEqual([{ type: "vocal", text: "Last lyric", startTime: 0, endTime: 4, oppositeAligned: false }]);
	});

	test("removes trailing syllable interludes so outro gaps do not show a frame", () => {
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 14,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 4,
						syllables: [{ text: "Last", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
				{ type: "interlude", startTime: 4, endTime: 14 },
			],
		};

		const normalized = addInterludes(lyrics);

		expect(normalized.type).toBe("syllable");
		if (normalized.type !== "syllable") {
			throw new Error("expected syllable lyrics");
		}
		expect(normalized.content).toHaveLength(1);
		expect(normalized.content.at(-1)?.type).toBe("vocal");
	});
});
