import type { ExtensionSettings } from "../settings/settingsSchema";

export type RendererSettingsChange = "none" | "live" | "structural";

const STRUCTURAL_SETTINGS = [
	"language",
	"syncPreference",
	"pseudoKaraoke",
	"showTranslation",
	"showInterludes",
	"interludeStyle",
	"debugMode",
] as const satisfies readonly (keyof ExtensionSettings)[];

const LIVE_SETTINGS = [
	"fontScale",
	"fontFamily",
	"backgroundBlurPx",
	"backgroundDim",
	"backgroundSaturation",
	"vignetteStrength",
	"inactiveBlurPx",
	"alignmentMode",
	"visibleContextLines",
	"motionEnabled",
	"motionIntensity",
	"springSoftness",
	"glowStrength",
	"reduceMotion",
] as const satisfies readonly (keyof ExtensionSettings)[];

export const rendererSettingsChange = (previous: ExtensionSettings, next: ExtensionSettings): RendererSettingsChange => {
	if (STRUCTURAL_SETTINGS.some((key) => previous[key] !== next[key])) {
		return "structural";
	}
	if (LIVE_SETTINGS.some((key) => previous[key] !== next[key])) {
		return "live";
	}
	return "none";
};
