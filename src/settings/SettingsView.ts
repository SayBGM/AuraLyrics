import type { LyricsProvider } from "../lyrics/types";
import { type ExtensionSettings, PRESETS, type SettingsStore } from "./SettingsStore";
import { settingsStyles } from "./settingsStyles";

type SettingsCallbacks = {
	onRefreshLyrics(): void;
	onClearCache(): void;
	onRefreshMusixmatchToken(): Promise<string | undefined>;
};

export class SettingsView {
	private container?: HTMLDivElement;
	private tokenStatus?: string;

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
		this.container.replaceChildren(
			this.styles(),
			this.hero(),
			this.section("General", [
				this.select("Preset", settings.preset, Object.keys(PRESETS).concat("custom"), (value) => {
					if (value === "custom") {
						this.store.update({ preset: "custom" }, false);
					} else {
						this.store.applyPreset(value as Exclude<ExtensionSettings["preset"], "custom">);
					}
					this.render();
				}),
				this.number("Lyrics delay (ms)", settings.lyricsDelayMs, (value) => this.update({ lyricsDelayMs: value })),
				this.range("Font scale", settings.fontScale, 0.72, 1.5, 0.01, (value) => this.update({ fontScale: value })),
			]),
			this.section("Background", [
				this.toggle("Album background", settings.backgroundEnabled, (value) => this.update({ backgroundEnabled: value })),
				this.number("Blur", settings.backgroundBlurPx, (value) => this.update({ backgroundBlurPx: value })),
				this.range("Dim", settings.backgroundDim, 0, 1, 0.05, (value) => this.update({ backgroundDim: value })),
				this.range("Saturation", settings.backgroundSaturation, 0, 2, 0.05, (value) => this.update({ backgroundSaturation: value })),
				this.range("Vignette", settings.vignetteStrength, 0, 1, 0.05, (value) => this.update({ vignetteStrength: value })),
				this.range("Inactive blur", settings.inactiveBlurPx, 0, 2, 0.05, (value) => this.update({ inactiveBlurPx: value })),
			]),
			this.section("Lyrics", [
				this.select("Sync", settings.syncPreference, ["prefer-syllable", "line-only"], (value) =>
					this.update({ syncPreference: value as ExtensionSettings["syncPreference"] })
				),
				this.select("Alignment", settings.alignmentMode, ["natural", "center", "left"], (value) =>
					this.update({ alignmentMode: value as ExtensionSettings["alignmentMode"] })
				),
				this.range("Vertical position", settings.lyricsVerticalPosition, 0.32, 0.68, 0.01, (value) => this.update({ lyricsVerticalPosition: value })),
				this.number("Context lines", settings.visibleContextLines, (value) => this.update({ visibleContextLines: value })),
				this.toggle("Show interludes", settings.showInterludes, (value) => this.update({ showInterludes: value })),
			]),
			this.section("Motion", [
				this.toggle("Animations", settings.motionEnabled, (value) => this.update({ motionEnabled: value })),
				this.range("Intensity", settings.motionIntensity, 0, 1.5, 0.05, (value) => this.update({ motionIntensity: value })),
				this.range("Glow", settings.glowStrength, 0, 1, 0.05, (value) => this.update({ glowStrength: value })),
				this.toggle("Reduce motion", settings.reduceMotion, (value) => this.update({ reduceMotion: value })),
			]),
			this.section("Providers", this.providerControls(settings)),
			this.section("Advanced", [
				this.toggle("Debug mode", settings.debugMode, (value) => this.update({ debugMode: value })),
				this.button("Refresh current lyrics", this.callbacks.onRefreshLyrics),
				this.button("Clear cache", this.callbacks.onClearCache),
				this.button("Reset settings", () => {
					this.store.reset();
					this.render();
				}),
			])
		);
	}

	private hero(): HTMLElement {
		const hero = document.createElement("div");
		hero.className = "settings-hero";
		const eyebrow = document.createElement("span");
		eyebrow.className = "settings-eyebrow";
		eyebrow.textContent = "AURALYRICS CONTROL";
		const title = document.createElement("strong");
		title.textContent = "Tune the PiP stage.";
		const detail = document.createElement("p");
		detail.textContent = "Album ambience, lyric sync, motion, and providers in one focused surface.";
		hero.append(eyebrow, title, detail);
		return hero;
	}

	private providerControls(settings: ExtensionSettings): HTMLElement[] {
		const rows: HTMLElement[] = [];
		for (const [index, provider] of settings.providers.order.entries()) {
			rows.push(this.providerRow(settings, provider, index));
		}
		rows.push(
			this.input("Musixmatch token", settings.providers.musixmatchToken ?? "", (value) => {
				this.update({ providers: { ...this.store.get().providers, musixmatchToken: value || undefined } });
			})
		);
		rows.push(this.button("Generate Musixmatch token", () => void this.refreshMusixmatchToken()));
		if (this.tokenStatus) {
			rows.push(this.text(this.tokenStatus));
		}
		rows.push(this.text(`Provider order: ${settings.providers.order.join(" -> ")}`));
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
		const up = this.iconButton("↑", `Move ${provider} up`, () => this.moveProvider(provider, -1));
		up.dataset.providerId = provider;
		up.dataset.providerDirection = "up";
		up.disabled = index === 0;
		const down = this.iconButton("↓", `Move ${provider} down`, () => this.moveProvider(provider, 1));
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

	private select(label: string, value: string, options: string[], onChange: (value: string) => void): HTMLElement {
		const select = document.createElement("select");
		for (const option of options) {
			const el = document.createElement("option");
			el.value = option;
			el.textContent = option;
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
		this.tokenStatus = "Requesting Musixmatch token...";
		this.render();
		try {
			const token = await this.callbacks.onRefreshMusixmatchToken();
			if (!token) {
				this.tokenStatus = "Musixmatch token was not returned.";
				this.render();
				return;
			}
			this.store.update({ providers: { ...this.store.get().providers, musixmatchToken: token } });
			this.tokenStatus = "Musixmatch token updated.";
		} catch (error) {
			this.tokenStatus = error instanceof Error ? error.message : String(error);
		}
		this.render();
	}

	private styles(): HTMLStyleElement {
		const style = document.createElement("style");
		style.textContent = settingsStyles;
		return style;
	}
}
