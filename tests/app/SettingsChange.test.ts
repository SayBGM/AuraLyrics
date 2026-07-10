import { describe, expect, test } from "vitest";
import { rendererSettingsChange } from "../../src/app/SettingsChange";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../src/settings/settingsSchema";

const settings = (patch: Partial<ExtensionSettings> = {}): ExtensionSettings => ({
	...DEFAULT_SETTINGS,
	...patch,
	providers: patch.providers ?? DEFAULT_SETTINGS.providers,
});

describe("rendererSettingsChange", () => {
	test.each([
		["language", "ko"],
		["syncPreference", "line-only"],
		["pseudoKaraoke", false],
		["showTranslation", false],
		["showInterludes", false],
		["interludeStyle", "frame"],
		["debugMode", true],
	] as const)("classifies %s as structural", (key, value) => {
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ [key]: value }))).toBe("structural");
	});

	test.each([
		["fontScale", 1.2],
		["fontFamily", "Inter"],
		["backgroundBlurPx", 24],
		["backgroundDim", 0.7],
		["backgroundSaturation", 0.8],
		["vignetteStrength", 0.6],
		["inactiveBlurPx", 1.2],
		["alignmentMode", "left"],
		["visibleContextLines", 2],
		["motionEnabled", false],
		["motionIntensity", 0.4],
		["springSoftness", 0.9],
		["glowStrength", 0.3],
		["reduceMotion", true],
	] as const)("classifies %s as live", (key, value) => {
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ [key]: value }))).toBe("live");
	});

	test("classifies provider, delay, preset, and background-only changes as renderer-irrelevant", () => {
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ lyricsDelayMs: 250 }))).toBe("none");
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ preset: "clean" }))).toBe("none");
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ backgroundEnabled: false }))).toBe("none");
		expect(
			rendererSettingsChange(
				DEFAULT_SETTINGS,
				settings({
					providers: { ...DEFAULT_SETTINGS.providers, order: ["lrclib", "spotify", "musixmatch"] },
				})
			)
		).toBe("none");
	});
});
