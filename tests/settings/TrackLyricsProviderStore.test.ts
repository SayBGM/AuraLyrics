import { describe, expect, test, vi } from "vitest";
import { TrackLyricsProviderStore } from "../../src/settings/TrackLyricsProviderStore";

const storage = () => {
	const values = new Map<string, string>();
	return {
		values,
		get: (key: string) => values.get(key),
		set: (key: string, value: string) => {
			values.set(key, value);
			return true;
		},
	};
};

describe("TrackLyricsProviderStore", () => {
	test("persists, restores, and deletes a song provider", () => {
		const first = storage();
		const store = new TrackLyricsProviderStore(first, () => 1);
		expect(store.set("spotify:track:1", "lrclib")).toBe(true);
		const restored = new TrackLyricsProviderStore(first, () => 2);
		expect(restored.get("spotify:track:1")).toBe("lrclib");
		expect(restored.delete("spotify:track:1")).toBe(true);
		expect(restored.get("spotify:track:1")).toBeUndefined();
	});

	test("rejects invalid persisted providers", () => {
		const store = storage();
		store.values.set("aura-lyrics:track-providers-v1", JSON.stringify([{ uri: "x", provider: "bad", updatedAt: 1 }]));
		expect(new TrackLyricsProviderStore(store).get("x")).toBeUndefined();
	});

	test("reports persistence failures", () => {
		const failed = { get: () => undefined, set: vi.fn(() => false) };
		const store = new TrackLyricsProviderStore(failed);
		expect(store.set("spotify:track:1", "spotify")).toBe(false);
		expect(store.consumePersistenceFailure()).toBe(true);
	});
});
