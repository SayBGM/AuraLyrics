import type { EventEmitter } from "../shared/EventEmitter";
import { SettingsPersistence, type SettingsStorage } from "./SettingsPersistence";
import { DEFAULT_SETTINGS, type ExtensionSettings, type LyricsVisualPreset, PRESET_CONTROLLED_KEYS, PRESETS } from "./settingsSchema";

export type { SettingsStorage } from "./SettingsPersistence";
export {
	type AlignmentMode,
	DEFAULT_SETTINGS,
	type ExtensionSettings,
	type HighlightEffect,
	type HighlightMotion,
	type InterludeStyle,
	type LyricsVisualPreset,
	normalizeLoadedSettings,
	PRESETS,
	type SyncPreference,
	type UiLanguage,
} from "./settingsSchema";

export type SettingsUpdateResult = {
	persisted: boolean;
	settings: ExtensionSettings;
};

export class SettingsStore {
	private readonly persistence: SettingsPersistence;
	private settings: ExtensionSettings;
	private readonly listeners = new Set<(settings: ExtensionSettings) => void>();
	public readonly persistenceFailed: EventEmitter<void>;

	public constructor(storage: SettingsStorage) {
		this.persistence = new SettingsPersistence(storage);
		this.persistenceFailed = this.persistence.failed;
		this.settings = this.persistence.load();
	}

	public get(): ExtensionSettings {
		return structuredClone(this.settings);
	}

	public update(patch: Partial<ExtensionSettings>, markCustom = true): ExtensionSettings {
		return this.updateWithResult(patch, markCustom).settings;
	}

	public updateWithResult(patch: Partial<ExtensionSettings>, markCustom = true): SettingsUpdateResult {
		this.settings = this.merge(patch, markCustom);
		const persisted = this.persist();
		this.emit();
		return { persisted, settings: this.get() };
	}

	public preview(patch: Partial<ExtensionSettings>, markCustom = true): ExtensionSettings {
		this.settings = this.merge(patch, markCustom);
		this.emit();
		return this.get();
	}

	public commit(): boolean {
		return this.persist();
	}

	public consumePersistenceFailure(): boolean {
		return this.persistence.consumeFailure();
	}

	public applyPreset(preset: Exclude<LyricsVisualPreset, "custom">): ExtensionSettings {
		return this.applyPresetWithResult(preset).settings;
	}

	public applyPresetWithResult(preset: Exclude<LyricsVisualPreset, "custom">): SettingsUpdateResult {
		return this.updateWithResult({ ...PRESETS[preset], preset }, false);
	}

	public reset(): ExtensionSettings {
		return this.resetWithResult().settings;
	}

	public resetWithResult(): SettingsUpdateResult {
		this.settings = structuredClone(DEFAULT_SETTINGS);
		const persisted = this.persist();
		this.emit();
		return { persisted, settings: this.get() };
	}

	public subscribe(listener: (settings: ExtensionSettings) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private merge(patch: Partial<ExtensionSettings>, markCustom: boolean): ExtensionSettings {
		const changesPresetValue = PRESET_CONTROLLED_KEYS.some((key) => patch[key] !== undefined && patch[key] !== this.settings[key]);
		return this.persistence.normalize({
			...this.settings,
			...patch,
			preset: markCustom && patch.preset === undefined && changesPresetValue ? "custom" : (patch.preset ?? this.settings.preset),
			providers: {
				...this.settings.providers,
				...patch.providers,
				enabled: {
					...this.settings.providers.enabled,
					...patch.providers?.enabled,
				},
			},
		});
	}

	private persist(): boolean {
		return this.persistence.save(this.settings);
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener(this.get());
		}
	}
}
