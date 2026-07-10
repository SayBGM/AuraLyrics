import type { LyricsProvider } from "../lyrics/types";
import { SettingsControlFactory } from "./SettingsControlFactory";
import { SettingsProviderPanel } from "./SettingsProviderPanel";
import { type ExtensionSettings, PRESETS, type SettingsStore, type UiLanguage } from "./SettingsStore";
import { translate, translatedOptionLabel } from "./settingsTranslations";
import { SETTINGS_SECTIONS, type SettingsCallbacks, type SettingsSection, settingsPanelId, settingsTabId } from "./settingsViewTypes";

export type SettingsPanelRendererCallbacks = SettingsCallbacks & {
	onScheduleRefresh(refreshNavigation?: boolean): void;
};

export class SettingsPanelRenderer {
	private readonly controls: SettingsControlFactory;
	private readonly providerPanel: SettingsProviderPanel;

	public constructor(
		private readonly ownerDocument: Document,
		private readonly store: SettingsStore,
		providers: LyricsProvider[],
		private readonly callbacks: SettingsPanelRendererCallbacks
	) {
		this.controls = new SettingsControlFactory(ownerDocument, () => this.store.commit());
		this.providerPanel = new SettingsProviderPanel(ownerDocument, store, providers, this.controls, {
			onRefreshMusixmatchToken: callbacks.onRefreshMusixmatchToken,
			onScheduleRefresh: () => callbacks.onScheduleRefresh(),
		});
	}

	public render(section: SettingsSection): HTMLElement {
		if (section !== "providers") {
			this.providerPanel.cleanup();
		}
		const settings = this.store.get();
		const panel = this.ownerDocument.createElement("section");
		panel.className = "settings-panel";
		panel.id = settingsPanelId(section);
		panel.setAttribute("role", "tabpanel");
		panel.setAttribute("aria-labelledby", settingsTabId(section));
		const heading = this.ownerDocument.createElement("h3");
		heading.textContent = translate(SETTINGS_SECTIONS.find((item) => item.id === section)?.label ?? "general", settings.language);
		panel.append(heading, ...this.sectionControls(section, settings));
		return panel;
	}

	public cleanup(): void {
		this.providerPanel.cleanup();
	}

	private sectionControls(section: SettingsSection, settings: ExtensionSettings): HTMLElement[] {
		const language = settings.language;
		switch (section) {
			case "general":
				return [
					this.controls.select(
						"language",
						translate("language", language),
						settings.language,
						["en", "ko", "ja"],
						(value) => {
							this.update({ language: value as UiLanguage });
							this.callbacks.onScheduleRefresh(true);
						},
						(value) => this.optionLabel("language", value, language)
					),
					this.controls.select(
						"preset",
						translate("preset", language),
						settings.preset,
						Object.keys(PRESETS).concat("custom"),
						(value) => {
							if (value === "custom") {
								this.store.update({ preset: "custom" }, false);
							} else {
								this.store.applyPreset(value as Exclude<ExtensionSettings["preset"], "custom">);
							}
							this.callbacks.onScheduleRefresh();
						},
						(value) => this.optionLabel("preset", value, language)
					),
				];
			case "lyrics":
				return [
					this.controls.number(
						"lyrics-delay",
						translate("lyricsDelay", language),
						settings.lyricsDelayMs,
						(value) => this.update({ lyricsDelayMs: value }).lyricsDelayMs
					),
					this.controls.range("font-scale", translate("fontScale", language), settings.fontScale, 0.72, 1.5, 0.01, (value) =>
						this.preview({ fontScale: value })
					),
					this.controls.select(
						"sync",
						translate("sync", language),
						settings.syncPreference,
						["prefer-syllable", "line-only"],
						(value) => this.update({ syncPreference: value as ExtensionSettings["syncPreference"] }),
						(value) => this.optionLabel("sync", value, language)
					),
					this.controls.toggle("pseudo-karaoke", translate("pseudoKaraoke", language), settings.pseudoKaraoke, (value) =>
						this.update({ pseudoKaraoke: value })
					),
					this.controls.toggle("show-translation", translate("showTranslation", language), settings.showTranslation, (value) =>
						this.update({ showTranslation: value })
					),
					this.controls.select(
						"alignment",
						translate("alignment", language),
						settings.alignmentMode,
						["natural", "center", "left"],
						(value) => this.update({ alignmentMode: value as ExtensionSettings["alignmentMode"] }),
						(value) => this.optionLabel("alignment", value, language)
					),
					this.controls.number(
						"context-lines",
						translate("contextLines", language),
						settings.visibleContextLines,
						(value) => this.update({ visibleContextLines: value }).visibleContextLines
					),
					this.controls.toggle("show-interludes", translate("showInterludes", language), settings.showInterludes, (value) =>
						this.update({ showInterludes: value })
					),
					this.controls.select(
						"interlude-style",
						translate("interludeStyle", language),
						settings.interludeStyle,
						["frame", "dots", "wave"],
						(value) => this.update({ interludeStyle: value as ExtensionSettings["interludeStyle"] }),
						(value) => this.optionLabel("interlude", value, language)
					),
				];
			case "appearance":
				return [
					this.controls.number(
						"background-blur",
						translate("blur", language),
						settings.backgroundBlurPx,
						(value) => this.update({ backgroundBlurPx: value }).backgroundBlurPx
					),
					this.controls.range("background-dim", translate("dim", language), settings.backgroundDim, 0, 1, 0.05, (value) =>
						this.preview({ backgroundDim: value })
					),
					this.controls.range("background-saturation", translate("saturation", language), settings.backgroundSaturation, 0, 2, 0.05, (value) =>
						this.preview({ backgroundSaturation: value })
					),
					this.controls.range("vignette", translate("vignette", language), settings.vignetteStrength, 0, 1, 0.05, (value) =>
						this.preview({ vignetteStrength: value })
					),
					this.controls.range("inactive-blur", translate("inactiveBlur", language), settings.inactiveBlurPx, 0, 2, 0.05, (value) =>
						this.preview({ inactiveBlurPx: value })
					),
				];
			case "motion":
				return [
					this.controls.toggle("motion-enabled", translate("animations", language), settings.motionEnabled, (value) =>
						this.update({ motionEnabled: value })
					),
					this.controls.range("motion-intensity", translate("intensity", language), settings.motionIntensity, 0, 1.5, 0.05, (value) =>
						this.preview({ motionIntensity: value })
					),
					this.controls.range("glow-strength", translate("glow", language), settings.glowStrength, 0, 1, 0.05, (value) =>
						this.preview({ glowStrength: value })
					),
					this.controls.toggle("reduce-motion", translate("reduceMotion", language), settings.reduceMotion, (value) =>
						this.update({ reduceMotion: value })
					),
				];
			case "providers":
				return this.providerPanel.render(settings);
			case "advanced":
				return [
					this.controls.toggle("debug-mode", translate("debugMode", language), settings.debugMode, (value) => this.update({ debugMode: value })),
					this.controls.button("refresh-current-lyrics", translate("refreshCurrentLyrics", language), this.callbacks.onRefreshLyrics),
					this.controls.button("clear-cache", translate("clearCache", language), this.callbacks.onClearCache),
					this.controls.button("reset-settings", translate("resetSettings", language), () => {
						this.store.reset();
						this.providerPanel.clearTokenStatus();
						this.callbacks.onScheduleRefresh(true);
					}),
				];
		}
	}

	private update(patch: Partial<ExtensionSettings>): ExtensionSettings {
		return this.store.update(patch);
	}

	private preview(patch: Partial<ExtensionSettings>): ExtensionSettings {
		return this.store.preview(patch);
	}

	private optionLabel(group: Parameters<typeof translatedOptionLabel>[0], value: string, language: UiLanguage): string {
		return translatedOptionLabel(group, value, language);
	}
}
