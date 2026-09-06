import { describe, expect, test, vi } from "vitest";
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

		expect(storage.set("key", "value")).toBe(true);

		expect(storage.get("key")).toBe("value");
		expect(storage.delete("key")).toBe(true);
		expect(storage.get("key")).toBe("");
	});

	test("deletes via LocalStorage.remove when available instead of writing an empty string", () => {
		const values = new Map<string, string>();
		const remove = vi.fn((key: string) => {
			values.delete(key);
		});
		const set = vi.fn((key: string, value: string) => {
			values.set(key, value);
		});
		const storage = new SpicetifyStorageAdapter({
			LocalStorage: {
				get: (key: string) => values.get(key) ?? null,
				set,
				remove,
			},
		} as unknown as SpicetifyGlobal);

		storage.set("key", "value");
		expect(storage.delete("key")).toBe(true);

		expect(remove).toHaveBeenCalledWith("key");
		expect(set).not.toHaveBeenCalledWith("key", "");
		expect(storage.get("key")).toBeNull();
	});

	test("reports a failing LocalStorage.remove as a failed delete without falling back to set", () => {
		const values = new Map<string, string>([["key", "value"]]);
		const storage = new SpicetifyStorageAdapter({
			LocalStorage: {
				get: (key: string) => values.get(key) ?? null,
				set: (key: string, value: string) => {
					values.set(key, value);
				},
				remove: () => {
					throw new Error("remove unavailable");
				},
			},
		} as unknown as SpicetifyGlobal);

		expect(storage.delete("key")).toBe(false);
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
		expect(storage.set("key", "value")).toBe(false);
		expect(storage.delete("key")).toBe(false);
	});

	test("reports unavailable LocalStorage writes as failures", () => {
		const storage = new SpicetifyStorageAdapter({} as SpicetifyGlobal);

		expect(storage.get("key")).toBeNull();
		expect(storage.set("key", "value")).toBe(false);
		expect(storage.delete("key")).toBe(false);
	});
});
