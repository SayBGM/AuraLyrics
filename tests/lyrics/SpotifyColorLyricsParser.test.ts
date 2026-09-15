import { describe, expect, test } from "vitest";
import { prepareProviderLyrics } from "../../src/lyrics/LyricsDocumentTransforms";
import { parseSpotifyColorLyrics } from "../../src/lyrics/parsers/SpotifyColorLyricsParser";

describe("parseSpotifyColorLyrics", () => {
	test("parses line-synced lyrics into LineLyrics with derived end times", () => {
		const lyrics = parseSpotifyColorLyrics({
			lyrics: {
				syncType: "LINE_SYNCED",
				lines: [
					{ startTimeMs: "1000", words: "First line" },
					{ startTimeMs: "4500", words: "Second line" },
				],
			},
		});

		expect(lyrics?.type).toBe("line");
		expect(lyrics?.startTime).toBe(1);
		expect(lyrics?.endTime).toBe(8.5);
		expect(lyrics?.content).toEqual([
			{
				type: "vocal",
				text: "First line",
				startTime: 1,
				endTime: 4.5,
				oppositeAligned: false,
			},
			{
				type: "vocal",
				text: "Second line",
				startTime: 4.5,
				endTime: 8.5,
				oppositeAligned: false,
			},
		]);
	});

	test("accepts numeric startTimeMs values, not just strings", () => {
		const lyrics = parseSpotifyColorLyrics({
			lyrics: {
				syncType: "LINE_SYNCED",
				lines: [{ startTimeMs: 2000, words: "Only line" }],
			},
		});

		expect(lyrics?.content[0]).toMatchObject({ startTime: 2, endTime: 6 });
	});

	test("substitutes a musical note for an empty line (instrumental gap marker)", () => {
		const lyrics = parseSpotifyColorLyrics({
			lyrics: {
				syncType: "LINE_SYNCED",
				lines: [
					{ startTimeMs: "0", words: "" },
					{ startTimeMs: "3000", words: "Real lyrics" },
				],
			},
		});

		expect(lyrics?.content[0]).toMatchObject({ type: "vocal", text: "♪" });
	});

	test("ends lines that share a timestamp at the next distinct timestamp so validation keeps the document", () => {
		const lyrics = parseSpotifyColorLyrics({
			lyrics: {
				syncType: "LINE_SYNCED",
				lines: [
					{ startTimeMs: "1000", words: "First line" },
					{ startTimeMs: "3000", words: "Second line" },
					{ startTimeMs: "3000", words: "Same-time line" },
					{ startTimeMs: "5000", words: "Last line" },
				],
			},
		});

		expect(lyrics?.content.map((item) => [item.startTime, item.endTime])).toEqual([
			[1, 3],
			[3, 5],
			[3, 5],
			[5, 9],
		]);
		if (!lyrics) throw new Error("expected lyrics");
		expect(() => prepareProviderLyrics(lyrics)).not.toThrow();
	});

	test("parses SYLLABLE_SYNCED payloads as line lyrics", () => {
		const lyrics = parseSpotifyColorLyrics({
			lyrics: {
				syncType: "SYLLABLE_SYNCED",
				lines: [
					{ startTimeMs: "1000", words: "First line", syllables: [] },
					{ startTimeMs: "2500", words: "Second line", syllables: [] },
				],
			},
		});

		expect(lyrics?.type).toBe("line");
		expect(lyrics?.content).toMatchObject([
			{ text: "First line", startTime: 1, endTime: 2.5 },
			{ text: "Second line", startTime: 2.5, endTime: 6.5 },
		]);
	});

	test("falls back to the first syllable start when a line has no usable startTimeMs", () => {
		const lyrics = parseSpotifyColorLyrics({
			lyrics: {
				syncType: "SYLLABLE_SYNCED",
				lines: [
					{ words: "First line", syllables: [{ startTimeMs: "1200" }] },
					{ startTimeMs: "3000", words: "Second line" },
				],
			},
		});

		expect(lyrics?.content[0]).toMatchObject({ startTime: 1.2, endTime: 3 });
	});

	test("returns undefined when syncType is UNSYNCED", () => {
		expect(
			parseSpotifyColorLyrics({
				lyrics: { syncType: "UNSYNCED", lines: [{ startTimeMs: "0", words: "line" }] },
			})
		).toBeUndefined();
	});

	test("returns undefined when there are no lines", () => {
		expect(parseSpotifyColorLyrics({ lyrics: { syncType: "LINE_SYNCED", lines: [] } })).toBeUndefined();
		expect(parseSpotifyColorLyrics({ lyrics: { syncType: "LINE_SYNCED" } })).toBeUndefined();
		expect(parseSpotifyColorLyrics({})).toBeUndefined();
	});
});
