import { describe, expect, test, vi } from "vitest";
import { TrackLyricsDelayStore } from "../../src/settings/TrackLyricsDelayStore";

class MemoryStorage {
	public readonly values = new Map<string, string>();

	public get(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	public set(key: string, value: string): boolean {
		this.values.set(key, value);
		return true;
	}
}

const STORAGE_KEY = "aura-lyrics:track-delays-v1";

describe("TrackLyricsDelayStore", () => {
	test("persists independent normalized delays and resolves them ahead of the global default", () => {
		const storage = new MemoryStorage();
		const store = new TrackLyricsDelayStore(storage, { now: () => 100 });

		expect(store.set("spotify:track:first", 49.6)).toEqual({ delayMs: 50, persisted: true });
		expect(store.set("spotify:track:second", 99999)).toEqual({ delayMs: 5000, persisted: true });
		expect(store.set("spotify:track:third", -99999)).toEqual({ delayMs: -5000, persisted: true });
		expect(store.set("spotify:track:non-finite", Number.NaN)).toEqual({ delayMs: 0, persisted: true });

		expect(store.resolve("spotify:track:first", 250)).toBe(50);
		expect(store.resolve("spotify:track:missing", 250)).toBe(250);
		expect(new TrackLyricsDelayStore(storage).get("spotify:track:first")).toBe(50);
	});

	test("loads the newest valid duplicate, clamps saved values, and ignores malformed entries", () => {
		const storage = new MemoryStorage();
		storage.values.set(
			STORAGE_KEY,
			JSON.stringify([
				{ uri: "spotify:track:valid", delayMs: 200, updatedAt: 10 },
				{ uri: "spotify:track:valid", delayMs: 325.6, updatedAt: 20 },
				{ uri: "spotify:track:clamped", delayMs: 7000, updatedAt: 30 },
				{ uri: "", delayMs: 100, updatedAt: 40 },
				{ uri: "spotify:track:nan", delayMs: null, updatedAt: 50 },
				"invalid",
			])
		);

		const store = new TrackLyricsDelayStore(storage);

		expect(store.get("spotify:track:valid")).toBe(326);
		expect(store.get("spotify:track:clamped")).toBe(5000);
		expect(store.get("spotify:track:nan")).toBeUndefined();
	});

	test("falls back to an empty store for invalid JSON", () => {
		const storage = new MemoryStorage();
		storage.values.set(STORAGE_KEY, "not-json");

		expect(new TrackLyricsDelayStore(storage).resolve("spotify:track:any", 175)).toBe(175);
	});

	test("deletes only the requested override and restores the default resolution", () => {
		const storage = new MemoryStorage();
		const store = new TrackLyricsDelayStore(storage);
		store.set("spotify:track:first", 100);
		store.set("spotify:track:second", 200);

		expect(store.delete("spotify:track:first")).toBe(true);
		expect(store.resolve("spotify:track:first", 25)).toBe(25);
		expect(store.get("spotify:track:second")).toBe(200);
		expect(new TrackLyricsDelayStore(storage).get("spotify:track:first")).toBeUndefined();
	});

	test("keeps only the most recently modified entries", () => {
		const storage = new MemoryStorage();
		let now = 0;
		const store = new TrackLyricsDelayStore(storage, { maxEntries: 3, now: () => ++now });
		store.set("spotify:track:first", 1);
		store.set("spotify:track:second", 2);
		store.set("spotify:track:third", 3);
		store.set("spotify:track:first", 4);
		store.set("spotify:track:fourth", 5);

		expect(store.get("spotify:track:first")).toBe(4);
		expect(store.get("spotify:track:third")).toBe(3);
		expect(store.get("spotify:track:fourth")).toBe(5);
		expect(store.get("spotify:track:second")).toBeUndefined();
	});

	test("uses a 500-song default capacity", () => {
		const storage = new MemoryStorage();
		let now = 0;
		const store = new TrackLyricsDelayStore(storage, { now: () => ++now });
		for (let index = 0; index <= 500; index += 1) {
			store.set(`spotify:track:${index}`, index);
		}

		expect(JSON.parse(storage.get(STORAGE_KEY) ?? "[]")).toHaveLength(500);
		expect(store.get("spotify:track:0")).toBeUndefined();
		expect(store.get("spotify:track:500")).toBe(500);
	});

	test("retains runtime changes and reports failed writes", () => {
		const storage = new MemoryStorage();
		const store = new TrackLyricsDelayStore(storage);
		const listener = vi.fn();
		store.persistenceFailed.subscribe(listener);
		vi.spyOn(storage, "set").mockReturnValue(false);

		expect(store.set("spotify:track:first", 250)).toEqual({ delayMs: 250, persisted: false });
		expect(store.get("spotify:track:first")).toBe(250);
		expect(listener).toHaveBeenCalledOnce();
		expect(store.consumePersistenceFailure()).toBe(true);
		expect(store.consumePersistenceFailure()).toBe(false);
	});
});
