import { describe, expect, test } from "vitest";
import { LyricsCache } from "../../src/lyrics/LyricsCache";
import type { LyricsDocument } from "../../src/lyrics/types";

class MemoryStorage {
	public readonly values = new Map<string, string>();

	public get(key: string) {
		return this.values.get(key) ?? null;
	}

	public set(key: string, value: string) {
		this.values.set(key, value);
	}

	public delete(key: string) {
		this.values.delete(key);
	}
}

const lyrics: LyricsDocument = {
	type: "line",
	startTime: 0,
	endTime: 1,
	content: [
		{
			type: "vocal",
			text: "Cached",
			startTime: 0,
			endTime: 1,
			oppositeAligned: false,
		},
	],
};

describe("LyricsCache", () => {
	test("keeps memory cache when persistent storage write fails", () => {
		const storage = {
			get: () => null,
			set: () => {
				throw new Error("quota exceeded");
			},
			delete: () => undefined,
		};
		const cache = new LyricsCache(storage);

		expect(() => cache.set("spotify:track:1", lyrics, "spotify")).not.toThrow();
		expect(cache.get("spotify:track:1")?.provider).toBe("spotify");
	});

	test("persists lyrics across cache instances", () => {
		const storage = new MemoryStorage();
		new LyricsCache(storage).set("spotify:track:1", lyrics, "lrclib");

		const restored = new LyricsCache(storage).get("spotify:track:1");

		expect(restored?.provider).toBe("lrclib");
		expect(restored?.lyrics).toMatchObject(lyrics);
	});

	test("loads lyrics from the previous dynamic popup cache key", () => {
		const storage = new MemoryStorage();
		storage.set(
			"dynamic-popup-lyrics:lyrics-cache-v1",
			JSON.stringify([["spotify:track:legacy", { lyrics, provider: "spotify", updatedAt: Date.now() }]])
		);

		const restored = new LyricsCache(storage).get("spotify:track:legacy");

		expect(restored?.provider).toBe("spotify");
	});

	test("drops expired lyrics", () => {
		const storage = new MemoryStorage();
		const now = 1000;
		const cache = new LyricsCache(storage, { ttlMs: 10, now: () => now });
		cache.set("spotify:track:1", lyrics, "spotify");

		const expired = new LyricsCache(storage, {
			ttlMs: 10,
			now: () => now + 11,
		}).get("spotify:track:1");

		expect(expired).toBeUndefined();
	});

	test("evicts least recently written lyrics when max entries is exceeded", () => {
		const storage = new MemoryStorage();
		let now = Date.now();
		const cache = new LyricsCache(storage, { maxEntries: 2, now: () => now });
		cache.set("spotify:track:1", lyrics, "spotify");
		now += 1;
		cache.set("spotify:track:2", lyrics, "lrclib");
		now += 1;
		cache.set("spotify:track:3", lyrics, "musixmatch");

		expect(new LyricsCache(storage).get("spotify:track:1")).toBeUndefined();
		expect(new LyricsCache(storage).get("spotify:track:2")?.provider).toBe("lrclib");
		expect(new LyricsCache(storage).get("spotify:track:3")?.provider).toBe("musixmatch");
	});
});
