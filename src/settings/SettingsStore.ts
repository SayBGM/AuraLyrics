import type { ProviderId } from "../lyrics/types";
import {
	DEFAULT_SETTINGS,
	type ExtensionSettings,
	type LyricsVisualPreset,
	normalizeLoadedSettings,
	normalizeProviderOrder,
	type PersistedSettings,
	PRESETS,
} from "./settingsSchema";

export {
	type AlignmentMode,
	DEFAULT_SETTINGS,
	type ExtensionSettings,
	type InterludeStyle,
	type LyricsVisualPreset,
	normalizeLoadedSettings,
	PRESETS,
	type SyncPreference,
	type UiLanguage,
} from "./settingsSchema";

export type SettingsStorage = {
	get(key: string): string | null | undefined;
	set(key: string, value: string): void;
};

const SETTINGS_KEY = "aura-lyrics:settings";
const MIGRATED_KEY = "aura-lyrics:migrated-v1";
const LEGACY_SETTINGS_KEY = "dynamic-popup-lyrics:settings";
const LEGACY_MIGRATED_KEY = "dynamic-popup-lyrics:migrated-v1";

const parseBool = (value: string | null | undefined, fallback: boolean): boolean => (value == null ? fallback : value === "true");
const parseNumber = (value: string | null | undefined, fallback: number): number => {
	if (value == null || value.trim() === "") {
		return fallback;
	}
	const next = Number(value);
	return Number.isFinite(next) ? next : fallback;
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
			backgroundEnabled: true,
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
