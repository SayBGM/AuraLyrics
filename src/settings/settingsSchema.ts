import type { ProviderId } from "../lyrics/types";

export type LyricsVisualPreset = "immersive" | "clean" | "karaoke" | "custom";
export type SyncPreference = "prefer-syllable" | "line-only";
export type AlignmentMode = "natural" | "center" | "left";
export type InterludeStyle = "frame" | "dots" | "wave";
export type UiLanguage = "en" | "ko" | "ja";

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

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
	const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return Math.min(max, Math.max(min, next));
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
	const {
		aspectRatio: _ignoredAspectRatio,
		fontSizePx,
		lyricsVerticalPosition: _ignoredLyricsVerticalPosition,
		...settings
	} = raw as PersistedSettings & {
		lyricsVerticalPosition?: unknown;
	};
	const fontScale = settings.fontScale ?? (typeof fontSizePx === "number" ? fontSizePx / 25 : defaults.fontScale);
	const providers = settings.providers ?? {};
	const enabled: Partial<Record<ProviderId, boolean>> = providers.enabled ?? {};
	return {
		...defaults,
		...settings,
		language: isUiLanguage(settings.language) ? settings.language : defaults.language,
		backgroundEnabled: true,
		fontScale: clampNumber(fontScale, defaults.fontScale, 0.6, 2.4),
		lyricsDelayMs: clampNumber(settings.lyricsDelayMs, defaults.lyricsDelayMs, -5000, 5000),
		backgroundBlurPx: clampNumber(settings.backgroundBlurPx, defaults.backgroundBlurPx, 0, 80),
		backgroundDim: clampNumber(settings.backgroundDim, defaults.backgroundDim, 0, 1),
		backgroundSaturation: clampNumber(settings.backgroundSaturation, defaults.backgroundSaturation, 0, 2),
		vignetteStrength: clampNumber(settings.vignetteStrength, defaults.vignetteStrength, 0, 1),
		inactiveBlurPx: clampNumber(settings.inactiveBlurPx, defaults.inactiveBlurPx, 0, 4),
		visibleContextLines: Math.round(clampNumber(settings.visibleContextLines, defaults.visibleContextLines, 0, 2)),
		interludeStyle: isInterludeStyle(settings.interludeStyle) ? settings.interludeStyle : defaults.interludeStyle,
		motionIntensity: clampNumber(settings.motionIntensity, defaults.motionIntensity, 0, 2),
		springSoftness: clampNumber(settings.springSoftness, defaults.springSoftness, 0, 1),
		glowStrength: clampNumber(settings.glowStrength, defaults.glowStrength, 0, 1.5),
		providers: {
			...defaults.providers,
			...providers,
			order: normalizeProviderOrder(providers.order),
			enabled: {
				...defaults.providers.enabled,
				spotify: enabled.spotify ?? defaults.providers.enabled.spotify,
				lrclib: enabled.lrclib ?? defaults.providers.enabled.lrclib,
				musixmatch: enabled.musixmatch ?? defaults.providers.enabled.musixmatch,
			},
			musixmatchToken: providers.musixmatchToken,
		},
	};
};
