import type { ProviderId } from "../domain/types";
import { EventEmitter } from "../shared/EventEmitter";
import { DEFAULT_SETTINGS, type ExtensionSettings, normalizeLoadedSettings, normalizeProviderOrder, type PersistedSettings } from "./settingsSchema";

export type SettingsStorage = {
	get(key: string): string | null | undefined;
	set(key: string, value: string): boolean;
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

export class SettingsPersistence {
	private failurePending = false;
	public readonly failed = new EventEmitter<void>();

	public constructor(private readonly storage: SettingsStorage) {}

	public load(): ExtensionSettings {
		let raw: string | null | undefined;
		try {
			raw = this.storage.get(SETTINGS_KEY);
		} catch {
			this.reportFailure();
			return structuredClone(DEFAULT_SETTINGS);
		}
		if (raw) {
			try {
				return this.normalize(JSON.parse(raw) as PersistedSettings);
			} catch {
				return structuredClone(DEFAULT_SETTINGS);
			}
		}

		let legacyRaw: string | null | undefined;
		try {
			legacyRaw = this.storage.get(LEGACY_SETTINGS_KEY);
		} catch {
			this.reportFailure();
			return structuredClone(DEFAULT_SETTINGS);
		}
		if (legacyRaw) {
			try {
				const migrated = this.normalize(JSON.parse(legacyRaw) as PersistedSettings);
				this.persistMigration(migrated);
				return migrated;
			} catch {
				return structuredClone(DEFAULT_SETTINGS);
			}
		}

		try {
			if (this.storage.get(MIGRATED_KEY) === "true" || this.storage.get(LEGACY_MIGRATED_KEY) === "true") {
				return structuredClone(DEFAULT_SETTINGS);
			}
			const migrated = this.migrateLegacy();
			this.persistMigration(migrated);
			return migrated;
		} catch {
			this.reportFailure();
			return structuredClone(DEFAULT_SETTINGS);
		}
	}

	public normalize(raw: PersistedSettings): ExtensionSettings {
		return normalizeLoadedSettings(raw);
	}

	public save(settings: ExtensionSettings): boolean {
		const saved = this.write(SETTINGS_KEY, JSON.stringify(settings));
		if (!saved) {
			this.reportFailure();
		}
		return saved;
	}

	public consumeFailure(): boolean {
		const pending = this.failurePending;
		this.failurePending = false;
		return pending;
	}

	private migrateLegacy(): ExtensionSettings {
		return this.normalize({
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
		});
	}

	private persistMigration(settings: ExtensionSettings): boolean {
		const serialized = JSON.stringify(settings);
		if (!this.write(SETTINGS_KEY, serialized) || this.read(SETTINGS_KEY) !== serialized) {
			this.reportFailure();
			return false;
		}
		const markerSaved = this.write(MIGRATED_KEY, "true");
		if (!markerSaved) {
			this.reportFailure();
		}
		return markerSaved;
	}

	private write(key: string, value: string): boolean {
		try {
			return this.storage.set(key, value);
		} catch {
			return false;
		}
	}

	private read(key: string): string | null | undefined {
		try {
			return this.storage.get(key);
		} catch {
			return null;
		}
	}

	private reportFailure(): void {
		this.failurePending = true;
		this.failed.emit(undefined);
	}
}
