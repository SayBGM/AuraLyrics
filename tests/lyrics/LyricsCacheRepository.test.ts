import { describe, expect, test } from "vitest";
import { LyricsCache } from "../../src/lyrics/LyricsCache";
import { LyricsCacheRepository } from "../../src/lyrics/LyricsCacheRepository";
import type { LineLyrics } from "../../src/lyrics/types";

const lineLyrics = (text: string): LineLyrics => ({
	type: "line",
	startTime: 0,
	endTime: 4,
	content: [{ type: "vocal", text, startTime: 0, endTime: 4, oppositeAligned: false }],
});

describe("LyricsCacheRepository", () => {
	test("returns provider-mismatch without restoring a fallback cache entry", () => {
		const cache = new LyricsCache();
		cache.set("spotify:track:1", lineLyrics("Fallback"), "lrclib");
		const repository = new LyricsCacheRepository(cache);

		const result = repository.lookup("spotify:track:1", "spotify", false);

		expect(result).toEqual({
			cache: { status: "provider-mismatch", provider: "lrclib", primaryProvider: "spotify" },
		});
	});

	test("deletes an invalid matching entry and reports a miss", () => {
		const cache = new LyricsCache();
		cache.set("spotify:track:1", { ...lineLyrics("Invalid"), endTime: 0 }, "spotify");
		const repository = new LyricsCacheRepository(cache);

		const result = repository.lookup("spotify:track:1", "spotify", false);

		expect(result).toEqual({ cache: { status: "miss", primaryProvider: "spotify" } });
		expect(cache.get("spotify:track:1")).toBeUndefined();
	});

	test("stores only a successful primary-provider document", () => {
		const cache = new LyricsCache();
		const repository = new LyricsCacheRepository(cache);

		repository.storeCanonical("spotify:track:fallback", lineLyrics("Fallback"), "lrclib", "spotify");
		repository.storeCanonical("spotify:track:primary", lineLyrics("Primary"), "spotify", "spotify");

		expect(cache.get("spotify:track:fallback")).toBeUndefined();
		expect(cache.get("spotify:track:primary")).toMatchObject({ provider: "spotify" });
	});
});
