import { describe, expect, test } from "vitest";
import type { ExtensionSettings } from "../../src/settings/SettingsStore";
import { DEFAULT_SETTINGS } from "../../src/settings/settingsSchema";
import { applySharedRootSettings, cssPropertiesForSettings } from "../../src/shared/settingsCssProperties";

const settingsWith = (overrides: Partial<ExtensionSettings>): ExtensionSettings => ({ ...DEFAULT_SETTINGS, ...overrides });

describe("cssPropertiesForSettings", () => {
	test("maps every shared setting to its CSS custom property, with px units where the styles expect them", () => {
		expect(
			cssPropertiesForSettings(
				settingsWith({
					fontScale: 1.25,
					backgroundBlurPx: 32,
					backgroundDim: 0.4,
					backgroundSaturation: 1.1,
					vignetteStrength: 0.65,
					inactiveBlurPx: 3,
					motionIntensity: 0.8,
				})
			)
		).toEqual({
			"--font-scale": "1.25",
			"--background-blur": "32px",
			"--background-dim": "0.4",
			"--background-saturation": "1.1",
			"--vignette-strength": "0.65",
			"--inactive-blur": "3px",
			"--motion-intensity": "0.8",
		});
	});

	test("keeps zero values instead of dropping them", () => {
		const properties = cssPropertiesForSettings(settingsWith({ backgroundBlurPx: 0, backgroundDim: 0, motionIntensity: 0 }));

		expect(properties["--background-blur"]).toBe("0px");
		expect(properties["--background-dim"]).toBe("0");
		expect(properties["--motion-intensity"]).toBe("0");
	});

	test("does not include the properties each call site owns on its own", () => {
		const properties = cssPropertiesForSettings(DEFAULT_SETTINGS);

		expect(properties["--spring-softness"]).toBeUndefined();
		expect(Object.keys(properties)).toHaveLength(7);
	});
});

describe("applySharedRootSettings", () => {
	test("writes the properties and derives the two motion classes", () => {
		const root = document.createElement("div");

		applySharedRootSettings(root, settingsWith({ fontScale: 1.5, inactiveBlurPx: 4, motionEnabled: true, reduceMotion: false }));

		expect(root.style.getPropertyValue("--font-scale")).toBe("1.5");
		expect(root.style.getPropertyValue("--inactive-blur")).toBe("4px");
		expect(root.classList.contains("reduce-motion")).toBe(false);
		expect(root.classList.contains("motion-disabled")).toBe(false);
	});

	test("reduced motion sets reduce-motion only, disabled motion sets both", () => {
		const reduced = document.createElement("div");
		applySharedRootSettings(reduced, settingsWith({ motionEnabled: true, reduceMotion: true }));
		expect(reduced.classList.contains("reduce-motion")).toBe(true);
		expect(reduced.classList.contains("motion-disabled")).toBe(false);

		const disabled = document.createElement("div");
		applySharedRootSettings(disabled, settingsWith({ motionEnabled: false, reduceMotion: false }));
		expect(disabled.classList.contains("reduce-motion")).toBe(true);
		expect(disabled.classList.contains("motion-disabled")).toBe(true);
	});

	test("re-applying with motion back on clears both classes", () => {
		const root = document.createElement("div");

		applySharedRootSettings(root, settingsWith({ motionEnabled: false }));
		applySharedRootSettings(root, settingsWith({ motionEnabled: true, reduceMotion: false }));

		expect(root.classList.contains("reduce-motion")).toBe(false);
		expect(root.classList.contains("motion-disabled")).toBe(false);
	});
});
