import { describe, expect, test, vi } from "vitest";
import { SettingsPersistence } from "../../src/settings/SettingsPersistence";
import { DEFAULT_SETTINGS } from "../../src/settings/settingsSchema";

class MemoryStorage {
	public readonly values = new Map<string, string>();

	public get(key: string) {
		return this.values.get(key) ?? null;
	}

	public set(key: string, value: string) {
		this.values.set(key, value);
		return true;
	}
}

describe("SettingsPersistence", () => {
	test("returns defaults and records the one-time migration for missing payloads", () => {
		const storage = new MemoryStorage();

		const settings = new SettingsPersistence(storage).load();

		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(JSON.parse(storage.get("aura-lyrics:settings") ?? "null")).toEqual(DEFAULT_SETTINGS);
		expect(storage.get("aura-lyrics:migrated-v1")).toBe("true");
	});

	test("returns defaults when the current payload is corrupt", () => {
		const storage = new MemoryStorage();
		storage.set("aura-lyrics:settings", "{not-json");

		const persistence = new SettingsPersistence(storage);

		expect(persistence.load()).toEqual(DEFAULT_SETTINGS);
		expect(persistence.consumeFailure()).toBe(false);
	});

	test("normalizes a partial current payload before returning it", () => {
		const storage = new MemoryStorage();
		storage.set(
			"aura-lyrics:settings",
			JSON.stringify({
				fontScale: 99,
				providers: {
					order: ["lrclib", "unknown", "lrclib"],
					enabled: { spotify: false },
				},
			})
		);

		const settings = new SettingsPersistence(storage).load();

		expect(settings.fontScale).toBe(2.4);
		expect(settings.providers.order).toEqual(["lrclib", "spotify", "musixmatch"]);
		expect(settings.providers.enabled).toEqual({
			...DEFAULT_SETTINGS.providers.enabled,
			spotify: false,
		});
	});

	test("migrates the previous settings document and writes the marker after verified read-back", () => {
		const storage = new MemoryStorage();
		storage.set("dynamic-popup-lyrics:settings", JSON.stringify({ fontSizePx: 50, visibleContextLines: 99 }));
		const writes: string[] = [];
		vi.spyOn(storage, "set").mockImplementation((key, value) => {
			writes.push(key);
			return MemoryStorage.prototype.set.call(storage, key, value);
		});

		const settings = new SettingsPersistence(storage).load();

		expect(settings.fontScale).toBe(2);
		expect(settings.visibleContextLines).toBe(2);
		expect(writes).toEqual(["aura-lyrics:settings", "aura-lyrics:migrated-v1"]);
		expect(storage.get("aura-lyrics:migrated-v1")).toBe("true");
	});

	test("falls back to defaults and records a storage read failure", () => {
		const persistence = new SettingsPersistence({
			get: () => {
				throw new Error("storage unavailable");
			},
			set: () => true,
		});

		expect(persistence.load()).toEqual(DEFAULT_SETTINGS);
		expect(persistence.consumeFailure()).toBe(true);
		expect(persistence.consumeFailure()).toBe(false);
	});

	test("reports write failures without throwing", () => {
		const persistence = new SettingsPersistence({
			get: () => null,
			set: () => {
				throw new Error("storage unavailable");
			},
		});
		const listener = vi.fn();
		persistence.failed.subscribe(listener);

		expect(persistence.save(DEFAULT_SETTINGS)).toBe(false);
		expect(listener).toHaveBeenCalledOnce();
		expect(persistence.consumeFailure()).toBe(true);
	});
});
