import type { ProviderId } from "../lyrics/types";

export type LyricsVisualPreset = "immersive" | "clean" | "karaoke" | "custom";
export type SyncPreference = "prefer-syllable" | "line-only";
export type AlignmentMode = "natural" | "center" | "left";

export type ExtensionSettings = {
	preset: LyricsVisualPreset;
	aspectRatio: "1:1" | "4:3" | "16:9";
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
	lyricsVerticalPosition: number;
	visibleContextLines: number;
	showInterludes: boolean;
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

export type SettingsStorage = {
	get(key: string): string | null | undefined;
	set(key: string, value: string): void;
};

const SETTINGS_KEY = "aura-lyrics:settings";
const MIGRATED_KEY = "aura-lyrics:migrated-v1";
const LEGACY_SETTINGS_KEY = "dynamic-popup-lyrics:settings";
const LEGACY_MIGRATED_KEY = "dynamic-popup-lyrics:migrated-v1";
const KNOWN_PROVIDER_IDS: ProviderId[] = ["spotify", "lrclib", "musixmatch", "netease"];

export const DEFAULT_SETTINGS: ExtensionSettings = {
	preset: "immersive",
	aspectRatio: "1:1",
	lyricsDelayMs: 0,
	fontScale: 1,
	fontFamily: "spotify-circular",
	backgroundEnabled: true,
	backgroundBlurPx: 36,
	backgroundDim: 0.62,
	backgroundSaturation: 1.15,
	vignetteStrength: 0.55,
	inactiveBlurPx: 0.85,
	syncPreference: "prefer-syllable",
	alignmentMode: "center",
	lyricsVerticalPosition: 0.5,
	visibleContextLines: 1,
	showInterludes: true,
	motionEnabled: true,
	motionIntensity: 1,
	springSoftness: 0.65,
	glowStrength: 0.8,
	reduceMotion: false,
	providers: {
		order: ["spotify", "lrclib", "musixmatch", "netease"],
		enabled: {
			spotify: true,
			lrclib: true,
			musixmatch: true,
			netease: true,
		},
	},
	debugMode: false,
};

export const PRESETS: Record<Exclude<LyricsVisualPreset, "custom">, Partial<ExtensionSettings>> = {
	immersive: {
		backgroundEnabled: true,
		backgroundBlurPx: 36,
		backgroundDim: 0.62,
		backgroundSaturation: 1.15,
		vignetteStrength: 0.55,
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

const parseBool = (value: string | null | undefined, fallback: boolean): boolean => (value == null ? fallback : value === "true");
const parseNumber = (value: string | null | undefined, fallback: number): number => {
	if (value == null || value.trim() === "") {
		return fallback;
	}
	const next = Number(value);
	return Number.isFinite(next) ? next : fallback;
};

const legacyRatio = (value: string | null | undefined): ExtensionSettings["aspectRatio"] => {
	if (value === "43") {
		return "4:3";
	}
	if (value === "169") {
		return "16:9";
	}
	return "1:1";
};

const sanitizeProviderOrder = (value: string | null | undefined): ProviderId[] => {
	if (!value) {
		return DEFAULT_SETTINGS.providers.order;
	}
	try {
		return normalizeProviderOrder(JSON.parse(value));
	} catch {
		return DEFAULT_SETTINGS.providers.order;
	}
};

const isProviderId = (value: unknown): value is ProviderId => typeof value === "string" && KNOWN_PROVIDER_IDS.includes(value as ProviderId);
const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
	const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return Math.min(max, Math.max(min, next));
};
const normalizeProviderOrder = (value: unknown): ProviderId[] => {
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

type PersistedSettings = Partial<ExtensionSettings> & {
	fontSizePx?: number;
	providers?: Partial<ExtensionSettings["providers"]>;
};

export const normalizeLoadedSettings = (raw: PersistedSettings): ExtensionSettings => {
	const defaults = structuredClone(DEFAULT_SETTINGS);
	const fontScale = raw.fontScale ?? (typeof raw.fontSizePx === "number" ? raw.fontSizePx / 25 : defaults.fontScale);
	const providers: Partial<ExtensionSettings["providers"]> = raw.providers ?? {};
	const enabled: Partial<Record<ProviderId, boolean>> = providers.enabled ?? {};
	return {
		...defaults,
		...raw,
		fontScale: clampNumber(fontScale, defaults.fontScale, 0.6, 2.4),
		lyricsDelayMs: clampNumber(raw.lyricsDelayMs, defaults.lyricsDelayMs, -5000, 5000),
		backgroundBlurPx: clampNumber(raw.backgroundBlurPx, defaults.backgroundBlurPx, 0, 80),
		backgroundDim: clampNumber(raw.backgroundDim, defaults.backgroundDim, 0, 1),
		backgroundSaturation: clampNumber(raw.backgroundSaturation, defaults.backgroundSaturation, 0, 2),
		vignetteStrength: clampNumber(raw.vignetteStrength, defaults.vignetteStrength, 0, 1),
		inactiveBlurPx: clampNumber(raw.inactiveBlurPx, defaults.inactiveBlurPx, 0, 4),
		lyricsVerticalPosition: clampNumber(raw.lyricsVerticalPosition, defaults.lyricsVerticalPosition, 0.25, 0.75),
		visibleContextLines: Math.round(clampNumber(raw.visibleContextLines, defaults.visibleContextLines, 0, 2)),
		motionIntensity: clampNumber(raw.motionIntensity, defaults.motionIntensity, 0, 2),
		springSoftness: clampNumber(raw.springSoftness, defaults.springSoftness, 0, 1),
		glowStrength: clampNumber(raw.glowStrength, defaults.glowStrength, 0, 1.5),
		providers: {
			...defaults.providers,
			...providers,
			order: normalizeProviderOrder(providers.order),
			enabled: {
				...defaults.providers.enabled,
				spotify: enabled.spotify ?? defaults.providers.enabled.spotify,
				lrclib: enabled.lrclib ?? defaults.providers.enabled.lrclib,
				musixmatch: enabled.musixmatch ?? defaults.providers.enabled.musixmatch,
				netease: enabled.netease ?? defaults.providers.enabled.netease,
			},
			musixmatchToken: providers.musixmatchToken,
		},
	};
};

export class SettingsStore {
	private settings: ExtensionSettings;
	private readonly listeners = new Set<(settings: ExtensionSettings) => void>();

	public constructor(private readonly storage: SettingsStorage) {
		this.settings = this.load();
	}

	public get(): ExtensionSettings {
		return structuredClone(this.settings);
	}

	public update(patch: Partial<ExtensionSettings>, markCustom = true): ExtensionSettings {
		this.settings = normalizeLoadedSettings({
			...this.settings,
			...patch,
			preset: markCustom && patch.preset === undefined ? "custom" : (patch.preset ?? this.settings.preset),
			providers: {
				...this.settings.providers,
				...patch.providers,
				enabled: {
					...this.settings.providers.enabled,
					...patch.providers?.enabled,
				},
			},
		});
		this.persist();
		this.emit();
		return this.get();
	}

	public applyPreset(preset: Exclude<LyricsVisualPreset, "custom">): ExtensionSettings {
		return this.update({ ...PRESETS[preset], preset }, false);
	}

	public reset(): ExtensionSettings {
		this.settings = structuredClone(DEFAULT_SETTINGS);
		this.persist();
		this.emit();
		return this.get();
	}

	public subscribe(listener: (settings: ExtensionSettings) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private load(): ExtensionSettings {
		const raw = this.storage.get(SETTINGS_KEY);
		if (raw) {
			try {
				return normalizeLoadedSettings(JSON.parse(raw) as PersistedSettings);
			} catch {
				return structuredClone(DEFAULT_SETTINGS);
			}
		}
		const legacyRaw = this.storage.get(LEGACY_SETTINGS_KEY);
		if (legacyRaw) {
			try {
				const migrated = normalizeLoadedSettings(JSON.parse(legacyRaw) as PersistedSettings);
				this.settings = migrated;
				this.persist();
				return migrated;
			} catch {
				return structuredClone(DEFAULT_SETTINGS);
			}
		}
		const migrated = this.migrateLegacy();
		this.settings = migrated;
		this.persist();
		return migrated;
	}

	private migrateLegacy(): ExtensionSettings {
		if (this.storage.get(MIGRATED_KEY) === "true" || this.storage.get(LEGACY_MIGRATED_KEY) === "true") {
			return structuredClone(DEFAULT_SETTINGS);
		}
		const migrated: ExtensionSettings = {
			...structuredClone(DEFAULT_SETTINGS),
			fontScale: parseNumber(this.storage.get("popup-lyrics:font-size"), 25) / 25,
			lyricsDelayMs: parseNumber(this.storage.get("popup-lyrics:delay"), DEFAULT_SETTINGS.lyricsDelayMs),
			aspectRatio: legacyRatio(this.storage.get("popup-lyrics:ratio")),
			backgroundEnabled: parseBool(this.storage.get("popup-lyrics:show-cover"), DEFAULT_SETTINGS.backgroundEnabled),
			backgroundBlurPx: parseNumber(this.storage.get("popup-lyrics:blur-size"), DEFAULT_SETTINGS.backgroundBlurPx),
			alignmentMode: parseBool(this.storage.get("popup-lyrics:center-align"), true) ? "center" : "left",
			motionEnabled: parseBool(this.storage.get("popup-lyrics:smooth"), DEFAULT_SETTINGS.motionEnabled),
			providers: {
				...structuredClone(DEFAULT_SETTINGS.providers),
				order: sanitizeProviderOrder(this.storage.get("popup-lyrics:services-order")),
				enabled: {
					spotify: parseBool(this.storage.get("popup-lyrics:services:spotify:on"), true),
					lrclib: parseBool(this.storage.get("popup-lyrics:services:lrclib:on"), true),
					musixmatch: parseBool(this.storage.get("popup-lyrics:services:musixmatch:on"), true),
					netease: parseBool(this.storage.get("popup-lyrics:services:netease:on"), true),
				},
				musixmatchToken: this.storage.get("popup-lyrics:services:musixmatch:token") ?? undefined,
			},
		};
		this.storage.set(MIGRATED_KEY, "true");
		return migrated;
	}

	private persist(): void {
		this.storage.set(SETTINGS_KEY, JSON.stringify(this.settings));
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener(this.get());
		}
	}
}
