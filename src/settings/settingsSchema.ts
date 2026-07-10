import type { ProviderId } from "../domain/types";

export type LyricsVisualPreset = "immersive" | "clean" | "karaoke" | "custom";
export type SyncPreference = "prefer-syllable" | "line-only";
export type AlignmentMode = "natural" | "center" | "left";
export type InterludeStyle = "frame" | "dots" | "wave";
export type UiLanguage = "en" | "ko" | "ja";
export type MusixmatchProxyMode = "default" | "custom";

export type ExtensionSettings = {
	language: UiLanguage;
	preset: LyricsVisualPreset;
	lyricsDelayMs: number;
	fontScale: number;
	fontFamily: string;
	backgroundEnabled: boolean;
	backgroundBlurPx: number;
	backgroundDim: number;
	backgroundSaturation: number;
	vignetteStrength: number;
	inactiveBlurPx: number;
	syncPreference: SyncPreference;
	pseudoKaraoke: boolean;
	showTranslation: boolean;
	alignmentMode: AlignmentMode;
	visibleContextLines: number;
	showInterludes: boolean;
	interludeStyle: InterludeStyle;
	motionEnabled: boolean;
	motionIntensity: number;
	springSoftness: number;
	glowStrength: number;
	reduceMotion: boolean;
	providers: {
		order: ProviderId[];
		enabled: Record<ProviderId, boolean>;
		musixmatchToken?: string;
		musixmatchProxyMode: MusixmatchProxyMode;
		musixmatchProxyBaseUrl?: string;
	};
	debugMode: boolean;
};

export type PersistedSettings = Omit<Partial<ExtensionSettings>, "providers"> & {
	aspectRatio?: unknown;
	fontSizePx?: number;
	providers?: Partial<Omit<ExtensionSettings["providers"], "enabled">> & {
		enabled?: Partial<Record<ProviderId, boolean>>;
	};
};

export const KNOWN_PROVIDER_IDS: ProviderId[] = ["spotify", "lrclib", "musixmatch"];

export const DEFAULT_SETTINGS: ExtensionSettings = {
	language: "en",
	preset: "immersive",
	lyricsDelayMs: 0,
	fontScale: 1,
	fontFamily: "spotify-circular",
	backgroundEnabled: true,
	backgroundBlurPx: 10,
	backgroundDim: 0.36,
	backgroundSaturation: 1.05,
	vignetteStrength: 0.25,
	inactiveBlurPx: 0.85,
	syncPreference: "prefer-syllable",
	pseudoKaraoke: true,
	showTranslation: true,
	alignmentMode: "center",
	visibleContextLines: 1,
	showInterludes: true,
	interludeStyle: "dots",
	motionEnabled: true,
	motionIntensity: 1,
	springSoftness: 0.65,
	glowStrength: 0.8,
	reduceMotion: false,
	providers: {
		order: ["spotify", "lrclib", "musixmatch"],
		enabled: {
			spotify: true,
			lrclib: true,
			musixmatch: true,
		},
		musixmatchProxyMode: "default",
	},
	debugMode: false,
};

export const PRESETS: Record<Exclude<LyricsVisualPreset, "custom">, Partial<ExtensionSettings>> = {
	immersive: {
		backgroundEnabled: true,
		backgroundBlurPx: 10,
		backgroundDim: 0.36,
		backgroundSaturation: 1.05,
		vignetteStrength: 0.25,
		inactiveBlurPx: 0.85,
		motionIntensity: 1,
		glowStrength: 0.8,
	},
	clean: {
		backgroundEnabled: true,
		backgroundBlurPx: 18,
		backgroundDim: 0.78,
		backgroundSaturation: 0.8,
		vignetteStrength: 0.35,
		inactiveBlurPx: 0.35,
		motionIntensity: 0.55,
		glowStrength: 0.25,
	},
	karaoke: {
		backgroundEnabled: true,
		backgroundBlurPx: 28,
		backgroundDim: 0.68,
		backgroundSaturation: 1.05,
		vignetteStrength: 0.5,
		inactiveBlurPx: 0.65,
		motionIntensity: 1.15,
		glowStrength: 1,
	},
};

const isProviderId = (value: unknown): value is ProviderId => typeof value === "string" && KNOWN_PROVIDER_IDS.includes(value as ProviderId);

const isInterludeStyle = (value: unknown): value is InterludeStyle => value === "frame" || value === "dots" || value === "wave";
const isUiLanguage = (value: unknown): value is UiLanguage => value === "en" || value === "ko" || value === "ja";
const isMusixmatchProxyMode = (value: unknown): value is MusixmatchProxyMode => value === "default" || value === "custom";
const isLyricsVisualPreset = (value: unknown): value is LyricsVisualPreset =>
	value === "immersive" || value === "clean" || value === "karaoke" || value === "custom";
const isSyncPreference = (value: unknown): value is SyncPreference => value === "prefer-syllable" || value === "line-only";
const isAlignmentMode = (value: unknown): value is AlignmentMode => value === "natural" || value === "center" || value === "left";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
	const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return Math.min(max, Math.max(min, next));
};

const roundClampedNumber = (value: unknown, fallback: number, min: number, max: number): number => Math.round(clampNumber(value, fallback, min, max));

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

const normalizeString = (value: unknown, maxLength: number): string | undefined => {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
};

export const normalizeProviderOrder = (value: unknown): ProviderId[] => {
	const ordered: ProviderId[] = [];
	if (Array.isArray(value)) {
		for (const item of value) {
			if (isProviderId(item) && !ordered.includes(item)) {
				ordered.push(item);
			}
		}
	}
	for (const provider of DEFAULT_SETTINGS.providers.order) {
		if (!ordered.includes(provider)) {
			ordered.push(provider);
		}
	}
	return ordered;
};

export const normalizeLoadedSettings = (raw: PersistedSettings): ExtensionSettings => {
	const defaults = structuredClone(DEFAULT_SETTINGS);
	const settings = (isRecord(raw) ? raw : {}) as PersistedSettings;
	const providers = (isRecord(settings.providers) ? settings.providers : {}) as NonNullable<PersistedSettings["providers"]>;
	const enabled = (isRecord(providers.enabled) ? providers.enabled : {}) as Partial<Record<ProviderId, unknown>>;
	const fontScale =
		typeof settings.fontScale === "number" && Number.isFinite(settings.fontScale)
			? settings.fontScale
			: typeof settings.fontSizePx === "number" && Number.isFinite(settings.fontSizePx)
				? settings.fontSizePx / 25
				: defaults.fontScale;
	return {
		language: isUiLanguage(settings.language) ? settings.language : defaults.language,
		preset: isLyricsVisualPreset(settings.preset) ? settings.preset : defaults.preset,
		lyricsDelayMs: roundClampedNumber(settings.lyricsDelayMs, defaults.lyricsDelayMs, -5000, 5000),
		fontScale: clampNumber(fontScale, defaults.fontScale, 0.6, 2.4),
		fontFamily: normalizeString(settings.fontFamily, 256) ?? defaults.fontFamily,
		backgroundEnabled: true,
		backgroundBlurPx: clampNumber(settings.backgroundBlurPx, defaults.backgroundBlurPx, 0, 80),
		backgroundDim: clampNumber(settings.backgroundDim, defaults.backgroundDim, 0, 1),
		backgroundSaturation: clampNumber(settings.backgroundSaturation, defaults.backgroundSaturation, 0, 2),
		vignetteStrength: clampNumber(settings.vignetteStrength, defaults.vignetteStrength, 0, 1),
		inactiveBlurPx: clampNumber(settings.inactiveBlurPx, defaults.inactiveBlurPx, 0, 4),
		syncPreference: isSyncPreference(settings.syncPreference) ? settings.syncPreference : defaults.syncPreference,
		pseudoKaraoke: normalizeBoolean(settings.pseudoKaraoke, defaults.pseudoKaraoke),
		showTranslation: normalizeBoolean(settings.showTranslation, defaults.showTranslation),
		alignmentMode: isAlignmentMode(settings.alignmentMode) ? settings.alignmentMode : defaults.alignmentMode,
		visibleContextLines: roundClampedNumber(settings.visibleContextLines, defaults.visibleContextLines, 0, 2),
		showInterludes: normalizeBoolean(settings.showInterludes, defaults.showInterludes),
		interludeStyle: isInterludeStyle(settings.interludeStyle) ? settings.interludeStyle : defaults.interludeStyle,
		motionEnabled: normalizeBoolean(settings.motionEnabled, defaults.motionEnabled),
		motionIntensity: clampNumber(settings.motionIntensity, defaults.motionIntensity, 0, 2),
		springSoftness: clampNumber(settings.springSoftness, defaults.springSoftness, 0, 1),
		glowStrength: clampNumber(settings.glowStrength, defaults.glowStrength, 0, 1.5),
		reduceMotion: normalizeBoolean(settings.reduceMotion, defaults.reduceMotion),
		providers: {
			order: normalizeProviderOrder(providers.order),
			enabled: {
				spotify: normalizeBoolean(enabled.spotify, defaults.providers.enabled.spotify),
				lrclib: normalizeBoolean(enabled.lrclib, defaults.providers.enabled.lrclib),
				musixmatch: normalizeBoolean(enabled.musixmatch, defaults.providers.enabled.musixmatch),
			},
			musixmatchToken: normalizeString(providers.musixmatchToken, 4096),
			musixmatchProxyMode: isMusixmatchProxyMode(providers.musixmatchProxyMode)
				? providers.musixmatchProxyMode
				: defaults.providers.musixmatchProxyMode,
			musixmatchProxyBaseUrl: normalizeString(providers.musixmatchProxyBaseUrl, 2048),
		},
		debugMode: normalizeBoolean(settings.debugMode, defaults.debugMode),
	};
};
