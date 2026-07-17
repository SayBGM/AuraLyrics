import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, normalizeLoadedSettings } from "../../src/settings/settingsSchema";

describe("settingsSchema", () => {
	test("defines dots as the default interlude style", () => {
		expect(DEFAULT_SETTINGS.interludeStyle).toBe("dots");
	});

	test("defaults settings menu language to English", () => {
		expect(DEFAULT_SETTINGS.language).toBe("en");
	});

	test("defaults highlighting to the existing fill and spring treatment", () => {
		expect(DEFAULT_SETTINGS.highlightEffect).toBe("fill");
		expect(DEFAULT_SETTINGS.highlightMotion).toBe("spring");
		expect(normalizeLoadedSettings({ highlightEffect: "neon" as never }).highlightEffect).toBe("fill");
		expect(normalizeLoadedSettings({ highlightMotion: "shake" as never }).highlightMotion).toBe("spring");
		expect(normalizeLoadedSettings({ highlightEffect: "marker", highlightMotion: "wave" })).toMatchObject({
			highlightEffect: "marker",
			highlightMotion: "wave",
		});
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

	test.each([
		["language", { language: "fr" }, (settings: typeof DEFAULT_SETTINGS) => settings.language, DEFAULT_SETTINGS.language],
		["preset", { preset: "neon" }, (settings: typeof DEFAULT_SETTINGS) => settings.preset, DEFAULT_SETTINGS.preset],
		[
			"sync preference",
			{ syncPreference: "word-only" },
			(settings: typeof DEFAULT_SETTINGS) => settings.syncPreference,
			DEFAULT_SETTINGS.syncPreference,
		],
		["alignment", { alignmentMode: "right" }, (settings: typeof DEFAULT_SETTINGS) => settings.alignmentMode, DEFAULT_SETTINGS.alignmentMode],
		["interlude style", { interludeStyle: "bars" }, (settings: typeof DEFAULT_SETTINGS) => settings.interludeStyle, DEFAULT_SETTINGS.interludeStyle],
		[
			"highlight effect",
			{ highlightEffect: "neon" },
			(settings: typeof DEFAULT_SETTINGS) => settings.highlightEffect,
			DEFAULT_SETTINGS.highlightEffect,
		],
		[
			"highlight motion",
			{ highlightMotion: "shake" },
			(settings: typeof DEFAULT_SETTINGS) => settings.highlightMotion,
			DEFAULT_SETTINGS.highlightMotion,
		],
		[
			"proxy mode",
			{ providers: { musixmatchProxyMode: "direct" } },
			(settings: typeof DEFAULT_SETTINGS) => settings.providers.musixmatchProxyMode,
			DEFAULT_SETTINGS.providers.musixmatchProxyMode,
		],
	])("normalizes invalid %s enums", (_name, raw, select, expected) => {
		const settings = normalizeLoadedSettings(raw as never);

		expect(select(settings)).toBe(expected);
	});

	test.each([
		["pseudoKaraoke", "false"],
		["showTranslation", 0],
		["showInterludes", "yes"],
		["motionEnabled", 1],
		["reduceMotion", null],
		["debugMode", []],
	])("accepts only real booleans for %s", (key, invalid) => {
		const settings = normalizeLoadedSettings({ [key]: invalid } as never);

		expect(settings[key as keyof typeof DEFAULT_SETTINGS]).toBe(DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS]);
	});

	test("keeps the forced background policy even for a real false value", () => {
		expect(normalizeLoadedSettings({ backgroundEnabled: false }).backgroundEnabled).toBe(true);
	});

	test("normalizes non-finite, string, clamped, and integral numeric settings", () => {
		const settings = normalizeLoadedSettings({
			lyricsDelayMs: 1.6,
			fontScale: Number.NaN,
			backgroundBlurPx: Number.POSITIVE_INFINITY,
			backgroundDim: "0.5" as never,
			backgroundSaturation: 99,
			vignetteStrength: -1,
			inactiveBlurPx: 99,
			visibleContextLines: 1.6,
			motionIntensity: Number.NEGATIVE_INFINITY,
			springSoftness: 99,
			glowStrength: -1,
		});

		expect(settings).toMatchObject({
			lyricsDelayMs: 2,
			fontScale: DEFAULT_SETTINGS.fontScale,
			backgroundBlurPx: DEFAULT_SETTINGS.backgroundBlurPx,
			backgroundDim: DEFAULT_SETTINGS.backgroundDim,
			backgroundSaturation: 2,
			vignetteStrength: 0,
			inactiveBlurPx: 4,
			visibleContextLines: 2,
			motionIntensity: DEFAULT_SETTINGS.motionIntensity,
			springSoftness: 1,
			glowStrength: 0,
		});
	});

	test("trims bounded strings and rejects empty or excessive settings strings", () => {
		const trimmed = normalizeLoadedSettings({
			fontFamily: "  Inter Variable  ",
			providers: {
				musixmatchToken: "  token-value  ",
				musixmatchProxyBaseUrl: "  https://proxy.example.com  ",
			},
		});
		const invalid = normalizeLoadedSettings({
			fontFamily: " ",
			providers: {
				musixmatchToken: "x".repeat(5000),
				musixmatchProxyBaseUrl: "x".repeat(3000),
			},
		});

		expect(trimmed.fontFamily).toBe("Inter Variable");
		expect(trimmed.providers.musixmatchToken).toBe("token-value");
		expect(trimmed.providers.musixmatchProxyBaseUrl).toBe("https://proxy.example.com");
		expect(invalid.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
		expect(invalid.providers.musixmatchToken).toBeUndefined();
		expect(invalid.providers.musixmatchProxyBaseUrl).toBeUndefined();
	});

	test("accepts only boolean provider flags and appends missing known providers once", () => {
		const settings = normalizeLoadedSettings({
			providers: {
				order: ["lrclib", "unknown", "lrclib"] as never,
				enabled: {
					spotify: "false" as never,
					lrclib: false,
					musixmatch: 0 as never,
				},
			},
		});

		expect(settings.providers.order).toEqual(["lrclib", "spotify", "musixmatch"]);
		expect(settings.providers.enabled).toEqual({
			spotify: DEFAULT_SETTINGS.providers.enabled.spotify,
			lrclib: false,
			musixmatch: DEFAULT_SETTINGS.providers.enabled.musixmatch,
		});
	});

	test("drops unknown top-level and provider fields", () => {
		const settings = normalizeLoadedSettings({
			futureFeature: true,
			providers: { futureProviderOption: "value" },
		} as never) as typeof DEFAULT_SETTINGS & {
			futureFeature?: unknown;
			providers: typeof DEFAULT_SETTINGS.providers & { futureProviderOption?: unknown };
		};

		expect(settings.futureFeature).toBeUndefined();
		expect(settings.providers.futureProviderOption).toBeUndefined();
	});
});
