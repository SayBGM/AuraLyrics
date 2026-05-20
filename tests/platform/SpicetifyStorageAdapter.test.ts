import { describe, expect, test } from "vitest";
import { SpicetifyStorageAdapter } from "../../src/platform/SpicetifyStorageAdapter";
import type { SpicetifyGlobal } from "../../src/runtime/spicetify";

describe("SpicetifyStorageAdapter", () => {
	test("reads and writes through Spicetify LocalStorage", () => {
		const values = new Map<string, string>();
		const storage = new SpicetifyStorageAdapter({
			LocalStorage: {
				get: (key: string) => values.get(key) ?? null,
				set: (key: string, value: string) => {
					values.set(key, value);
				},
			},
		} as unknown as SpicetifyGlobal);

		storage.set("key", "value");

		expect(storage.get("key")).toBe("value");
	});

	test("treats unavailable or failing LocalStorage as empty best-effort storage", () => {
		const storage = new SpicetifyStorageAdapter({
			LocalStorage: {
				get: () => {
					throw new Error("unavailable");
				},
				set: () => {
					throw new Error("quota exceeded");
				},
			},
		} as unknown as SpicetifyGlobal);

		expect(storage.get("key")).toBeNull();
		expect(() => storage.set("key", "value")).not.toThrow();
		expect(() => storage.delete("key")).not.toThrow();
	});
});
