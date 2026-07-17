import type { SettingsIconName } from "./settingsIcons";
import type { TranslationKey } from "./settingsTranslations";

export type CurrentTrackLyricsDelayState = {
	artist: string;
	delayMs: number;
	defaultDelayMs: number;
	hasOverride: boolean;
	title: string;
	uri: string;
};

export type SettingsCallbacks = {
	getCurrentTrackLyricsDelay(): CurrentTrackLyricsDelayState | undefined;
	onAdjustCurrentTrackLyricsDelay(uri: string, deltaMs: number): void;
	onRefreshLyrics(): void;
	onClearCache(): void;
	onMusixmatchTokenAccepted(token: string): void;
	onRefreshMusixmatchToken(): Promise<string | undefined>;
	onResetCurrentTrackLyricsDelay(uri: string): void;
};

export type SettingsSection = "advanced" | "appearance" | "general" | "lyrics" | "motion" | "providers";

export type SettingsSectionDefinition = {
	icon: SettingsIconName;
	id: SettingsSection;
	label: TranslationKey;
};

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
	{ id: "general", icon: "general", label: "general" },
	{ id: "lyrics", icon: "lyrics", label: "lyrics" },
	{ id: "appearance", icon: "appearance", label: "appearance" },
	{ id: "motion", icon: "motion", label: "motion" },
	{ id: "providers", icon: "providers", label: "providers" },
	{ id: "advanced", icon: "advanced", label: "advanced" },
];

export const settingsTabId = (section: SettingsSection): string => `aura-settings-tab-${section}`;
export const settingsPanelId = (section: SettingsSection): string => `aura-settings-panel-${section}`;
