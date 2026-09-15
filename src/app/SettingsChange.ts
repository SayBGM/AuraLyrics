import type { ExtensionSettings } from "../settings/settingsSchema";

export type RendererSettingsChange = "none" | "live" | "structural";

/**
 * Exhaustive classification of every `ExtensionSettings` key. `satisfies Record<keyof
 * ExtensionSettings, RendererSettingsChange>` makes it a type error to add a setting without
 * classifying it here.
 *
 * - "structural": changes what is rendered (rebuilds the presented lyrics), so it always applies
 *   immediately.
 * - "live": only affects CSS/visual output the renderer already reflects without a rebuild
 *   (`LyricsRenderer.applyRootSettings` / `DocumentPipController.applySettings`), so a burst of
 *   rapid input can be coalesced onto one animation frame.
 * - "none": renderer-irrelevant (provider loading, delay application, derived/meta fields) —
 *   still applied to the session, just never treated as a reason to rebuild or prioritize.
 */
const SETTINGS_CHANGE_CLASSIFICATION = {
	language: "structural",
	syncPreference: "structural",
	pseudoKaraoke: "structural",
	showTranslation: "structural",
	showPerformers: "structural",
	showInterludes: "structural",
	interludeStyle: "structural",
	debugMode: "structural",

	fontScale: "live",
	fontFamily: "live",
	backgroundEnabled: "live",
	backgroundBlurPx: "live",
	backgroundDim: "live",
	backgroundSaturation: "live",
	vignetteStrength: "live",
	inactiveBlurPx: "live",
	alignmentMode: "live",
	visibleContextLines: "live",
	compactMode: "live",
	highlightEffect: "live",
	highlightMotion: "live",
	motionEnabled: "live",
	motionIntensity: "live",
	springSoftness: "live",
	glowStrength: "live",
	reduceMotion: "live",

	preset: "none",
	providers: "none",
	lyricsDelayMs: "none",
	prefetchNextTrack: "none",
} as const satisfies Record<keyof ExtensionSettings, RendererSettingsChange>;

export const SETTINGS_CHANGE_KEYS = Object.keys(SETTINGS_CHANGE_CLASSIFICATION) as (keyof ExtensionSettings)[];

export const settingsChangeClassification = (key: keyof ExtensionSettings): RendererSettingsChange => SETTINGS_CHANGE_CLASSIFICATION[key];

export const rendererSettingsChange = (previous: ExtensionSettings, next: ExtensionSettings): RendererSettingsChange => {
	let result: RendererSettingsChange = "none";
	for (const key of SETTINGS_CHANGE_KEYS) {
		if (previous[key] === next[key]) {
			continue;
		}
		const classification = SETTINGS_CHANGE_CLASSIFICATION[key];
		if (classification === "structural") {
			return "structural";
		}
		if (classification === "live") {
			result = "live";
		}
	}
	return result;
};
