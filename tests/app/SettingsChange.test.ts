import { describe, expect, test } from "vitest";
import { rendererSettingsChange, SETTINGS_CHANGE_KEYS, settingsChangeClassification } from "../../src/app/SettingsChange";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../src/settings/settingsSchema";

const settings = (patch: Partial<ExtensionSettings> = {}): ExtensionSettings => ({
	...DEFAULT_SETTINGS,
	...patch,
	providers: patch.providers ?? DEFAULT_SETTINGS.providers,
});

describe("rendererSettingsChange", () => {
	test("classifies every ExtensionSettings key exactly once", () => {
		expect([...SETTINGS_CHANGE_KEYS].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
	});

	test.each([
		["language", "ko"],
		["syncPreference", "line-only"],
		["pseudoKaraoke", false],
		["showTranslation", false],
		["showInterludes", false],
		["interludeStyle", "frame"],
		["debugMode", true],
	] as const)("classifies %s as structural", (key, value) => {
		expect(settingsChangeClassification(key)).toBe("structural");
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ [key]: value }))).toBe("structural");
	});

	test.each([
		["fontScale", 1.2],
		["fontFamily", "Inter"],
		["backgroundEnabled", false],
		["backgroundBlurPx", 24],
		["backgroundDim", 0.7],
		["backgroundSaturation", 0.8],
		["vignetteStrength", 0.6],
		["inactiveBlurPx", 1.2],
		["alignmentMode", "left"],
		["visibleContextLines", 2],
		["highlightEffect", "marker"],
		["highlightMotion", "wave"],
		["motionEnabled", false],
		["motionIntensity", 0.4],
		["springSoftness", 0.9],
		["glowStrength", 0.3],
		["reduceMotion", true],
	] as const)("classifies %s as live", (key, value) => {
		expect(settingsChangeClassification(key)).toBe("live");
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ [key]: value }))).toBe("live");
	});

	test("classifies provider, delay, and preset changes as renderer-irrelevant", () => {
		expect(settingsChangeClassification("lyricsDelayMs")).toBe("none");
		expect(settingsChangeClassification("preset")).toBe("none");
		expect(settingsChangeClassification("providers")).toBe("none");
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ lyricsDelayMs: 250 }))).toBe("none");
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ preset: "clean" }))).toBe("none");
		expect(
			rendererSettingsChange(
				DEFAULT_SETTINGS,
				settings({
					providers: { ...DEFAULT_SETTINGS.providers, order: ["lrclib", "spotify", "musixmatch"] },
				})
			)
		).toBe("none");
	});

	test("returns the highest-priority classification when multiple keys change at once", () => {
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ lyricsDelayMs: 250, fontScale: 1.2 }))).toBe("live");
		expect(rendererSettingsChange(DEFAULT_SETTINGS, settings({ fontScale: 1.2, language: "ko" }))).toBe("structural");
	});
});
