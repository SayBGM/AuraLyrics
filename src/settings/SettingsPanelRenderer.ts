import type { LyricsProvider } from "../lyrics/types";
import { NUMERIC_SETTING_SPECS, type NumericSettingSpec } from "./numericSettingSpecs";
import { SettingsControlFactory } from "./SettingsControlFactory";
import { SettingsProviderPanel } from "./SettingsProviderPanel";
import { type ExtensionSettings, PRESETS, type SettingsStore, type SettingsUpdateResult, type UiLanguage } from "./SettingsStore";
import { formatTranslation, type TranslationKey, translate, translatedOptionLabel } from "./settingsTranslations";
import {
	SETTINGS_SECTIONS,
	type SettingsCallbacks,
	type SettingsFeedbackState,
	type SettingsSection,
	settingsPanelId,
	settingsTabId,
} from "./settingsViewTypes";

export type SettingsPanelRendererCallbacks = SettingsCallbacks & {
	onFeedback?(state: SettingsFeedbackState, text: string, durationMs?: number): void;
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
		this.controls = new SettingsControlFactory(ownerDocument, () => this.store.commit(), {
			onPersist: (persisted) => this.reportPersistence(persisted),
			onPreview: () => this.feedback("previewing", "previewing"),
		});
		this.providerPanel = new SettingsProviderPanel(ownerDocument, store, providers, this.controls, {
			onFeedback: callbacks.onFeedback,
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
		panel.append(heading, ...this.sectionGroups(section, settings));
		return panel;
	}

	public cleanup(): void {
		this.providerPanel.cleanup();
	}

	private sectionGroups(section: SettingsSection, settings: ExtensionSettings): HTMLElement[] {
		const language = settings.language;
		switch (section) {
			case "general":
				return [
					this.group("general-language", "language", "languageDescription", language, [
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
							(value) => this.optionLabel("language", value, language),
							{ description: translate("languageDescription", language) }
						),
					]),
					this.group("general-preset", "preset", "presetDescription", language, [
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
							(value) => this.optionLabel("preset", value, language),
							{ description: translate("presetDescription", language) }
						),
					]),
				];
			case "lyrics": {
				const pseudoDisabled = settings.syncPreference === "line-only" ? translate("pseudoKaraokeUnavailable", language) : undefined;
				const interludeDisabled = !settings.showInterludes ? translate("interludeUnavailable", language) : undefined;
				return [
					this.group("lyrics-current", "trackTiming", "trackTimingDescription", language, [this.currentTrackDelayCard(settings)]),
					this.group("lyrics-default", "timing", "timingDescription", language, [
						this.numericRange("lyrics-delay", "defaultLyricsDelay", "lyricsDelayMs", settings.lyricsDelayMs, language, (value) =>
							this.preview({ lyricsDelayMs: value })
						),
					]),
					this.group("lyrics-sync", "syncText", "syncTextDescription", language, [
						this.controls.select(
							"sync",
							translate("sync", language),
							settings.syncPreference,
							["prefer-syllable", "line-only"],
							(value) => {
								const result = this.update({ syncPreference: value as ExtensionSettings["syncPreference"] });
								this.callbacks.onScheduleRefresh();
								return result.persisted;
							},
							(value) => this.optionLabel("sync", value, language),
							{ description: translate("syncTextDescription", language) }
						),
						this.controls.toggle(
							"pseudo-karaoke",
							translate("pseudoKaraoke", language),
							settings.pseudoKaraoke,
							(value) => this.update({ pseudoKaraoke: value }).persisted,
							{ description: translate("syncTextDescription", language), disabledReason: pseudoDisabled }
						),
						this.controls.toggle(
							"show-translation",
							translate("showTranslation", language),
							settings.showTranslation,
							(value) => this.update({ showTranslation: value }).persisted,
							{ description: translate("syncTextDescription", language) }
						),
					]),
					this.group("lyrics-alignment", "alignmentContext", "alignmentContextDescription", language, [
						this.controls.select(
							"alignment",
							translate("alignment", language),
							settings.alignmentMode,
							["natural", "center", "left"],
							(value) => this.update({ alignmentMode: value as ExtensionSettings["alignmentMode"] }).persisted,
							(value) => this.optionLabel("alignment", value, language),
							{ description: translate("alignmentContextDescription", language) }
						),
						this.numericRange("context-lines", "contextLines", "visibleContextLines", settings.visibleContextLines, language, (value) =>
							this.preview({ visibleContextLines: value })
						),
					]),
					this.group("lyrics-interludes", "interludes", "interludesDescription", language, [
						this.controls.toggle(
							"show-interludes",
							translate("showInterludes", language),
							settings.showInterludes,
							(value) => {
								const result = this.update({ showInterludes: value });
								this.callbacks.onScheduleRefresh();
								return result.persisted;
							},
							{ description: translate("interludesDescription", language) }
						),
						this.controls.select(
							"interlude-style",
							translate("interludeStyle", language),
							settings.interludeStyle,
							["frame", "dots", "wave"],
							(value) => this.update({ interludeStyle: value as ExtensionSettings["interludeStyle"] }).persisted,
							(value) => this.optionLabel("interlude", value, language),
							{ description: translate("interludesDescription", language), disabledReason: interludeDisabled }
						),
					]),
				];
			}
			case "appearance":
				return [
					this.group("appearance-background", "background", "backgroundDescription", language, [
						this.numericRange("background-blur", "blur", "backgroundBlurPx", settings.backgroundBlurPx, language, (value) =>
							this.preview({ backgroundBlurPx: value })
						),
						this.numericRange("background-dim", "dim", "backgroundDim", settings.backgroundDim, language, (value) =>
							this.preview({ backgroundDim: value })
						),
						this.numericRange("background-saturation", "saturation", "backgroundSaturation", settings.backgroundSaturation, language, (value) =>
							this.preview({ backgroundSaturation: value })
						),
						this.numericRange("vignette", "vignette", "vignetteStrength", settings.vignetteStrength, language, (value) =>
							this.preview({ vignetteStrength: value })
						),
					]),
					this.group("appearance-readability", "readability", "readabilityDescription", language, [
						this.numericRange("font-scale", "fontScale", "fontScale", settings.fontScale, language, (value) => this.preview({ fontScale: value })),
						this.numericRange("inactive-blur", "inactiveBlur", "inactiveBlurPx", settings.inactiveBlurPx, language, (value) =>
							this.preview({ inactiveBlurPx: value })
						),
					]),
				];
			case "motion": {
				const motionDisabled = !settings.motionEnabled || settings.reduceMotion ? translate("motionUnavailable", language) : undefined;
				return [
					this.group("motion-animation", "animations", "animationsDescription", language, [
						this.controls.toggle(
							"motion-enabled",
							translate("animations", language),
							settings.motionEnabled,
							(value) => {
								const result = this.update({ motionEnabled: value });
								this.callbacks.onScheduleRefresh();
								return result.persisted;
							},
							{ description: translate("animationsDescription", language) }
						),
						this.controls.toggle(
							"reduce-motion",
							translate("reduceMotion", language),
							settings.reduceMotion,
							(value) => {
								const result = this.update({ reduceMotion: value });
								this.callbacks.onScheduleRefresh();
								return result.persisted;
							},
							{ description: translate("animationsDescription", language) }
						),
						this.numericRange(
							"motion-intensity",
							"intensity",
							"motionIntensity",
							settings.motionIntensity,
							language,
							(value) => this.preview({ motionIntensity: value }),
							motionDisabled
						),
					]),
					this.group("motion-emphasis", "emphasis", "emphasisDescription", language, [
						this.numericRange("glow-strength", "glow", "glowStrength", settings.glowStrength, language, (value) =>
							this.preview({ glowStrength: value })
						),
					]),
				];
			}
			case "providers": {
				const groups = this.providerPanel.render(settings);
				return [
					this.group("providers-priority", "priority", "priorityDescription", language, groups.priority),
					this.group("providers-auth", "authentication", "authenticationDescription", language, groups.authentication),
					this.group("providers-network", "network", "networkDescription", language, groups.network),
				];
			}
			case "advanced":
				return [
					this.group("advanced-diagnostics", "diagnostics", "diagnosticsDescription", language, [
						this.controls.toggle(
							"debug-mode",
							translate("debugMode", language),
							settings.debugMode,
							(value) => this.update({ debugMode: value }).persisted,
							{ description: translate("diagnosticsDescription", language) }
						),
					]),
					this.group("advanced-maintenance", "maintenance", "maintenanceDescription", language, this.maintenanceActions(language)),
					this.group("advanced-reset", "reset", "resetDescription", language, [this.resetConfirmation(language)]),
				];
		}
	}

	private group(id: string, titleKey: TranslationKey, descriptionKey: TranslationKey, language: UiLanguage, children: HTMLElement[]): HTMLElement {
		const section = this.ownerDocument.createElement("section");
		section.className = "settings-group";
		const title = this.ownerDocument.createElement("h4");
		title.id = `aura-settings-group-${id}`;
		title.textContent = translate(titleKey, language);
		section.setAttribute("aria-labelledby", title.id);
		const description = this.ownerDocument.createElement("p");
		description.className = "settings-group-description";
		description.id = `aura-settings-group-${id}-description`;
		description.textContent = translate(descriptionKey, language);
		section.append(title, description, ...children);
		for (const control of Array.from(section.querySelectorAll<HTMLElement>("input, select, button"))) {
			const current = control.getAttribute("aria-describedby");
			control.setAttribute("aria-describedby", current ? `${current} ${description.id}` : description.id);
		}
		return section;
	}

	private numericRange(
		controlId: string,
		labelKey: TranslationKey,
		key: keyof typeof NUMERIC_SETTING_SPECS,
		value: number,
		language: UiLanguage,
		onChange: (value: number) => void,
		disabledReason?: string
	): HTMLElement {
		const spec = NUMERIC_SETTING_SPECS[key];
		return this.controls.range(
			controlId,
			translate(labelKey, language),
			value,
			spec,
			(next) => this.formatNumeric(next, spec, language),
			(next) => {
				onChange(next);
				return this.store.get()[key];
			},
			{ disabledReason }
		);
	}

	private formatNumeric(value: number, spec: NumericSettingSpec, language: UiLanguage): string {
		if (spec.unit === "percent") {
			return `${Math.round(value * 100)}%`;
		}
		if (spec.unit === "ms") {
			return `${formatDelayMs(Math.round(value))} ms`;
		}
		if (spec.unit === "lines") {
			return `${Math.round(value)}${language === "ko" ? "줄" : language === "ja" ? "行" : " lines"}`;
		}
		return `${Number(value.toFixed(2))} px`;
	}

	private maintenanceActions(language: UiLanguage): HTMLElement[] {
		const actions = this.ownerDocument.createElement("div");
		actions.className = "settings-action-row";
		const refresh = this.controls.button("refresh-current-lyrics", translate("refreshCurrentLyrics", language), () => {
			void this.runAction(refresh, this.callbacks.onRefreshLyrics, "lyricsRefreshed", language);
		});
		const clear = this.controls.button("clear-cache", translate("clearCache", language), () => {
			void this.runAction(clear, async () => this.callbacks.onClearCache(), "cacheCleared", language);
		});
		actions.append(refresh, clear);
		return [actions];
	}

	private resetConfirmation(language: UiLanguage): HTMLElement {
		const region = this.ownerDocument.createElement("div");
		region.className = "reset-region";
		const initial = (): void => {
			const start = this.controls.button("reset-settings", translate("resetSettings", language), confirm);
			start.classList.add("danger-action");
			region.replaceChildren(start);
		};
		const confirm = (): void => {
			const message = this.ownerDocument.createElement("p");
			message.className = "reset-confirmation-message";
			message.textContent = translate("resetConfirmation", language);
			const actions = this.ownerDocument.createElement("div");
			actions.className = "settings-action-row";
			const reset = this.controls.button("confirm-reset-settings", translate("reset", language), () => {
				const result = this.store.resetWithResult();
				if (!result.persisted) {
					this.feedback("error", "saveError");
					return;
				}
				this.callbacks.onFeedback?.("success", translate("settingsReset", language), 2500);
				this.callbacks.onScheduleRefresh(true);
			});
			reset.classList.add("danger-action");
			const cancel = this.controls.button("cancel-reset-settings", translate("cancel", language), initial);
			actions.append(reset, cancel);
			region.replaceChildren(message, actions);
		};
		initial();
		return region;
	}

	private async runAction(
		button: HTMLButtonElement,
		action: () => void | Promise<void>,
		successKey: TranslationKey,
		language: UiLanguage
	): Promise<void> {
		button.disabled = true;
		this.callbacks.onFeedback?.("working", translate("working", language));
		try {
			await action();
			this.callbacks.onFeedback?.("success", translate(successKey, language), 2500);
		} catch (error) {
			this.callbacks.onFeedback?.("error", error instanceof Error ? error.message : String(error));
		} finally {
			button.disabled = false;
		}
	}

	private currentTrackDelayCard(settings: ExtensionSettings): HTMLElement {
		const language = settings.language;
		const state = this.callbacks.getCurrentTrackLyricsDelay();
		const card = this.ownerDocument.createElement("section");
		card.className = "track-delay-card";
		card.dataset.controlId = "current-track-delay";
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
				const persisted = this.callbacks.onAdjustCurrentTrackLyricsDelay(state.uri, step);
				this.reportPersistence(persisted);
				if (persisted) {
					this.callbacks.onScheduleRefresh();
				}
			});
			button.classList.add("track-delay-step");
			button.setAttribute("aria-label", formatTranslation("currentTrackDelayAdjust", { amount: stepLabel }, language));
			actions.append(button);
		}
		const reset = this.controls.button("reset-track-delay", translate("resetTrackDelay", language), () => {
			const persisted = this.callbacks.onResetCurrentTrackLyricsDelay(state.uri);
			this.reportPersistence(persisted);
			if (persisted) {
				this.callbacks.onScheduleRefresh();
			}
		});
		reset.classList.add("track-delay-reset");
		reset.disabled = !state.hasOverride;
		actions.append(reset);
		card.append(header, hint, actions);
		return card;
	}

	private reportPersistence(persisted: boolean): void {
		this.feedback(persisted ? "saved" : "error", persisted ? "saved" : "saveError", persisted ? 1500 : undefined);
	}

	private feedback(state: SettingsFeedbackState, key: TranslationKey, durationMs?: number): void {
		this.callbacks.onFeedback?.(state, translate(key, this.store.get().language), durationMs);
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
