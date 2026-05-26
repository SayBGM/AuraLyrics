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
		expect(store.get().backgroundBlurPx).toBeLessThanOrEqual(12);
		expect(store.get().backgroundDim).toBeLessThanOrEqual(0.4);
		expect(store.get().vignetteStrength).toBeLessThanOrEqual(0.3);
		expect(store.get().inactiveBlurPx).toBeGreaterThan(0);
		expect(store.get().lyricsVerticalPosition).toBe(0.5);
		expect(store.get().syncPreference).toBe("prefer-syllable");
		expect(store.get().interludeStyle).toBe("dots");
	});

	test("keeps the immersive preset close to the original album art", () => {
		const store = new SettingsStore(new MemoryStorage());

		const settings = store.applyPreset("immersive");

		expect(settings.backgroundBlurPx).toBeLessThanOrEqual(12);
		expect(settings.backgroundDim).toBeLessThanOrEqual(0.4);
		expect(settings.vignetteStrength).toBeLessThanOrEqual(0.3);
	});

	test("migrates legacy popup lyrics keys once", () => {
		const storage = new MemoryStorage();
		storage.set("popup-lyrics:font-size", "54");
		storage.set("popup-lyrics:delay", "125");
		storage.set("popup-lyrics:show-cover", "false");
		storage.set("popup-lyrics:services-order", JSON.stringify(["lrclib", "spotify"]));

		const store = new SettingsStore(storage);

		expect(store.get().fontScale).toBeCloseTo(54 / 25);
		expect(store.get().lyricsDelayMs).toBe(125);
		expect(store.get().backgroundEnabled).toBe(true);
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

		expect(settings.providers.order).toEqual(["musixmatch", "spotify", "lrclib"]);
		expect(settings.providers.enabled).toEqual({
			...DEFAULT_SETTINGS.providers.enabled,
			musixmatch: false,
		});
		expect(settings.providers.musixmatchToken).toBe("token");
	});

	test("normalizes invalid interlude styles back to the default dots style", () => {
		const storage = new MemoryStorage();
		storage.set(
			"aura-lyrics:settings",
			JSON.stringify({
				interludeStyle: "sparkles",
			})
		);

		const settings = new SettingsStore(storage).get();

		expect(settings.interludeStyle).toBe("dots");
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

	test("drops removed legacy fields while normalizing saved settings", () => {
		const storage = new MemoryStorage();
		storage.set(
			"aura-lyrics:settings",
			JSON.stringify({
				aspectRatio: "16:9",
				fontSizePx: 30,
			})
		);

		const settings = new SettingsStore(storage).get() as typeof DEFAULT_SETTINGS & {
			aspectRatio?: unknown;
			fontSizePx?: unknown;
		};

		expect(settings.fontScale).toBeCloseTo(30 / 25);
		expect(settings.aspectRatio).toBeUndefined();
		expect(settings.fontSizePx).toBeUndefined();
	});
});
