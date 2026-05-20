import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore } from "../../src/settings/SettingsStore";

class MemoryStorage {
	private readonly values = new Map<string, string>();

	public get(key: string) {
		return this.values.get(key) ?? null;
	}

	public set(key: string, value: string) {
		this.values.set(key, value);
	}
}

describe("SettingsStore", () => {
	test("uses the immersive preset by default", () => {
		const store = new SettingsStore(new MemoryStorage());

		expect(store.get().preset).toBe("immersive");
		expect(store.get().fontScale).toBe(1);
		expect(store.get().backgroundEnabled).toBe(true);
		expect(store.get().inactiveBlurPx).toBeGreaterThan(0);
		expect(store.get().lyricsVerticalPosition).toBe(0.5);
		expect(store.get().syncPreference).toBe("prefer-syllable");
	});

	test("migrates legacy popup lyrics keys once", () => {
		const storage = new MemoryStorage();
		storage.set("popup-lyrics:font-size", "54");
		storage.set("popup-lyrics:delay", "125");
		storage.set("popup-lyrics:ratio", "169");
		storage.set("popup-lyrics:show-cover", "false");
		storage.set("popup-lyrics:services-order", JSON.stringify(["lrclib", "spotify"]));

		const store = new SettingsStore(storage);

		expect(store.get().fontScale).toBeCloseTo(54 / 25);
		expect(store.get().lyricsDelayMs).toBe(125);
		expect(store.get().aspectRatio).toBe("16:9");
		expect(store.get().backgroundEnabled).toBe(false);
		expect(store.get().providers.order.slice(0, 2)).toEqual(["lrclib", "spotify"]);
	});

	test("normalizes partial saved settings with nested provider defaults", () => {
		const storage = new MemoryStorage();
		storage.set(
			"aura-lyrics:settings",
			JSON.stringify({
				providers: {
					order: ["unknown", "musixmatch", "spotify", "spotify"],
					enabled: {
						musixmatch: false,
					},
					musixmatchToken: "token",
				},
			})
		);

		const settings = new SettingsStore(storage).get();

		expect(settings.providers.order).toEqual(["musixmatch", "spotify", "lrclib", "netease"]);
		expect(settings.providers.enabled).toEqual({
			...DEFAULT_SETTINGS.providers.enabled,
			musixmatch: false,
		});
		expect(settings.providers.musixmatchToken).toBe("token");
	});

	test("migrates saved settings from the previous dynamic popup key", () => {
		const storage = new MemoryStorage();
		storage.set(
			"dynamic-popup-lyrics:settings",
			JSON.stringify({
				fontSizePx: 50,
				backgroundDim: 5,
				fontScale: undefined,
				visibleContextLines: 9,
			})
		);

		const settings = new SettingsStore(storage).get();

		expect(settings.fontScale).toBeCloseTo(2);
		expect(settings.backgroundDim).toBe(1);
		expect(settings.visibleContextLines).toBe(2);
	});
});
