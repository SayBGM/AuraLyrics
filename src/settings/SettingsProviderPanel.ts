import type { LyricsProvider } from "../lyrics/types";
import type { SettingsControlFactory } from "./SettingsControlFactory";
import type { ExtensionSettings, SettingsStore, UiLanguage } from "./SettingsStore";
import { formatTranslation, type TranslationKey, translate, translatedOptionLabel } from "./settingsTranslations";

type SettingsProviderPanelCallbacks = {
	onRefreshMusixmatchToken(): Promise<string | undefined>;
	onScheduleRefresh(): void;
};

export class SettingsProviderPanel {
	private musixmatchTokenInput?: HTMLInputElement;
	private providerStatus?: HTMLElement;
	private tokenStatus?: { key: TranslationKey } | { text: string };

	public constructor(
		private readonly ownerDocument: Document,
		private readonly store: SettingsStore,
		private readonly providers: LyricsProvider[],
		private readonly controls: SettingsControlFactory,
		private readonly callbacks: SettingsProviderPanelCallbacks
	) {}

	public render(settings: ExtensionSettings): HTMLElement[] {
		this.providerStatus = undefined;
		this.musixmatchTokenInput = undefined;
		const language = settings.language;
		const rows: HTMLElement[] = [];
		for (const [index, provider] of settings.providers.order.entries()) {
			rows.push(this.providerRow(settings, provider, index));
		}
		const tokenRow = this.controls.input(
			"musixmatch-token",
			this.t("musixmatchToken", language),
			settings.providers.musixmatchToken ?? "",
			(value) => {
				this.update({ providers: { ...this.store.get().providers, musixmatchToken: value || undefined } });
			}
		);
		this.musixmatchTokenInput = tokenRow.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]') ?? undefined;
		rows.push(tokenRow);
		rows.push(
			this.controls.button("generate-musixmatch-token", this.t("generateMusixmatchToken", language), () => void this.refreshMusixmatchToken())
		);
		rows.push(
			this.controls.select(
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
					this.callbacks.onScheduleRefresh();
				},
				(value) => translatedOptionLabel("musixmatchProxyMode", value, language)
			)
		);
		rows.push(
			this.controls.text(
				this.t(
					settings.providers.musixmatchProxyMode === "custom" ? "musixmatchProxyModeCustomDescription" : "musixmatchProxyModeDefaultDescription",
					language
				)
			)
		);
		if (settings.providers.musixmatchProxyMode === "custom") {
			rows.push(
				this.controls.input("proxy-url", this.t("musixmatchProxyBaseUrl", language), settings.providers.musixmatchProxyBaseUrl ?? "", (value) => {
					this.update({ providers: { ...this.store.get().providers, musixmatchProxyBaseUrl: value || undefined } });
				})
			);
		}
		const status = this.controls.status(this.tokenStatusText(language));
		this.providerStatus = status;
		rows.push(status);
		rows.push(this.controls.text(this.format("providerOrder", { order: settings.providers.order.join(" → ") }, language)));
		return rows;
	}

	public clearTokenStatus(): void {
		this.tokenStatus = undefined;
		this.updateTokenStatus();
	}

	private providerRow(settings: ExtensionSettings, provider: ExtensionSettings["providers"]["order"][number], index: number): HTMLElement {
		const row = this.ownerDocument.createElement("div");
		row.className = "setting-row provider-row";
		const label = this.ownerDocument.createElement("span");
		label.textContent = this.providerLabel(provider);
		const controls = this.ownerDocument.createElement("div");
		controls.className = "provider-controls";
		const enabled = this.ownerDocument.createElement("input");
		enabled.type = "checkbox";
		enabled.checked = settings.providers.enabled[provider];
		enabled.dataset.controlId = `provider-enabled-${provider}`;
		enabled.setAttribute("aria-label", this.format("providerEnabled", { provider: this.providerLabel(provider) }, settings.language));
		enabled.addEventListener("change", () => {
			this.update({ providers: { ...this.store.get().providers, enabled: { ...this.store.get().providers.enabled, [provider]: enabled.checked } } });
		});
		const up = this.controls.iconButton(`provider-${provider}-up`, "up", this.format("moveUp", { provider }, settings.language), () =>
			this.moveProvider(provider, -1)
		);
		up.dataset.providerId = provider;
		up.dataset.providerDirection = "up";
		up.disabled = index === 0;
		const down = this.controls.iconButton(`provider-${provider}-down`, "down", this.format("moveDown", { provider }, settings.language), () =>
			this.moveProvider(provider, 1)
		);
		down.dataset.providerId = provider;
		down.dataset.providerDirection = "down";
		down.disabled = index === settings.providers.order.length - 1;
		controls.append(enabled, up, down);
		row.append(label, controls);
		return row;
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
		this.update({ providers: { ...settings.providers, order } });
		this.callbacks.onScheduleRefresh();
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
		if (this.ownerDocument.activeElement === input && selectionStart != null && selectionEnd != null) {
			input.setSelectionRange(Math.min(selectionStart, token.length), Math.min(selectionEnd, token.length));
		}
	}

	private providerLabel(provider: ExtensionSettings["providers"]["order"][number]): string {
		return this.providers.find((item) => item.id === provider)?.id ?? provider;
	}

	private update(patch: Partial<ExtensionSettings>): ExtensionSettings {
		return this.store.update(patch);
	}

	private t(key: TranslationKey, language: UiLanguage): string {
		return translate(key, language);
	}

	private format(key: TranslationKey, values: Record<string, string>, language: UiLanguage): string {
		return formatTranslation(key, values, language);
	}
}
