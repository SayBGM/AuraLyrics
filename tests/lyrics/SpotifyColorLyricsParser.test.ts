import { describe, expect, test } from "vitest";
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

	test("returns undefined when syncType is not LINE_SYNCED", () => {
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
