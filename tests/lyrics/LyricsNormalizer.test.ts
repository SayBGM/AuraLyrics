import { describe, expect, test } from "vitest";
import { normalizeLyrics } from "../../src/lyrics/LyricsNormalizer";
import type { LineLyrics } from "../../src/lyrics/types";

describe("normalizeLyrics", () => {
	test("turns line-synced music note vocals into interludes", () => {
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 12,
			content: [
				{ type: "vocal", text: "First", startTime: 0, endTime: 4, oppositeAligned: false },
				{ type: "vocal", text: "♪", startTime: 4, endTime: 8, oppositeAligned: false },
				{ type: "vocal", text: "♫ ♪", startTime: 8, endTime: 12, oppositeAligned: false },
			],
		};

		const normalized = normalizeLyrics(lyrics);

		expect(normalized.type).toBe("line");
		if (normalized.type !== "line") {
			throw new Error("expected line lyrics");
		}
		expect(normalized.content[0]).toMatchObject({ type: "vocal", text: "First" });
		expect(normalized.content[1]).toMatchObject({ type: "interlude", startTime: 4, endTime: 8 });
		expect(normalized.content[2]).toMatchObject({ type: "interlude", startTime: 8, endTime: 12 });
	});
});
