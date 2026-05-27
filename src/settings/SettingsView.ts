import type { LyricsProvider } from "../lyrics/types";
import { type ExtensionSettings, PRESETS, type SettingsStore, type UiLanguage } from "./SettingsStore";
import { settingsStyles } from "./settingsStyles";
import { formatTranslation, type TranslationKey, translate, translatedOptionLabel } from "./settingsTranslations";

type SettingsCallbacks = {
	onRefreshLyrics(): void;
	onClearCache(): void;
	onRefreshMusixmatchToken(): Promise<string | undefined>;
};

export class SettingsView {
	private container?: HTMLDivElement;
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
		this.container = document.createElement("div");
		this.container.className = "aura-lyrics-settings";
		document.body.classList.add("aura-lyrics-settings-open");
		this.render();
		spicetify.PopupModal.display({
			title: "AuraLyrics",
			content: this.container,
		});
		const observer = new MutationObserver(() => {
			if (this.container?.isConnected) {
				return;
			}
			document.body.classList.remove("aura-lyrics-settings-open");
			observer.disconnect();
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	private render(): void {
		if (!this.container) {
			return;
		}
		const settings = this.store.get();
		const language = settings.language;
		const t = (key: TranslationKey): string => this.t(key, language);
		this.container.replaceChildren(
			this.styles(),
			this.hero(language),
			this.section(t("general"), [
				this.select(
					t("language"),
					settings.language,
					["en", "ko", "ja"],
					(value) => this.update({ language: value as UiLanguage }),
					(value) => this.optionLabel("language", value, language)
				),
				this.select(
					t("preset"),
					settings.preset,
					Object.keys(PRESETS).concat("custom"),
					(value) => {
						if (value === "custom") {
							this.store.update({ preset: "custom" }, false);
						} else {
							this.store.applyPreset(value as Exclude<ExtensionSettings["preset"], "custom">);
						}
						this.render();
					},
					(value) => this.optionLabel("preset", value, language)
				),
				this.number(t("lyricsDelay"), settings.lyricsDelayMs, (value) => this.update({ lyricsDelayMs: value })),
				this.range(t("fontScale"), settings.fontScale, 0.72, 1.5, 0.01, (value) => this.update({ fontScale: value })),
			]),
			this.section(t("background"), [
				this.number(t("blur"), settings.backgroundBlurPx, (value) => this.update({ backgroundBlurPx: value })),
				this.range(t("dim"), settings.backgroundDim, 0, 1, 0.05, (value) => this.update({ backgroundDim: value })),
				this.range(t("saturation"), settings.backgroundSaturation, 0, 2, 0.05, (value) => this.update({ backgroundSaturation: value })),
				this.range(t("vignette"), settings.vignetteStrength, 0, 1, 0.05, (value) => this.update({ vignetteStrength: value })),
				this.range(t("inactiveBlur"), settings.inactiveBlurPx, 0, 2, 0.05, (value) => this.update({ inactiveBlurPx: value })),
			]),
			this.section(t("lyrics"), [
				this.select(
					t("sync"),
					settings.syncPreference,
					["prefer-syllable", "line-only"],
					(value) => this.update({ syncPreference: value as ExtensionSettings["syncPreference"] }),
					(value) => this.optionLabel("sync", value, language)
				),
				this.select(
					t("alignment"),
					settings.alignmentMode,
					["natural", "center", "left"],
					(value) => this.update({ alignmentMode: value as ExtensionSettings["alignmentMode"] }),
					(value) => this.optionLabel("alignment", value, language)
				),
				this.number(t("contextLines"), settings.visibleContextLines, (value) => this.update({ visibleContextLines: value })),
				this.toggle(t("showInterludes"), settings.showInterludes, (value) => this.update({ showInterludes: value })),
				this.select(
					t("interludeStyle"),
					settings.interludeStyle,
					["frame", "dots", "wave"],
					(value) => this.update({ interludeStyle: value as ExtensionSettings["interludeStyle"] }),
					(value) => this.optionLabel("interlude", value, language)
				),
			]),
			this.section(t("motion"), [
				this.toggle(t("animations"), settings.motionEnabled, (value) => this.update({ motionEnabled: value })),
				this.range(t("intensity"), settings.motionIntensity, 0, 1.5, 0.05, (value) => this.update({ motionIntensity: value })),
				this.range(t("glow"), settings.glowStrength, 0, 1, 0.05, (value) => this.update({ glowStrength: value })),
				this.toggle(t("reduceMotion"), settings.reduceMotion, (value) => this.update({ reduceMotion: value })),
			]),
			this.section(t("providers"), this.providerControls(settings)),
			this.section(t("advanced"), [
				this.toggle(t("debugMode"), settings.debugMode, (value) => this.update({ debugMode: value })),
				this.button(t("refreshCurrentLyrics"), this.callbacks.onRefreshLyrics),
				this.button(t("clearCache"), this.callbacks.onClearCache),
				this.button(t("resetSettings"), () => {
					this.store.reset();
					this.render();
				}),
			])
		);
	}

	private hero(language: UiLanguage): HTMLElement {
		const hero = document.createElement("div");
		hero.className = "settings-hero";
		const eyebrow = document.createElement("span");
		eyebrow.className = "settings-eyebrow";
		eyebrow.textContent = this.t("heroEyebrow", language);
		const title = document.createElement("strong");
		title.textContent = this.t("heroTitle", language);
		const detail = document.createElement("p");
		detail.textContent = this.t("heroDetail", language);
		hero.append(eyebrow, title, detail);
		return hero;
	}

	private providerControls(settings: ExtensionSettings): HTMLElement[] {
		const language = settings.language;
		const rows: HTMLElement[] = [];
		for (const [index, provider] of settings.providers.order.entries()) {
			rows.push(this.providerRow(settings, provider, index));
		}
		rows.push(
			this.input(this.t("musixmatchToken", language), settings.providers.musixmatchToken ?? "", (value) => {
				this.update({ providers: { ...this.store.get().providers, musixmatchToken: value || undefined } });
			})
		);
		rows.push(this.button(this.t("generateMusixmatchToken", language), () => void this.refreshMusixmatchToken()));
		if (this.tokenStatus) {
			rows.push(this.text("key" in this.tokenStatus ? this.t(this.tokenStatus.key, language) : this.tokenStatus.text));
		}
		rows.push(this.text(this.format("providerOrder", { order: settings.providers.order.join(" -> ") }, language)));
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
		enabled.addEventListener("change", () => {
			this.update({ providers: { ...this.store.get().providers, enabled: { ...this.store.get().providers.enabled, [provider]: enabled.checked } } });
		});
		const up = this.iconButton("↑", this.format("moveUp", { provider }, settings.language), () => this.moveProvider(provider, -1));
		up.dataset.providerId = provider;
		up.dataset.providerDirection = "up";
		up.disabled = index === 0;
		const down = this.iconButton("↓", this.format("moveDown", { provider }, settings.language), () => this.moveProvider(provider, 1));
		down.dataset.providerId = provider;
		down.dataset.providerDirection = "down";
		down.disabled = index === settings.providers.order.length - 1;
		controls.append(enabled, up, down);
		row.append(label, controls);
		return row;
	}

	private section(title: string, children: HTMLElement[]): HTMLElement {
		const section = document.createElement("section");
		const header = document.createElement("h3");
		header.textContent = title;
		section.append(header, ...children);
		return section;
	}

	private select(
		label: string,
		value: string,
		options: string[],
		onChange: (value: string) => void,
		optionLabel = (option: string): string => option
	): HTMLElement {
		const select = document.createElement("select");
		for (const option of options) {
			const el = document.createElement("option");
			el.value = option;
			el.textContent = optionLabel(option);
			el.selected = option === value;
			select.append(el);
		}
		select.addEventListener("change", () => onChange(select.value));
		return this.row(label, select);
	}

	private number(label: string, value: number, onChange: (value: number) => void): HTMLElement {
		const input = document.createElement("input");
		input.type = "number";
		input.value = String(value);
		input.addEventListener("change", () => onChange(Number(input.value)));
		return this.row(label, input);
	}

	private range(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
		const input = document.createElement("input");
		input.type = "range";
		input.min = String(min);
		input.max = String(max);
		input.step = String(step);
		input.value = String(value);
		input.addEventListener("input", () => onChange(Number(input.value)));
		return this.row(label, input);
	}

	private input(label: string, value: string, onChange: (value: string) => void): HTMLElement {
		const input = document.createElement("input");
		input.type = "text";
		input.value = value;
		input.addEventListener("change", () => onChange(input.value));
		return this.row(label, input);
	}

	private toggle(label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = value;
		input.addEventListener("change", () => onChange(input.checked));
		return this.row(label, input);
	}

	private button(label: string, onClick: () => void): HTMLElement {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.addEventListener("click", onClick);
		return button;
	}

	private iconButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "icon-button";
		button.textContent = label;
		button.title = title;
		button.setAttribute("aria-label", title);
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

	private row(label: string, control: HTMLElement): HTMLElement {
		const row = document.createElement("label");
		row.className = "setting-row";
		const span = document.createElement("span");
		span.textContent = label;
		row.append(span, control);
		return row;
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

	private update(patch: Partial<ExtensionSettings>): void {
		this.store.update(patch);
		this.render();
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
		window.setTimeout(() => this.render(), 0);
	}

	private providerLabel(provider: ExtensionSettings["providers"]["order"][number]): string {
		return this.providers.find((item) => item.id === provider)?.id ?? provider;
	}

	private async refreshMusixmatchToken(): Promise<void> {
		this.tokenStatus = { key: "requestingToken" };
		this.render();
		try {
			const token = await this.callbacks.onRefreshMusixmatchToken();
			if (!token) {
				this.tokenStatus = { key: "tokenMissing" };
				this.render();
				return;
			}
			this.store.update({ providers: { ...this.store.get().providers, musixmatchToken: token } });
			this.tokenStatus = { key: "tokenUpdated" };
		} catch (error) {
			this.tokenStatus = { text: error instanceof Error ? error.message : String(error) };
		}
		this.render();
	}

	private styles(): HTMLStyleElement {
		const style = document.createElement("style");
		style.textContent = settingsStyles;
		return style;
	}
}
