import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, normalizeLoadedSettings } from "../../src/settings/settingsSchema";

describe("settingsSchema", () => {
	test("defines dots as the default interlude style", () => {
		expect(DEFAULT_SETTINGS.interludeStyle).toBe("dots");
	});

	test("defaults settings menu language to English", () => {
		expect(DEFAULT_SETTINGS.language).toBe("en");
	});

	test("does not expose a configurable lyrics vertical position", () => {
		const settings = normalizeLoadedSettings({
			lyricsVerticalPosition: 0.25,
		} as Parameters<typeof normalizeLoadedSettings>[0]);

		expect("lyricsVerticalPosition" in DEFAULT_SETTINGS).toBe(false);
		expect("lyricsVerticalPosition" in settings).toBe(false);
	});

	test("normalizes invalid interlude style and removed providers without storage concerns", () => {
		const settings = normalizeLoadedSettings({
			interludeStyle: "sparkles" as never,
			providers: {
				order: ["netease", "musixmatch", "spotify", "musixmatch"] as never,
				enabled: {
					musixmatch: false,
				},
			},
		});

		expect(settings.interludeStyle).toBe("dots");
		expect(settings.providers.order).toEqual(["musixmatch", "spotify", "lrclib"]);
		expect(settings.providers.enabled).toEqual({
			spotify: true,
			lrclib: true,
			musixmatch: false,
		});
	});

	test("normalizes removed album background and invalid language values", () => {
		const settings = normalizeLoadedSettings({
			backgroundEnabled: false,
			language: "fr" as never,
		});

		expect(settings.backgroundEnabled).toBe(true);
		expect(settings.language).toBe("en");
	});

	test("shows lyric translations by default and normalizes invalid values", () => {
		expect(DEFAULT_SETTINGS.showTranslation).toBe(true);

		const settings = normalizeLoadedSettings({ showTranslation: "yes" as never });

		expect(settings.showTranslation).toBe(true);
		expect(normalizeLoadedSettings({ showTranslation: false }).showTranslation).toBe(false);
	});

	test("defaults the musixmatch proxy mode to default", () => {
		expect(DEFAULT_SETTINGS.providers.musixmatchProxyMode).toBe("default");
	});

	test("normalizes an invalid musixmatch proxy mode back to default", () => {
		const settings = normalizeLoadedSettings({
			providers: {
				musixmatchProxyMode: "self-hosted" as never,
			},
		});

		expect(settings.providers.musixmatchProxyMode).toBe("default");
	});

	test("passes through a custom musixmatch proxy mode and base URL", () => {
		const settings = normalizeLoadedSettings({
			providers: {
				musixmatchProxyMode: "custom",
				musixmatchProxyBaseUrl: "https://my-proxy.example.com",
			},
		});

		expect(settings.providers.musixmatchProxyMode).toBe("custom");
		expect(settings.providers.musixmatchProxyBaseUrl).toBe("https://my-proxy.example.com");
	});
});
