import { describe, expect, test } from "vitest";
import { prepareProviderLyrics, restoreCachedLyrics, toDisplayLyrics } from "../../src/lyrics/LyricsDocumentTransforms";
import type { LineLyrics, SyllableLyrics } from "../../src/lyrics/types";

describe("toDisplayLyrics", () => {
	test("splits Hangul word syllables for display without touching the canonical document shape", () => {
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 1,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 1,
						syllables: [{ text: "안녕", startTime: 0, endTime: 1, isPartOfWord: false }],
					},
				},
			],
		};

		const displayed = toDisplayLyrics(lyrics);

		if (displayed.type !== "syllable" || displayed.content[0].type !== "vocal") {
			throw new Error("expected syllable vocal");
		}
		expect(displayed.content[0].lead.syllables.map((syllable) => syllable.text)).toEqual(["안", "녕"]);
	});

	test("passes non-syllable documents through unchanged", () => {
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 4,
			content: [{ type: "vocal", text: "Hello", startTime: 0, endTime: 4, oppositeAligned: false }],
		};

		expect(toDisplayLyrics(lyrics)).toBe(lyrics);
	});
});

describe("prepareProviderLyrics", () => {
	test("normalizes note-only vocals into interludes, fills large gaps, and validates the result", () => {
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 20,
			content: [
				{ type: "vocal", text: "First", startTime: 0, endTime: 2, oppositeAligned: false },
				{ type: "vocal", text: "♪", startTime: 2, endTime: 4, oppositeAligned: false },
				{ type: "vocal", text: "Second", startTime: 12, endTime: 20, oppositeAligned: false },
			],
		};

		const prepared = prepareProviderLyrics(lyrics);

		expect(prepared.type).toBe("line");
		if (prepared.type !== "line") {
			throw new Error("expected line lyrics");
		}
		expect(prepared.content[0]).toMatchObject({ type: "vocal", text: "First" });
		expect(prepared.content[1]).toMatchObject({ type: "interlude", startTime: 2, endTime: 4 });
		// The 8s gap between the note-turned-interlude (ending at 4) and "Second" (starting at 12)
		// is >= the generated-interlude threshold, so addInterludes should insert one there too.
		expect(prepared.content[2]).toMatchObject({ type: "interlude", generated: true, startTime: 4 });
		expect(prepared.content.at(-1)).toMatchObject({ type: "vocal", text: "Second" });
	});

	test("throws when the resulting document fails validation", () => {
		const invalid = {
			type: "line",
			startTime: 0,
			endTime: 4,
			content: [{ type: "vocal", text: "Hello", startTime: 4, endTime: 0, oppositeAligned: false }],
		} as unknown as LineLyrics;

		expect(() => prepareProviderLyrics(invalid)).toThrow();
	});
});

describe("restoreCachedLyrics", () => {
	test("rebuilds interludes from scratch, revalidates, and re-splits Hangul syllables for display", () => {
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 21,
			content: [
				// A stale generated interlude with the wrong bounds, as if settings changed since caching.
				{ type: "interlude", startTime: 2, endTime: 3, generated: true },
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 2,
						syllables: [{ text: "안녕", startTime: 0, endTime: 2, isPartOfWord: false }],
					},
				},
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 15,
						endTime: 21,
						syllables: [{ text: "Second", startTime: 15, endTime: 21, isPartOfWord: false }],
					},
				},
			],
		};

		const restored = restoreCachedLyrics(lyrics);

		expect(restored.type).toBe("syllable");
		if (restored.type !== "syllable") {
			throw new Error("expected syllable lyrics");
		}
		const vocals = restored.content.filter((item) => item.type === "vocal");
		const interludes = restored.content.filter((item) => item.type === "interlude");
		expect(vocals[0].lead.syllables.map((syllable) => syllable.text)).toEqual(["안", "녕"]);
		// The stale interlude is discarded and rebuilt from the actual 13s gap (2 -> 15).
		expect(interludes).toHaveLength(1);
		expect(interludes[0]).toMatchObject({ generated: true, startTime: 2 });
	});
});
