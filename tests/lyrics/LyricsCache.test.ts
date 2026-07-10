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
		return true;
	}

	public delete(key: string) {
		return this.values.delete(key);
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
			delete: () => false,
		};
		const cache = new LyricsCache(storage);

		expect(() => cache.set("spotify:track:1", lyrics, "spotify")).not.toThrow();
		expect(cache.get("spotify:track:1")?.provider).toBe("spotify");
	});

	test("retries a false storage write after removing the oldest entry", () => {
		let now = 1000;
		let failNextWrite = false;
		const writes: string[] = [];
		const storage = {
			get: () => null,
			set: (_key: string, value: string) => {
				writes.push(value);
				if (!failNextWrite) return true;
				failNextWrite = false;
				return false;
			},
		};
		const cache = new LyricsCache(storage, { now: () => now });
		cache.set("spotify:track:oldest", lyrics, "spotify");
		now += 1;
		failNextWrite = true;
		const writesBeforeFailure = writes.length;

		cache.set("spotify:track:newest", lyrics, "lrclib");

		const recoveryWrites = writes.slice(writesBeforeFailure);
		expect(recoveryWrites).toHaveLength(2);
		expect(recoveryWrites[0]).toContain("spotify:track:oldest");
		expect(recoveryWrites[1]).not.toContain("spotify:track:oldest");
		expect(recoveryWrites[1]).toContain("spotify:track:newest");
	});

	test("persists lyrics across cache instances", () => {
		const storage = new MemoryStorage();
		new LyricsCache(storage).set("spotify:track:1", lyrics, "lrclib");

		const restored = new LyricsCache(storage).get("spotify:track:1");

		expect(restored?.provider).toBe("lrclib");
		expect(restored?.lyrics).toMatchObject(lyrics);
	});

	test("ignores stale v1 caches so tracks re-fetch with translations", () => {
		const storage = new MemoryStorage();
		const entry = JSON.stringify([["spotify:track:legacy", { lyrics, provider: "spotify", updatedAt: Date.now() }]]);
		storage.set("aura-lyrics:lyrics-cache-v1", entry);
		storage.set("dynamic-popup-lyrics:lyrics-cache-v1", entry);

		expect(new LyricsCache(storage).get("spotify:track:legacy")).toBeUndefined();
	});

	test("clear removes stale cache keys alongside the current one", () => {
		const storage = new MemoryStorage();
		storage.set("aura-lyrics:lyrics-cache-v1", "stale");
		storage.set("dynamic-popup-lyrics:lyrics-cache-v1", "stale");
		const cache = new LyricsCache(storage);
		cache.set("spotify:track:1", lyrics, "spotify");

		cache.clear();

		expect(storage.values.has("aura-lyrics:lyrics-cache-v1")).toBe(false);
		expect(storage.values.has("dynamic-popup-lyrics:lyrics-cache-v1")).toBe(false);
		expect(cache.get("spotify:track:1")).toBeUndefined();
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

	test("enforces serialized entry and total size caps", () => {
		const storage = new MemoryStorage();
		const cache = new LyricsCache(storage, { maxEntryBytes: 256, maxTotalBytes: 600 });
		cache.set(
			"spotify:track:large",
			{ ...lyrics, content: [{ type: "vocal", text: "x".repeat(1000), startTime: 0, endTime: 1, oppositeAligned: false }] },
			"spotify"
		);
		expect(cache.get("spotify:track:large")).toBeUndefined();
		for (let index = 0; index < 10; index += 1) cache.set(`spotify:track:${index}`, lyrics, "spotify");
		expect(storage.values.get("aura-lyrics:lyrics-cache-v2")?.length).toBeLessThanOrEqual(600);
	});
});
