import type { LyricsProvider } from "../lyrics/types";
import { type ExtensionSettings, PRESETS, type SettingsStore, type UiLanguage } from "./SettingsStore";
import { createSettingsIcon, type SettingsIconName } from "./settingsIcons";
import { settingsStyles } from "./settingsStyles";
import { formatTranslation, type TranslationKey, translate, translatedOptionLabel } from "./settingsTranslations";

type SettingsCallbacks = {
	onRefreshLyrics(): void;
	onClearCache(): void;
	onRefreshMusixmatchToken(): Promise<string | undefined>;
};

type SettingsSection = "advanced" | "appearance" | "general" | "lyrics" | "motion" | "providers";

type PanelState = {
	controlId?: string;
	scrollTop: number;
	selectionEnd?: number | null;
	selectionStart?: number | null;
};

const SETTINGS_SECTIONS: Array<{ icon: SettingsIconName; id: SettingsSection; label: TranslationKey }> = [
	{ id: "general", icon: "general", label: "general" },
	{ id: "lyrics", icon: "lyrics", label: "lyrics" },
	{ id: "appearance", icon: "appearance", label: "appearance" },
	{ id: "motion", icon: "motion", label: "motion" },
	{ id: "providers", icon: "providers", label: "providers" },
	{ id: "advanced", icon: "advanced", label: "advanced" },
];

export class SettingsView {
	private activeSection: SettingsSection = "general";
	private attachGuardTimer?: number;
	private compactNavigation = false;
	private container?: HTMLDivElement;
	private mediaListener?: (event: MediaQueryListEvent) => void;
	private mediaQuery?: MediaQueryList;
	private musixmatchTokenInput?: HTMLInputElement;
	private modalFocusScope?: HTMLElement;
	private navigation?: HTMLElement;
	private observer?: MutationObserver;
	private panelScroller?: HTMLDivElement;
	private previousFocus?: HTMLElement;
	private providerStatus?: HTMLElement;
	private refreshTimer?: number;
	private tokenStatus?: { key: TranslationKey } | { text: string };

	public constructor(
		private readonly store: SettingsStore,
		private readonly providers: LyricsProvider[],
		private readonly callbacks: SettingsCallbacks
	) {}

	public open(): void {
		const spicetify = window.Spicetify;
		if (!spicetify?.PopupModal) {
			return;
		}
		const previousFocus = this.container ? this.previousFocus : this.focusedElement();
		this.cleanupLifecycle(true);
		this.previousFocus = previousFocus;
		const container = document.createElement("div");
		container.className = "aura-lyrics-settings";
		this.container = container;
		this.mountShell();
		document.body.classList.add("aura-lyrics-settings-open");
		spicetify.PopupModal.display({
			title: "AuraLyrics",
			content: container,
		});
		this.attachResponsiveNavigation();
		if (container.isConnected) {
			this.onContainerAttached(container);
		}

		let wasConnected = container.isConnected;
		const observer = new MutationObserver(() => {
			if (this.observer !== observer) {
				return;
			}
			if (container.isConnected) {
				if (!wasConnected) {
					this.onContainerAttached(container);
				}
				wasConnected = true;
				this.clearAttachGuardTimer();
				return;
			}
			if (!wasConnected) {
				return;
			}
			this.cleanupDetachedContainer(container, observer);
		});
		this.observer = observer;
		observer.observe(document.body, { childList: true, subtree: true });
		if (!wasConnected) {
			this.attachGuardTimer = window.setTimeout(() => {
				this.attachGuardTimer = undefined;
				if (this.observer !== observer) {
					return;
				}
				if (container.isConnected) {
					wasConnected = true;
					this.onContainerAttached(container);
					return;
				}
				this.cleanupDetachedContainer(container, observer);
			}, 0);
		}
	}

	public destroy(): void {
		const shouldHideModal = this.container?.isConnected === true;
		const shouldRestoreFocus = this.shouldRestorePreviousFocus(this.container);
		this.cleanupLifecycle(true);
		if (shouldHideModal) {
			window.Spicetify?.PopupModal?.hide?.();
		}
		this.restorePreviousFocus(shouldRestoreFocus);
	}

	private mountShell(): void {
		if (!this.container) {
			return;
		}
		const layout = document.createElement("div");
		layout.className = "settings-layout";
		const navigation = document.createElement("nav");
		navigation.className = "settings-navigation";
		navigation.setAttribute("role", "tablist");
		navigation.setAttribute("aria-label", this.t("settingsNavigation"));
		this.navigation = navigation;
		for (const section of SETTINGS_SECTIONS) {
			navigation.append(this.navigationTab(section));
		}

		const panelScroller = document.createElement("div");
		panelScroller.className = "settings-panel-scroll";
		this.panelScroller = panelScroller;
		layout.append(navigation, panelScroller);
		this.container.replaceChildren(this.styles(), layout);
		this.syncNavigation();
		this.renderActivePanel();
	}

	private navigationTab(section: (typeof SETTINGS_SECTIONS)[number]): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "settings-tab";
		button.id = this.tabId(section.id);
		button.dataset.section = section.id;
		button.setAttribute("role", "tab");
		const label = document.createElement("span");
		label.className = "settings-tab-label";
		label.textContent = this.t(section.label);
		button.append(createSettingsIcon(section.icon), label);
		button.addEventListener("click", () => this.activateSection(section.id, false));
		button.addEventListener("keydown", (event) => this.onNavigationKeyDown(event, section.id));
		return button;
	}

	private onNavigationKeyDown(event: KeyboardEvent, section: SettingsSection): void {
		const index = SETTINGS_SECTIONS.findIndex((item) => item.id === section);
		let nextIndex: number | undefined;
		if (event.key === "Home") {
			nextIndex = 0;
		} else if (event.key === "End") {
			nextIndex = SETTINGS_SECTIONS.length - 1;
		} else if ((!this.compactNavigation && event.key === "ArrowDown") || (this.compactNavigation && event.key === "ArrowRight")) {
			nextIndex = (index + 1) % SETTINGS_SECTIONS.length;
		} else if ((!this.compactNavigation && event.key === "ArrowUp") || (this.compactNavigation && event.key === "ArrowLeft")) {
			nextIndex = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
		}
		if (nextIndex === undefined) {
			return;
		}
		event.preventDefault();
		this.activateSection(SETTINGS_SECTIONS[nextIndex].id, true);
	}

	private activateSection(section: SettingsSection, focusTab: boolean): void {
		const changed = section !== this.activeSection;
		this.activeSection = section;
		this.syncNavigation();
		if (changed) {
			this.renderActivePanel();
			if (this.panelScroller) {
				this.panelScroller.scrollTop = 0;
			}
		}
		if (focusTab) {
			this.navigation?.querySelector<HTMLButtonElement>(`[data-section="${section}"]`)?.focus();
		}
	}

	private syncNavigation(): void {
		if (!this.navigation) {
			return;
		}
		this.navigation.setAttribute("aria-orientation", this.compactNavigation ? "horizontal" : "vertical");
		for (const section of SETTINGS_SECTIONS) {
			const button = this.navigation.querySelector<HTMLButtonElement>(`[data-section="${section.id}"]`);
			if (!button) {
				continue;
			}
			const active = section.id === this.activeSection;
			button.setAttribute("aria-selected", String(active));
			button.tabIndex = active ? 0 : -1;
			if (active) {
				button.setAttribute("aria-controls", this.panelId(section.id));
			} else {
				button.removeAttribute("aria-controls");
			}
		}
	}

	private refreshNavigationText(): void {
		if (!this.navigation) {
			return;
		}
		this.navigation.setAttribute("aria-label", this.t("settingsNavigation"));
		for (const section of SETTINGS_SECTIONS) {
			const label = this.navigation.querySelector<HTMLElement>(`[data-section="${section.id}"] .settings-tab-label`);
			if (label) {
				label.textContent = this.t(section.label);
			}
		}
	}

	private renderActivePanel(): void {
		if (!this.panelScroller) {
			return;
		}
		this.providerStatus = undefined;
		this.musixmatchTokenInput = undefined;
		const settings = this.store.get();
		const panel = document.createElement("section");
		panel.className = "settings-panel";
		panel.id = this.panelId(this.activeSection);
		panel.setAttribute("role", "tabpanel");
		panel.setAttribute("aria-labelledby", this.tabId(this.activeSection));
		const heading = document.createElement("h3");
		heading.textContent = this.t(SETTINGS_SECTIONS.find((item) => item.id === this.activeSection)?.label ?? "general", settings.language);
		panel.append(heading, ...this.sectionControls(this.activeSection, settings));
		this.panelScroller.replaceChildren(panel);
	}

	private sectionControls(section: SettingsSection, settings: ExtensionSettings): HTMLElement[] {
		const language = settings.language;
		switch (section) {
			case "general":
				return [
					this.select(
						"language",
						this.t("language", language),
						settings.language,
						["en", "ko", "ja"],
						(value) => {
							this.update({ language: value as UiLanguage });
							this.schedulePanelRefresh(true);
						},
						(value) => this.optionLabel("language", value, language)
					),
					this.select(
						"preset",
						this.t("preset", language),
						settings.preset,
						Object.keys(PRESETS).concat("custom"),
						(value) => {
							if (value === "custom") {
								this.store.update({ preset: "custom" }, false);
							} else {
								this.store.applyPreset(value as Exclude<ExtensionSettings["preset"], "custom">);
							}
							this.schedulePanelRefresh();
						},
						(value) => this.optionLabel("preset", value, language)
					),
				];
			case "lyrics":
				return [
					this.number(
						"lyrics-delay",
						this.t("lyricsDelay", language),
						settings.lyricsDelayMs,
						(value) => this.update({ lyricsDelayMs: value }).lyricsDelayMs
					),
					this.range("font-scale", this.t("fontScale", language), settings.fontScale, 0.72, 1.5, 0.01, (value) => this.preview({ fontScale: value })),
					this.select(
						"sync",
						this.t("sync", language),
						settings.syncPreference,
						["prefer-syllable", "line-only"],
						(value) => this.update({ syncPreference: value as ExtensionSettings["syncPreference"] }),
						(value) => this.optionLabel("sync", value, language)
					),
					this.toggle("pseudo-karaoke", this.t("pseudoKaraoke", language), settings.pseudoKaraoke, (value) => this.update({ pseudoKaraoke: value })),
					this.toggle("show-translation", this.t("showTranslation", language), settings.showTranslation, (value) =>
						this.update({ showTranslation: value })
					),
					this.select(
						"alignment",
						this.t("alignment", language),
						settings.alignmentMode,
						["natural", "center", "left"],
						(value) => this.update({ alignmentMode: value as ExtensionSettings["alignmentMode"] }),
						(value) => this.optionLabel("alignment", value, language)
					),
					this.number(
						"context-lines",
						this.t("contextLines", language),
						settings.visibleContextLines,
						(value) => this.update({ visibleContextLines: value }).visibleContextLines
					),
					this.toggle("show-interludes", this.t("showInterludes", language), settings.showInterludes, (value) =>
						this.update({ showInterludes: value })
					),
					this.select(
						"interlude-style",
						this.t("interludeStyle", language),
						settings.interludeStyle,
						["frame", "dots", "wave"],
						(value) => this.update({ interludeStyle: value as ExtensionSettings["interludeStyle"] }),
						(value) => this.optionLabel("interlude", value, language)
					),
				];
			case "appearance":
				return [
					this.number(
						"background-blur",
						this.t("blur", language),
						settings.backgroundBlurPx,
						(value) => this.update({ backgroundBlurPx: value }).backgroundBlurPx
					),
					this.range("background-dim", this.t("dim", language), settings.backgroundDim, 0, 1, 0.05, (value) =>
						this.preview({ backgroundDim: value })
					),
					this.range("background-saturation", this.t("saturation", language), settings.backgroundSaturation, 0, 2, 0.05, (value) =>
						this.preview({ backgroundSaturation: value })
					),
					this.range("vignette", this.t("vignette", language), settings.vignetteStrength, 0, 1, 0.05, (value) =>
						this.preview({ vignetteStrength: value })
					),
					this.range("inactive-blur", this.t("inactiveBlur", language), settings.inactiveBlurPx, 0, 2, 0.05, (value) =>
						this.preview({ inactiveBlurPx: value })
					),
				];
			case "motion":
				return [
					this.toggle("motion-enabled", this.t("animations", language), settings.motionEnabled, (value) => this.update({ motionEnabled: value })),
					this.range("motion-intensity", this.t("intensity", language), settings.motionIntensity, 0, 1.5, 0.05, (value) =>
						this.preview({ motionIntensity: value })
					),
					this.range("glow-strength", this.t("glow", language), settings.glowStrength, 0, 1, 0.05, (value) => this.preview({ glowStrength: value })),
					this.toggle("reduce-motion", this.t("reduceMotion", language), settings.reduceMotion, (value) => this.update({ reduceMotion: value })),
				];
			case "providers":
				return this.providerControls(settings);
			case "advanced":
				return [
					this.toggle("debug-mode", this.t("debugMode", language), settings.debugMode, (value) => this.update({ debugMode: value })),
					this.button("refresh-current-lyrics", this.t("refreshCurrentLyrics", language), this.callbacks.onRefreshLyrics),
					this.button("clear-cache", this.t("clearCache", language), this.callbacks.onClearCache),
					this.button("reset-settings", this.t("resetSettings", language), () => {
						this.store.reset();
						this.tokenStatus = undefined;
						this.schedulePanelRefresh(true);
					}),
				];
		}
	}

	private providerControls(settings: ExtensionSettings): HTMLElement[] {
		const language = settings.language;
		const rows: HTMLElement[] = [];
		for (const [index, provider] of settings.providers.order.entries()) {
			rows.push(this.providerRow(settings, provider, index));
		}
		const tokenRow = this.input("musixmatch-token", this.t("musixmatchToken", language), settings.providers.musixmatchToken ?? "", (value) => {
			this.update({ providers: { ...this.store.get().providers, musixmatchToken: value || undefined } });
		});
		this.musixmatchTokenInput = tokenRow.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]') ?? undefined;
		rows.push(tokenRow);
		rows.push(this.button("generate-musixmatch-token", this.t("generateMusixmatchToken", language), () => void this.refreshMusixmatchToken()));
		rows.push(
			this.select(
				"proxy-mode",
				this.t("musixmatchProxyMode", language),
				settings.providers.musixmatchProxyMode,
				["default", "custom"],
				(value) => {
					this.update({
						providers: {
							...this.store.get().providers,
							musixmatchProxyMode: value as ExtensionSettings["providers"]["musixmatchProxyMode"],
						},
					});
					this.schedulePanelRefresh();
				},
				(value) => this.optionLabel("musixmatchProxyMode", value, language)
			)
		);
		rows.push(
			this.text(
				this.t(
					settings.providers.musixmatchProxyMode === "custom" ? "musixmatchProxyModeCustomDescription" : "musixmatchProxyModeDefaultDescription",
					language
				)
			)
		);
		if (settings.providers.musixmatchProxyMode === "custom") {
			rows.push(
				this.input("proxy-url", this.t("musixmatchProxyBaseUrl", language), settings.providers.musixmatchProxyBaseUrl ?? "", (value) => {
					this.update({ providers: { ...this.store.get().providers, musixmatchProxyBaseUrl: value || undefined } });
				})
			);
		}
		const status = this.status(this.tokenStatusText(language));
		this.providerStatus = status;
		rows.push(status);
		rows.push(this.text(this.format("providerOrder", { order: settings.providers.order.join(" → ") }, language)));
		return rows;
	}

	private providerRow(settings: ExtensionSettings, provider: ExtensionSettings["providers"]["order"][number], index: number): HTMLElement {
		const row = document.createElement("div");
		row.className = "setting-row provider-row";
		const label = document.createElement("span");
		label.textContent = this.providerLabel(provider);
		const controls = document.createElement("div");
		controls.className = "provider-controls";
		const enabled = document.createElement("input");
		enabled.type = "checkbox";
		enabled.checked = settings.providers.enabled[provider];
		enabled.dataset.controlId = `provider-enabled-${provider}`;
		enabled.setAttribute("aria-label", this.format("providerEnabled", { provider: this.providerLabel(provider) }, settings.language));
		enabled.addEventListener("change", () => {
			this.update({ providers: { ...this.store.get().providers, enabled: { ...this.store.get().providers.enabled, [provider]: enabled.checked } } });
		});
		const up = this.iconButton(`provider-${provider}-up`, "up", this.format("moveUp", { provider }, settings.language), () =>
			this.moveProvider(provider, -1)
		);
		up.dataset.providerId = provider;
		up.dataset.providerDirection = "up";
		up.disabled = index === 0;
		const down = this.iconButton(`provider-${provider}-down`, "down", this.format("moveDown", { provider }, settings.language), () =>
			this.moveProvider(provider, 1)
		);
		down.dataset.providerId = provider;
		down.dataset.providerDirection = "down";
		down.disabled = index === settings.providers.order.length - 1;
		controls.append(enabled, up, down);
		row.append(label, controls);
		return row;
	}

	private select(
		controlId: string,
		label: string,
		value: string,
		options: string[],
		onChange: (value: string) => void,
		optionLabel = (option: string): string => option
	): HTMLElement {
		const select = document.createElement("select");
		select.dataset.controlId = controlId;
		for (const option of options) {
			const element = document.createElement("option");
			element.value = option;
			element.textContent = optionLabel(option);
			element.selected = option === value;
			select.append(element);
		}
		select.addEventListener("change", () => onChange(select.value));
		return this.row(label, select);
	}

	private number(controlId: string, label: string, value: number, onChange: (value: number) => number): HTMLElement {
		const input = document.createElement("input");
		input.type = "number";
		input.value = String(value);
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => {
			input.value = String(onChange(Number(input.value)));
		});
		return this.row(label, input);
	}

	private range(
		controlId: string,
		label: string,
		value: number,
		min: number,
		max: number,
		step: number,
		onChange: (value: number) => void
	): HTMLElement {
		const input = document.createElement("input");
		input.type = "range";
		input.min = String(min);
		input.max = String(max);
		input.step = String(step);
		input.value = String(value);
		input.dataset.controlId = controlId;
		let dirty = false;
		let previewedValue = value;
		const preview = (): void => {
			const nextValue = Number(input.value);
			if (nextValue === previewedValue) {
				return;
			}
			previewedValue = nextValue;
			dirty = true;
			onChange(nextValue);
		};
		const commit = (): void => {
			preview();
			if (!dirty) {
				return;
			}
			dirty = !this.store.commit();
		};
		input.addEventListener("input", preview);
		input.addEventListener("change", commit);
		input.addEventListener("pointerup", commit);
		return this.row(label, input);
	}

	private input(controlId: string, label: string, value: string, onChange: (value: string) => void): HTMLElement {
		const input = document.createElement("input");
		input.type = "text";
		input.value = value;
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => onChange(input.value));
		return this.row(label, input);
	}

	private toggle(controlId: string, label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = value;
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => onChange(input.checked));
		return this.row(label, input);
	}

	private button(controlId: string, label: string, onClick: () => void): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "settings-action";
		button.dataset.controlId = controlId;
		button.textContent = label;
		button.addEventListener("click", onClick);
		return button;
	}

	private iconButton(controlId: string, icon: "down" | "up", title: string, onClick: () => void): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "icon-button";
		button.dataset.controlId = controlId;
		button.title = title;
		button.setAttribute("aria-label", title);
		button.append(createSettingsIcon(icon));
		for (const eventName of ["pointerdown", "mousedown", "mouseup"] as const) {
			button.addEventListener(eventName, (event) => {
				event.preventDefault();
				event.stopPropagation();
			});
		}
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			onClick();
		});
		return button;
	}

	private text(value: string): HTMLElement {
		const span = document.createElement("span");
		span.className = "muted";
		span.textContent = value;
		return span;
	}

	private status(value: string): HTMLElement {
		const status = this.text(value);
		status.classList.add("settings-status");
		status.setAttribute("role", "status");
		status.setAttribute("aria-live", "polite");
		return status;
	}

	private row(label: string, control: HTMLElement): HTMLElement {
		const row = document.createElement("label");
		row.className = "setting-row";
		const span = document.createElement("span");
		span.textContent = label;
		row.append(span, control);
		return row;
	}

	private update(patch: Partial<ExtensionSettings>): ExtensionSettings {
		return this.store.update(patch);
	}

	private preview(patch: Partial<ExtensionSettings>): ExtensionSettings {
		return this.store.preview(patch);
	}

	private moveProvider(provider: ExtensionSettings["providers"]["order"][number], direction: -1 | 1): void {
		const settings = this.store.get();
		const order = [...settings.providers.order];
		const index = order.indexOf(provider);
		const nextIndex = index + direction;
		if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
			return;
		}
		[order[index], order[nextIndex]] = [order[nextIndex], order[index]];
		this.store.update({ providers: { ...settings.providers, order } });
		this.schedulePanelRefresh();
	}

	private providerLabel(provider: ExtensionSettings["providers"]["order"][number]): string {
		return this.providers.find((item) => item.id === provider)?.id ?? provider;
	}

	private async refreshMusixmatchToken(): Promise<void> {
		this.tokenStatus = { key: "requestingToken" };
		this.updateTokenStatus();
		try {
			const token = await this.callbacks.onRefreshMusixmatchToken();
			if (!token) {
				this.tokenStatus = { key: "tokenMissing" };
				this.updateTokenStatus();
				return;
			}
			this.store.update({ providers: { ...this.store.get().providers, musixmatchToken: token } });
			this.patchMusixmatchTokenInput(token);
			this.tokenStatus = { key: "tokenUpdated" };
		} catch (error) {
			this.tokenStatus = { text: error instanceof Error ? error.message : String(error) };
		}
		this.updateTokenStatus();
	}

	private updateTokenStatus(): void {
		if (this.providerStatus) {
			this.providerStatus.textContent = this.tokenStatusText(this.store.get().language);
		}
	}

	private tokenStatusText(language: UiLanguage): string {
		if (!this.tokenStatus) {
			return "";
		}
		return "key" in this.tokenStatus ? this.t(this.tokenStatus.key, language) : this.tokenStatus.text;
	}

	private patchMusixmatchTokenInput(token: string): void {
		const input = this.musixmatchTokenInput;
		if (!input) {
			return;
		}
		const selectionStart = input.selectionStart;
		const selectionEnd = input.selectionEnd;
		input.value = token;
		if (document.activeElement === input && selectionStart != null && selectionEnd != null) {
			input.setSelectionRange(Math.min(selectionStart, token.length), Math.min(selectionEnd, token.length));
		}
	}

	private schedulePanelRefresh(refreshNavigation = false): void {
		const state = this.capturePanelState();
		this.clearRefreshTimer();
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = undefined;
			if (!this.container || !this.panelScroller) {
				return;
			}
			if (refreshNavigation) {
				this.refreshNavigationText();
			}
			this.renderActivePanel();
			this.restorePanelState(state);
		}, 0);
	}

	private capturePanelState(): PanelState {
		const state: PanelState = { scrollTop: this.panelScroller?.scrollTop ?? 0 };
		const active = document.activeElement;
		if (!(active instanceof HTMLElement) || !this.panelScroller?.contains(active)) {
			return state;
		}
		state.controlId = active.dataset.controlId;
		if (active instanceof HTMLInputElement) {
			state.selectionStart = active.selectionStart;
			state.selectionEnd = active.selectionEnd;
		}
		return state;
	}

	private restorePanelState(state: PanelState): void {
		if (!this.panelScroller) {
			return;
		}
		this.panelScroller.scrollTop = state.scrollTop;
		if (!state.controlId) {
			return;
		}
		const control = this.panelScroller.querySelector<HTMLElement>(`[data-control-id="${state.controlId}"]`);
		if (control instanceof HTMLButtonElement && control.disabled) {
			this.focusNearestReorderControl(control);
		} else if (control) {
			control.focus();
		} else if (state.controlId.startsWith("provider-") && (state.controlId.endsWith("-up") || state.controlId.endsWith("-down"))) {
			this.focusActiveTab();
		}
		if (control instanceof HTMLInputElement && state.selectionStart != null && state.selectionEnd != null) {
			try {
				control.setSelectionRange(state.selectionStart, state.selectionEnd);
			} catch {
				// Number and range inputs do not support a text selection.
			}
		}
	}

	private focusNearestReorderControl(control: HTMLButtonElement): void {
		if (!this.panelScroller) {
			return;
		}
		const controls = Array.from(this.panelScroller.querySelectorAll<HTMLButtonElement>(".icon-button"));
		const index = controls.indexOf(control);
		for (let distance = 1; distance < controls.length; distance += 1) {
			const previous = controls[index - distance];
			if (previous && !previous.disabled) {
				previous.focus();
				return;
			}
			const next = controls[index + distance];
			if (next && !next.disabled) {
				next.focus();
				return;
			}
		}
		this.focusActiveTab();
	}

	private focusActiveTab(): void {
		this.navigation?.querySelector<HTMLButtonElement>(`[data-section="${this.activeSection}"]`)?.focus();
	}

	private onContainerAttached(container: HTMLElement): void {
		this.modalFocusScope = container.closest<HTMLElement>(".main-trackCreditsModal-container") ?? container.parentElement ?? container;
		this.focusActiveTab();
	}

	private focusedElement(): HTMLElement | undefined {
		return document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
	}

	private shouldRestorePreviousFocus(container: HTMLElement | undefined): boolean {
		if (this.hasConnectedReplacementModal()) {
			return false;
		}
		const active = this.focusedElement();
		const focusIsInsideOwnedModal =
			active !== undefined &&
			container?.isConnected === true &&
			this.modalFocusScope?.contains(container) === true &&
			this.modalFocusScope.contains(active);
		return (
			active === document.body ||
			(active !== undefined && !active.isConnected) ||
			(active !== undefined && container?.contains(active) === true) ||
			focusIsInsideOwnedModal
		);
	}

	private hasConnectedReplacementModal(): boolean {
		return Array.from(document.querySelectorAll<HTMLElement>(".main-trackCreditsModal-container")).some(
			(modal) => modal.isConnected && modal !== this.modalFocusScope
		);
	}

	private cleanupDetachedContainer(container: HTMLElement, observer: MutationObserver): void {
		if (this.observer !== observer) {
			return;
		}
		const shouldRestoreFocus = this.shouldRestorePreviousFocus(container);
		observer.disconnect();
		this.observer = undefined;
		this.clearAttachGuardTimer();
		this.clearRefreshTimer();
		this.detachResponsiveNavigation();
		document.body.classList.remove("aura-lyrics-settings-open");
		if (this.container === container) {
			this.container = undefined;
			this.navigation = undefined;
			this.panelScroller = undefined;
			this.providerStatus = undefined;
			this.musixmatchTokenInput = undefined;
			this.modalFocusScope = undefined;
		}
		this.restorePreviousFocus(shouldRestoreFocus);
	}

	private restorePreviousFocus(shouldRestore: boolean): void {
		const previousFocus = this.previousFocus;
		this.previousFocus = undefined;
		if (shouldRestore && previousFocus?.isConnected) {
			previousFocus.focus();
		}
	}

	private attachResponsiveNavigation(): void {
		if (typeof window.matchMedia !== "function") {
			this.compactNavigation = false;
			this.syncNavigation();
			return;
		}
		const mediaQuery = window.matchMedia("(max-width: 680px)");
		const listener = (event: MediaQueryListEvent): void => {
			this.compactNavigation = event.matches;
			this.syncNavigation();
		};
		this.mediaQuery = mediaQuery;
		this.mediaListener = listener;
		this.compactNavigation = mediaQuery.matches;
		this.syncNavigation();
		mediaQuery.addEventListener("change", listener);
	}

	private detachResponsiveNavigation(): void {
		if (this.mediaQuery && this.mediaListener) {
			this.mediaQuery.removeEventListener("change", this.mediaListener);
		}
		this.mediaQuery = undefined;
		this.mediaListener = undefined;
	}

	private cleanupLifecycle(removeContainer: boolean): void {
		this.clearAttachGuardTimer();
		this.clearRefreshTimer();
		this.observer?.disconnect();
		this.observer = undefined;
		this.detachResponsiveNavigation();
		if (removeContainer) {
			this.container?.remove();
		}
		this.container = undefined;
		this.navigation = undefined;
		this.panelScroller = undefined;
		this.providerStatus = undefined;
		this.musixmatchTokenInput = undefined;
		this.modalFocusScope = undefined;
		document.body.classList.remove("aura-lyrics-settings-open");
	}

	private clearAttachGuardTimer(): void {
		if (this.attachGuardTimer !== undefined) {
			window.clearTimeout(this.attachGuardTimer);
			this.attachGuardTimer = undefined;
		}
	}

	private clearRefreshTimer(): void {
		if (this.refreshTimer !== undefined) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	private t(key: TranslationKey, language = this.store.get().language): string {
		return translate(key, language);
	}

	private format(key: TranslationKey, values: Record<string, string>, language = this.store.get().language): string {
		return formatTranslation(key, values, language);
	}

	private optionLabel(group: Parameters<typeof translatedOptionLabel>[0], value: string, language: UiLanguage): string {
		return translatedOptionLabel(group, value, language);
	}

	private tabId(section: SettingsSection): string {
		return `aura-settings-tab-${section}`;
	}

	private panelId(section: SettingsSection): string {
		return `aura-settings-panel-${section}`;
	}

	private styles(): HTMLStyleElement {
		const style = document.createElement("style");
		style.textContent = settingsStyles;
		return style;
	}
}
