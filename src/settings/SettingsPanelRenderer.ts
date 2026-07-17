import type { LyricsProvider } from "../lyrics/types";
import { SettingsControlFactory } from "./SettingsControlFactory";
import { SettingsProviderPanel } from "./SettingsProviderPanel";
import { type ExtensionSettings, PRESETS, type SettingsStore, type SettingsUpdateResult, type UiLanguage } from "./SettingsStore";
import { formatTranslation, translate, translatedOptionLabel } from "./settingsTranslations";
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
			onMusixmatchTokenAccepted: callbacks.onMusixmatchTokenAccepted,
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
							const result = this.update({ language: value as UiLanguage });
							this.callbacks.onScheduleRefresh(true);
							return result.persisted;
						},
						(value) => this.optionLabel("language", value, language)
					),
					this.controls.select(
						"preset",
						translate("preset", language),
						settings.preset,
						Object.keys(PRESETS).concat("custom"),
						(value) => {
							const result =
								value === "custom"
									? this.store.updateWithResult({ preset: "custom" }, false)
									: this.store.applyPresetWithResult(value as Exclude<ExtensionSettings["preset"], "custom">);
							this.callbacks.onScheduleRefresh();
							return result.persisted;
						},
						(value) => this.optionLabel("preset", value, language)
					),
				];
			case "lyrics":
				return [
					this.currentTrackDelayCard(settings),
					this.controls.number("lyrics-delay", translate("defaultLyricsDelay", language), settings.lyricsDelayMs, (value) => {
						const result = this.update({ lyricsDelayMs: value });
						this.callbacks.onScheduleRefresh();
						return { persisted: result.persisted, value: result.settings.lyricsDelayMs };
					}),
					this.controls.range("font-scale", translate("fontScale", language), settings.fontScale, 0.72, 1.5, 0.01, (value) =>
						this.preview({ fontScale: value })
					),
					this.controls.select(
						"sync",
						translate("sync", language),
						settings.syncPreference,
						["prefer-syllable", "line-only"],
						(value) => this.update({ syncPreference: value as ExtensionSettings["syncPreference"] }).persisted,
						(value) => this.optionLabel("sync", value, language)
					),
					this.controls.toggle(
						"pseudo-karaoke",
						translate("pseudoKaraoke", language),
						settings.pseudoKaraoke,
						(value) => this.update({ pseudoKaraoke: value }).persisted
					),
					this.controls.toggle(
						"show-translation",
						translate("showTranslation", language),
						settings.showTranslation,
						(value) => this.update({ showTranslation: value }).persisted
					),
					this.controls.select(
						"alignment",
						translate("alignment", language),
						settings.alignmentMode,
						["natural", "center", "left"],
						(value) => this.update({ alignmentMode: value as ExtensionSettings["alignmentMode"] }).persisted,
						(value) => this.optionLabel("alignment", value, language)
					),
					this.controls.number("context-lines", translate("contextLines", language), settings.visibleContextLines, (value) => {
						const result = this.update({ visibleContextLines: value });
						return { persisted: result.persisted, value: result.settings.visibleContextLines };
					}),
					this.controls.toggle(
						"show-interludes",
						translate("showInterludes", language),
						settings.showInterludes,
						(value) => this.update({ showInterludes: value }).persisted
					),
					this.controls.select(
						"interlude-style",
						translate("interludeStyle", language),
						settings.interludeStyle,
						["frame", "dots", "wave"],
						(value) => this.update({ interludeStyle: value as ExtensionSettings["interludeStyle"] }).persisted,
						(value) => this.optionLabel("interlude", value, language)
					),
				];
			case "appearance":
				return [
					this.controls.number("background-blur", translate("blur", language), settings.backgroundBlurPx, (value) => {
						const result = this.update({ backgroundBlurPx: value });
						return { persisted: result.persisted, value: result.settings.backgroundBlurPx };
					}),
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
					this.controls.toggle(
						"motion-enabled",
						translate("animations", language),
						settings.motionEnabled,
						(value) => this.update({ motionEnabled: value }).persisted
					),
					this.controls.range("motion-intensity", translate("intensity", language), settings.motionIntensity, 0, 1.5, 0.05, (value) =>
						this.preview({ motionIntensity: value })
					),
					this.controls.range("glow-strength", translate("glow", language), settings.glowStrength, 0, 1, 0.05, (value) =>
						this.preview({ glowStrength: value })
					),
					this.controls.toggle(
						"reduce-motion",
						translate("reduceMotion", language),
						settings.reduceMotion,
						(value) => this.update({ reduceMotion: value }).persisted
					),
				];
			case "providers":
				return this.providerPanel.render(settings);
			case "advanced":
				return [
					this.controls.toggle(
						"debug-mode",
						translate("debugMode", language),
						settings.debugMode,
						(value) => this.update({ debugMode: value }).persisted
					),
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

	private currentTrackDelayCard(settings: ExtensionSettings): HTMLElement {
		const language = settings.language;
		const state = this.callbacks.getCurrentTrackLyricsDelay();
		const card = this.ownerDocument.createElement("section");
		card.className = "track-delay-card";
		card.dataset.controlId = "current-track-delay";
		const heading = this.ownerDocument.createElement("h4");
		heading.textContent = translate("currentTrackDelay", language);
		card.append(heading);
		if (!state) {
			card.setAttribute("aria-disabled", "true");
			const message = this.ownerDocument.createElement("p");
			message.className = "track-delay-empty";
			message.textContent = translate("noCurrentTrackDelay", language);
			card.append(message);
			return card;
		}

		const header = this.ownerDocument.createElement("div");
		header.className = "track-delay-header";
		const metadata = this.ownerDocument.createElement("div");
		metadata.className = "track-delay-metadata";
		const title = this.ownerDocument.createElement("strong");
		title.textContent = state.title;
		metadata.append(title);
		if (state.artist) {
			const artist = this.ownerDocument.createElement("span");
			artist.textContent = state.artist;
			metadata.append(artist);
		}
		const valueGroup = this.ownerDocument.createElement("div");
		valueGroup.className = "track-delay-value-group";
		const value = this.ownerDocument.createElement("output");
		value.className = "track-delay-value";
		value.setAttribute("aria-live", "polite");
		value.textContent = `${formatDelayMs(state.delayMs)} ms`;
		const source = this.ownerDocument.createElement("span");
		source.className = "track-delay-source";
		source.textContent = translate(state.hasOverride ? "currentTrackDelayOverrideSource" : "currentTrackDelayDefaultSource", language);
		valueGroup.append(value, source);
		header.append(metadata, valueGroup);

		const hint = this.ownerDocument.createElement("p");
		hint.className = "track-delay-hint";
		hint.textContent = translate("currentTrackDelayHint", language);

		const actions = this.ownerDocument.createElement("div");
		actions.className = "track-delay-actions";
		for (const step of [-100, -50, 50, 100]) {
			const stepLabel = formatDelayMs(step);
			const button = this.controls.button(`track-delay-${step < 0 ? "minus" : "plus"}-${Math.abs(step)}`, `${stepLabel} ms`, () => {
				this.callbacks.onAdjustCurrentTrackLyricsDelay(state.uri, step);
				this.callbacks.onScheduleRefresh();
			});
			button.classList.add("track-delay-step");
			button.setAttribute("aria-label", formatTranslation("currentTrackDelayAdjust", { amount: stepLabel }, language));
			actions.append(button);
		}
		const reset = this.controls.button("reset-track-delay", translate("resetTrackDelay", language), () => {
			this.callbacks.onResetCurrentTrackLyricsDelay(state.uri);
			this.callbacks.onScheduleRefresh();
		});
		reset.classList.add("track-delay-reset");
		reset.disabled = !state.hasOverride;
		actions.append(reset);
		card.append(header, hint, actions);
		return card;
	}

	private update(patch: Partial<ExtensionSettings>): SettingsUpdateResult {
		return this.store.updateWithResult(patch);
	}

	private preview(patch: Partial<ExtensionSettings>): ExtensionSettings {
		return this.store.preview(patch);
	}

	private optionLabel(group: Parameters<typeof translatedOptionLabel>[0], value: string, language: UiLanguage): string {
		return translatedOptionLabel(group, value, language);
	}
}

const formatDelayMs = (value: number): string => (value > 0 ? `+${value}` : String(value));
