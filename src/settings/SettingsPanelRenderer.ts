import type { LyricsProvider } from "../lyrics/types";
import { NUMERIC_SETTING_SPECS, type NumericSettingKey, type NumericSettingSpec } from "./numericSettingSpecs";
import { SettingsControlFactory } from "./SettingsControlFactory";
import { SettingsProviderPanel } from "./SettingsProviderPanel";
import { DEFAULT_SETTINGS, type ExtensionSettings, PRESETS, type SettingsStore, type SettingsUpdateResult, type UiLanguage } from "./SettingsStore";
import { formatTranslation, type OptionGroup, type TranslationKey, translate, translatedOptionLabel } from "./settingsTranslations";
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

type SelectSettingKey =
	| "alignmentMode"
	| "fontFamily"
	| "highlightEffect"
	| "highlightMotion"
	| "interludeStyle"
	| "language"
	| "preset"
	| "syncPreference";
type ToggleSettingKey = "backgroundEnabled" | "debugMode" | "motionEnabled" | "pseudoKaraoke" | "reduceMotion" | "showInterludes" | "showTranslation";
type RangeSettingKey = NumericSettingKey;

type DisabledReasonResolver = (settings: ExtensionSettings, language: UiLanguage) => string | undefined;

type ControlSpecBase = {
	id: string;
	labelKey: TranslationKey;
	/** Defaults to the owning group's descriptionKey when omitted (matches the legacy behavior). */
	descriptionKey?: TranslationKey;
	/** Calls onScheduleRefresh() — other rendered controls depend on this setting's value. */
	refresh?: boolean;
	/** Calls onScheduleRefresh(true) — also refreshes navigation (only "language" needs this). */
	refreshNavigation?: boolean;
	disabledReason?: DisabledReasonResolver;
};

type SelectControlSpec = ControlSpecBase & {
	type: "select";
	key: SelectSettingKey;
	optionGroup: OptionGroup;
	options: readonly string[];
	/** Override for settings that don't persist via a plain `{ [key]: value }` patch (only "preset"). */
	apply?: (store: SettingsStore, value: string) => SettingsUpdateResult;
};

type ToggleControlSpec = ControlSpecBase & {
	type: "toggle";
	key: ToggleSettingKey;
};

type RangeControlSpec = ControlSpecBase & {
	type: "range";
	key: RangeSettingKey;
};

type ControlSpec = SelectControlSpec | ToggleControlSpec | RangeControlSpec;

/** Bespoke, non-declarative pieces kept as explicit escape hatches from the ControlSpec table. */
type CustomGroupId = "currentTrackDelay" | "highlightPreview" | "maintenanceActions" | "resetConfirmation";

type ControlGroupSpec = {
	id: string;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
	controls: ControlSpec[];
	/** Appended after the generated controls (or the only content, when controls is empty). */
	customId?: CustomGroupId;
};

const pseudoKaraokeDisabledReason: DisabledReasonResolver = (settings, language) =>
	settings.syncPreference === "line-only" ? translate("pseudoKaraokeUnavailable", language) : undefined;

const interludeStyleDisabledReason: DisabledReasonResolver = (settings, language) =>
	settings.showInterludes ? undefined : translate("interludeUnavailable", language);

const motionDisabledReason: DisabledReasonResolver = (settings, language) =>
	!settings.motionEnabled || settings.reduceMotion ? translate("motionUnavailable", language) : undefined;

const PRESET_OPTIONS = [...Object.keys(PRESETS), "custom"];
const FONT_FAMILY_OPTIONS = [DEFAULT_SETTINGS.fontFamily, "Inter", "system-ui", "serif"];

const applyPreset = (store: SettingsStore, value: string): SettingsUpdateResult =>
	value === "custom"
		? store.updateWithResult({ preset: "custom" }, false)
		: store.applyPresetWithResult(value as Exclude<ExtensionSettings["preset"], "custom">);

const SECTION_CONTROLS: Record<Exclude<SettingsSection, "providers">, ControlGroupSpec[]> = {
	general: [
		{
			id: "general-language",
			titleKey: "language",
			descriptionKey: "languageDescription",
			controls: [
				{
					type: "select",
					id: "language",
					key: "language",
					labelKey: "language",
					optionGroup: "language",
					options: ["en", "ko", "ja"],
					refreshNavigation: true,
				},
			],
		},
		{
			id: "general-preset",
			titleKey: "preset",
			descriptionKey: "presetDescription",
			controls: [
				{
					type: "select",
					id: "preset",
					key: "preset",
					labelKey: "preset",
					optionGroup: "preset",
					options: PRESET_OPTIONS,
					refresh: true,
					apply: applyPreset,
				},
			],
		},
	],
	lyrics: [
		{
			id: "lyrics-current",
			titleKey: "trackTiming",
			descriptionKey: "trackTimingDescription",
			controls: [],
			customId: "currentTrackDelay",
		},
		{
			id: "lyrics-default",
			titleKey: "timing",
			descriptionKey: "timingDescription",
			controls: [{ type: "range", id: "lyrics-delay", key: "lyricsDelayMs", labelKey: "defaultLyricsDelay" }],
		},
		{
			id: "lyrics-sync",
			titleKey: "syncText",
			descriptionKey: "syncTextDescription",
			controls: [
				{
					type: "select",
					id: "sync",
					key: "syncPreference",
					labelKey: "sync",
					optionGroup: "sync",
					options: ["prefer-syllable", "line-only"],
					refresh: true,
				},
				{ type: "toggle", id: "pseudo-karaoke", key: "pseudoKaraoke", labelKey: "pseudoKaraoke", disabledReason: pseudoKaraokeDisabledReason },
				{ type: "toggle", id: "show-translation", key: "showTranslation", labelKey: "showTranslation" },
			],
		},
		{
			id: "lyrics-alignment",
			titleKey: "alignmentContext",
			descriptionKey: "alignmentContextDescription",
			controls: [
				{
					type: "select",
					id: "alignment",
					key: "alignmentMode",
					labelKey: "alignment",
					optionGroup: "alignment",
					options: ["natural", "center", "left"],
				},
				{ type: "range", id: "context-lines", key: "visibleContextLines", labelKey: "contextLines" },
			],
		},
		{
			id: "lyrics-interludes",
			titleKey: "interludes",
			descriptionKey: "interludesDescription",
			controls: [
				{ type: "toggle", id: "show-interludes", key: "showInterludes", labelKey: "showInterludes", refresh: true },
				{
					type: "select",
					id: "interlude-style",
					key: "interludeStyle",
					labelKey: "interludeStyle",
					optionGroup: "interlude",
					options: ["frame", "dots", "wave"],
					disabledReason: interludeStyleDisabledReason,
				},
			],
		},
	],
	appearance: [
		{
			id: "appearance-background",
			titleKey: "background",
			descriptionKey: "backgroundDescription",
			controls: [
				{
					type: "toggle",
					id: "background-enabled",
					key: "backgroundEnabled",
					labelKey: "showBackground",
					descriptionKey: "showBackgroundDescription",
				},
				{ type: "range", id: "background-blur", key: "backgroundBlurPx", labelKey: "blur" },
				{ type: "range", id: "background-dim", key: "backgroundDim", labelKey: "dim" },
				{ type: "range", id: "background-saturation", key: "backgroundSaturation", labelKey: "saturation" },
				{ type: "range", id: "vignette", key: "vignetteStrength", labelKey: "vignette" },
			],
		},
		{
			id: "appearance-highlight",
			titleKey: "highlighting",
			descriptionKey: "highlightingDescription",
			controls: [
				{
					type: "select",
					id: "highlight-effect",
					key: "highlightEffect",
					labelKey: "highlightEffect",
					optionGroup: "highlightEffect",
					options: ["fill", "glow-sweep", "underline", "marker", "outline-fill", "spotlight"],
					refresh: true,
				},
				{
					type: "select",
					id: "highlight-motion",
					key: "highlightMotion",
					labelKey: "highlightMotion",
					optionGroup: "highlightMotion",
					options: ["spring", "pulse", "bounce", "elastic", "wave", "ripple"],
					refresh: true,
				},
			],
			customId: "highlightPreview",
		},
		{
			id: "appearance-readability",
			titleKey: "readability",
			descriptionKey: "readabilityDescription",
			controls: [
				{
					type: "select",
					id: "font-family",
					key: "fontFamily",
					labelKey: "fontFamily",
					optionGroup: "fontFamily",
					options: FONT_FAMILY_OPTIONS,
					descriptionKey: "fontFamilyDescription",
				},
				{ type: "range", id: "font-scale", key: "fontScale", labelKey: "fontScale" },
				{ type: "range", id: "inactive-blur", key: "inactiveBlurPx", labelKey: "inactiveBlur" },
			],
		},
	],
	motion: [
		{
			id: "motion-animation",
			titleKey: "animations",
			descriptionKey: "animationsDescription",
			controls: [
				{ type: "toggle", id: "motion-enabled", key: "motionEnabled", labelKey: "animations", refresh: true },
				{ type: "toggle", id: "reduce-motion", key: "reduceMotion", labelKey: "reduceMotion", refresh: true },
				{ type: "range", id: "motion-intensity", key: "motionIntensity", labelKey: "intensity", disabledReason: motionDisabledReason },
				{ type: "range", id: "spring-softness", key: "springSoftness", labelKey: "springSoftness", disabledReason: motionDisabledReason },
			],
		},
		{
			id: "motion-emphasis",
			titleKey: "emphasis",
			descriptionKey: "emphasisDescription",
			controls: [{ type: "range", id: "glow-strength", key: "glowStrength", labelKey: "glow" }],
		},
	],
	advanced: [
		{
			id: "advanced-diagnostics",
			titleKey: "diagnostics",
			descriptionKey: "diagnosticsDescription",
			controls: [{ type: "toggle", id: "debug-mode", key: "debugMode", labelKey: "debugMode" }],
		},
		{
			id: "advanced-maintenance",
			titleKey: "maintenance",
			descriptionKey: "maintenanceDescription",
			controls: [],
			customId: "maintenanceActions",
		},
		{
			id: "advanced-reset",
			titleKey: "reset",
			descriptionKey: "resetDescription",
			controls: [],
			customId: "resetConfirmation",
		},
	],
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
		if (section === "providers") {
			const language = settings.language;
			const groups = this.providerPanel.render(settings);
			return [
				this.group("providers-priority", "priority", "priorityDescription", language, groups.priority),
				this.group("providers-auth", "authentication", "authenticationDescription", language, groups.authentication),
				this.group("providers-network", "network", "networkDescription", language, groups.network),
			];
		}
		return SECTION_CONTROLS[section].map((group) => this.renderControlGroup(group, settings));
	}

	private renderControlGroup(spec: ControlGroupSpec, settings: ExtensionSettings): HTMLElement {
		const language = settings.language;
		const children = spec.controls.map((control) => this.renderControl(control, spec, settings));
		if (spec.customId) {
			children.push(...this.renderCustomGroupContent(spec.customId, settings, language));
		}
		return this.group(spec.id, spec.titleKey, spec.descriptionKey, language, children);
	}

	private renderControl(control: ControlSpec, group: ControlGroupSpec, settings: ExtensionSettings): HTMLElement {
		const language = settings.language;
		const disabledReason = control.disabledReason?.(settings, language);
		const groupDescriptionId = `aura-settings-group-${group.id}-description`;

		if (control.type === "select") {
			const value = settings[control.key] as string;
			return this.controls.select(
				control.id,
				translate(control.labelKey, language),
				value,
				control.options as string[],
				(nextValue) => {
					const result = control.apply
						? control.apply(this.store, nextValue)
						: this.store.updateWithResult({ [control.key]: nextValue } as Partial<ExtensionSettings>);
					if (control.refreshNavigation) {
						this.callbacks.onScheduleRefresh(true);
					} else if (control.refresh) {
						this.callbacks.onScheduleRefresh();
					}
					return result.persisted;
				},
				(optionValue) => this.optionLabel(control.optionGroup, optionValue, language),
				{ description: translate(control.descriptionKey ?? group.descriptionKey, language), disabledReason, groupDescriptionId }
			);
		}

		if (control.type === "toggle") {
			const value = settings[control.key] as boolean;
			return this.controls.toggle(
				control.id,
				translate(control.labelKey, language),
				value,
				(nextValue) => {
					const result = this.store.updateWithResult({ [control.key]: nextValue } as Partial<ExtensionSettings>);
					if (control.refresh) {
						this.callbacks.onScheduleRefresh();
					}
					return result.persisted;
				},
				{ description: translate(control.descriptionKey ?? group.descriptionKey, language), disabledReason, groupDescriptionId }
			);
		}

		const spec = NUMERIC_SETTING_SPECS[control.key];
		const value = settings[control.key] as number;
		return this.controls.range(
			control.id,
			translate(control.labelKey, language),
			value,
			spec,
			(next) => this.formatNumeric(next, spec, language),
			(next) => {
				this.store.preview({ [control.key]: next } as Partial<ExtensionSettings>);
				return this.store.get()[control.key] as number;
			},
			{ disabledReason, groupDescriptionId }
		);
	}

	private renderCustomGroupContent(id: CustomGroupId, settings: ExtensionSettings, language: UiLanguage): HTMLElement[] {
		switch (id) {
			case "currentTrackDelay":
				return [this.currentTrackDelayCard(settings)];
			case "highlightPreview":
				return [this.highlightPreview(settings)];
			case "maintenanceActions":
				return this.maintenanceActions(language);
			case "resetConfirmation":
				return [this.resetConfirmation(language)];
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
		// Escape-hatch controls (bespoke buttons, the provider panel) aren't wired with the group's
		// description id at construction, so keep this as a fallback. It's dedup-safe: controls that
		// already carry the id (via ControlPresentation.groupDescriptionId, wired in renderControl)
		// are skipped rather than getting the id appended twice.
		for (const control of Array.from(section.querySelectorAll<HTMLElement>("input, select, button"))) {
			const current = control.getAttribute("aria-describedby");
			if (current?.split(" ").includes(description.id)) {
				continue;
			}
			control.setAttribute("aria-describedby", current ? `${current} ${description.id}` : description.id);
		}
		return section;
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

	private highlightPreview(settings: ExtensionSettings): HTMLElement {
		const preview = this.ownerDocument.createElement("div");
		preview.className = "highlight-preview";
		preview.dataset.effect = settings.highlightEffect;
		preview.dataset.motion = settings.highlightMotion;
		preview.classList.toggle("is-reduced", settings.reduceMotion || !settings.motionEnabled);
		preview.setAttribute("role", "img");
		preview.setAttribute("aria-label", translate("highlightPreview", settings.language));
		const words = settings.language === "ko" ? ["빛나는", "가사"] : settings.language === "ja" ? ["輝く", "歌詞"] : ["Shining", "lyrics"];
		for (const [index, word] of words.entries()) {
			const motion = this.ownerDocument.createElement("span");
			motion.className = "highlight-preview-motion";
			motion.style.setProperty("--preview-delay", `${index * 0.18}s`);
			const token = this.ownerDocument.createElement("span");
			token.className = "highlight-preview-token";
			token.textContent = word;
			motion.append(token);
			preview.append(motion);
		}
		const hidden = this.ownerDocument.createElement("span");
		hidden.className = "visually-hidden";
		hidden.textContent = translate("highlightPreviewText", settings.language);
		preview.append(hidden);
		return preview;
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
		value.setAttribute("aria-label", formatTranslation("currentTrackDelayAppliedValue", { amount: formatDelayMs(state.delayMs) }, language));
		value.textContent = `${formatDelayMs(state.delayMs)} ms`;
		const source = this.ownerDocument.createElement("span");
		source.className = "track-delay-source";
		source.textContent = formatTranslation(
			state.hasOverride ? "currentTrackDelayOverrideSource" : "currentTrackDelayDefaultSource",
			{ amount: formatDelayMs(state.defaultDelayMs) },
			language
		);
		valueGroup.append(value, source);
		header.append(metadata, valueGroup);

		const hint = this.ownerDocument.createElement("p");
		hint.className = "track-delay-hint";
		hint.textContent = translate("currentTrackDelayHint", language);
		const actions = this.ownerDocument.createElement("div");
		actions.className = "track-delay-actions";
		for (const step of [-100, -50, 50, 100]) {
			const stepLabel = formatDelayMs(step);
			const direction = translate(step < 0 ? "currentTrackDelayEarlier" : "currentTrackDelayLater", language);
			const adjustmentLabel = formatTranslation("currentTrackDelayAdjust", { amount: stepLabel, direction }, language);
			const button = this.controls.button(`track-delay-${step < 0 ? "minus" : "plus"}-${Math.abs(step)}`, `${stepLabel} ms`, () => {
				const persisted = this.callbacks.onAdjustCurrentTrackLyricsDelay(state.uri, step);
				this.reportPersistence(persisted);
				if (persisted) {
					this.callbacks.onScheduleRefresh();
				}
			});
			button.classList.add("track-delay-step");
			button.setAttribute("aria-label", adjustmentLabel);
			button.title = adjustmentLabel;
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

	private optionLabel(group: Parameters<typeof translatedOptionLabel>[0], value: string, language: UiLanguage): string {
		return translatedOptionLabel(group, value, language);
	}
}

const formatDelayMs = (value: number): string => (value > 0 ? `+${value}` : String(value));
