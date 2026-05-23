import { describe, expect, test } from "vitest";
import { addInterludes } from "../../src/lyrics/InterludeBuilder";
import type { LineLyrics } from "../../src/lyrics/types";

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
});
