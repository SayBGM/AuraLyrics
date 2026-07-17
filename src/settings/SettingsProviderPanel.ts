import type { LyricsProvider } from "../lyrics/types";
import { providerDisplayName } from "../shared/providerDisplayNames";
import type { SettingsControlFactory } from "./SettingsControlFactory";
import type { ExtensionSettings, SettingsStore, SettingsUpdateResult, UiLanguage } from "./SettingsStore";
import { formatTranslation, translate, translatedOptionLabel } from "./settingsTranslations";
import type { SettingsFeedbackState } from "./settingsViewTypes";

type SettingsProviderPanelCallbacks = {
	onFeedback?(state: SettingsFeedbackState, text: string, durationMs?: number): void;
	onMusixmatchTokenAccepted(token: string): void;
	onRefreshMusixmatchToken(): Promise<string | undefined>;
	onScheduleRefresh(): void;
};

export type SettingsProviderGroups = HTMLElement[] & {
	authentication: HTMLElement[];
	network: HTMLElement[];
	priority: HTMLElement[];
};

export class SettingsProviderPanel {
	private activeTokenRequest?: number;
	private musixmatchTokenInput?: HTMLInputElement;
	private providerAnnouncement?: HTMLElement;
	private tokenRequestButton?: HTMLButtonElement;
	private tokenRequestGeneration = 0;

	public constructor(
		private readonly ownerDocument: Document,
		private readonly store: SettingsStore,
		private readonly providers: LyricsProvider[],
		private readonly controls: SettingsControlFactory,
		private readonly callbacks: SettingsProviderPanelCallbacks
	) {}

	public render(settings: ExtensionSettings): SettingsProviderGroups {
		this.musixmatchTokenInput = undefined;
		this.providerAnnouncement = undefined;
		this.tokenRequestButton = undefined;
		const language = settings.language;
		const priority = settings.providers.order.map((provider, index) => this.providerRow(settings, provider, index));
		const order = this.ownerDocument.createElement("p");
		order.className = "provider-order-summary";
		order.textContent = formatTranslation("providerOrder", { order: settings.providers.order.map(providerDisplayName).join(" → ") }, language);
		const announcement = this.ownerDocument.createElement("span");
		announcement.className = "visually-hidden provider-order-announcement";
		announcement.setAttribute("aria-live", "polite");
		announcement.setAttribute("aria-atomic", "true");
		this.providerAnnouncement = announcement;
		priority.push(order, announcement);

		const tokenRow = this.controls.input(
			"musixmatch-token",
			translate("musixmatchToken", language),
			settings.providers.musixmatchToken ?? "",
			(value) => this.update({ providers: { ...this.store.get().providers, musixmatchToken: value || undefined } }).persisted,
			() => this.invalidateTokenRequests(),
			{ description: translate("authenticationDescription", language) },
			"password"
		);
		this.enhanceTokenInput(tokenRow, settings.providers.musixmatchToken ?? "", language);
		const generateButton = this.controls.button("generate-musixmatch-token", translate("generateMusixmatchToken", language), () => {
			void this.refreshMusixmatchToken();
		});
		this.tokenRequestButton = generateButton;

		const proxyMode = this.controls.select(
			"proxy-mode",
			translate("musixmatchProxyMode", language),
			settings.providers.musixmatchProxyMode,
			["default", "custom"],
			(value) => {
				const result = this.update({
					providers: {
						...this.store.get().providers,
						musixmatchProxyMode: value as ExtensionSettings["providers"]["musixmatchProxyMode"],
					},
				});
				this.callbacks.onScheduleRefresh();
				return result.persisted;
			},
			(value) => translatedOptionLabel("musixmatchProxyMode", value, language),
			{
				description: translate(
					settings.providers.musixmatchProxyMode === "custom" ? "musixmatchProxyModeCustomDescription" : "musixmatchProxyModeDefaultDescription",
					language
				),
			}
		);
		const network = [proxyMode];
		if (settings.providers.musixmatchProxyMode === "custom") {
			network.push(
				this.controls.input(
					"proxy-url",
					translate("musixmatchProxyBaseUrl", language),
					settings.providers.musixmatchProxyBaseUrl ?? "",
					(value) => this.update({ providers: { ...this.store.get().providers, musixmatchProxyBaseUrl: value || undefined } }).persisted,
					undefined,
					{ description: translate("networkDescription", language) },
					"url"
				)
			);
			const example = this.ownerDocument.createElement("code");
			example.className = "proxy-example";
			example.textContent = translate("musixmatchProxyExample", language);
			network.push(example);
		}
		const authentication = [tokenRow, generateButton];
		return Object.assign([...priority, ...authentication, ...network], { priority, authentication, network });
	}

	public clearTokenStatus(): void {
		this.invalidateTokenRequests();
	}

	public cleanup(): void {
		this.invalidateTokenRequests();
		this.musixmatchTokenInput = undefined;
		this.providerAnnouncement = undefined;
		this.tokenRequestButton = undefined;
	}

	private providerRow(settings: ExtensionSettings, provider: ExtensionSettings["providers"]["order"][number], index: number): HTMLElement {
		const row = this.ownerDocument.createElement("div");
		row.className = "setting-row provider-row";
		const label = this.ownerDocument.createElement("span");
		label.className = "setting-label";
		const providerName = this.providerLabel(provider);
		label.textContent = providerName;
		const controls = this.ownerDocument.createElement("div");
		controls.className = "provider-controls";
		const enabled = this.ownerDocument.createElement("input");
		enabled.type = "checkbox";
		enabled.checked = settings.providers.enabled[provider];
		enabled.dataset.controlId = `provider-enabled-${provider}`;
		enabled.setAttribute("aria-label", formatTranslation("providerEnabled", { provider: providerName }, settings.language));
		enabled.addEventListener("change", () => {
			const result = this.update({
				providers: { ...this.store.get().providers, enabled: { ...this.store.get().providers.enabled, [provider]: enabled.checked } },
			});
			this.reportPersistence(result.persisted, settings.language);
		});
		const up = this.controls.iconButton(
			`provider-${provider}-up`,
			"up",
			formatTranslation("moveUp", { provider: providerName }, settings.language),
			() => this.moveProvider(provider, -1)
		);
		up.dataset.providerId = provider;
		up.dataset.providerDirection = "up";
		up.disabled = index === 0;
		const down = this.controls.iconButton(
			`provider-${provider}-down`,
			"down",
			formatTranslation("moveDown", { provider: providerName }, settings.language),
			() => this.moveProvider(provider, 1)
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
		const result = this.update({ providers: { ...settings.providers, order } });
		if (!result.persisted) {
			this.callbacks.onFeedback?.("error", translate("saveError", settings.language));
			return;
		}
		const message = formatTranslation(
			"providerMoved",
			{ provider: this.providerLabel(provider), position: String(nextIndex + 1) },
			settings.language
		);
		this.providerAnnouncement?.replaceChildren(message);
		this.callbacks.onFeedback?.("success", message, 2500);
		this.callbacks.onScheduleRefresh();
	}

	private enhanceTokenInput(row: HTMLElement, token: string, language: UiLanguage): void {
		const input = row.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');
		if (!input) {
			return;
		}
		this.musixmatchTokenInput = input;
		const wrapper = this.ownerDocument.createElement("span");
		wrapper.className = "token-control";
		input.replaceWith(wrapper);
		wrapper.append(input);
		const visibility = this.controls.button("toggle-musixmatch-token", translate("show", language), () => {
			const showing = input.type === "text";
			input.type = showing ? "password" : "text";
			visibility.textContent = translate(showing ? "show" : "hide", language);
		});
		visibility.classList.add("token-action");
		wrapper.append(visibility);
		const clipboard = this.ownerDocument.defaultView?.navigator.clipboard;
		if (clipboard?.writeText) {
			const copy = this.controls.button("copy-musixmatch-token", translate("copy", language), () => {
				void clipboard
					.writeText(input.value || token)
					.then(() => this.callbacks.onFeedback?.("success", translate("tokenCopied", language), 2500))
					.catch((error: unknown) => this.callbacks.onFeedback?.("error", error instanceof Error ? error.message : String(error)));
			});
			copy.classList.add("token-action");
			wrapper.append(copy);
		}
	}

	private async refreshMusixmatchToken(): Promise<void> {
		const request = ++this.tokenRequestGeneration;
		this.activeTokenRequest = request;
		if (this.tokenRequestButton) {
			this.tokenRequestButton.disabled = true;
		}
		const language = this.store.get().language;
		this.callbacks.onFeedback?.("working", translate("requestingToken", language));
		try {
			const token = await this.callbacks.onRefreshMusixmatchToken();
			if (!this.isCurrentTokenRequest(request)) {
				return;
			}
			if (!token) {
				this.callbacks.onFeedback?.("error", translate("tokenMissing", language));
				return;
			}
			const result = this.store.updateWithResult({ providers: { ...this.store.get().providers, musixmatchToken: token } });
			if (!result.persisted) {
				this.callbacks.onFeedback?.("error", translate("saveError", language));
				return;
			}
			this.patchMusixmatchTokenInput(token);
			this.callbacks.onMusixmatchTokenAccepted(token);
			this.callbacks.onFeedback?.("success", translate("tokenUpdated", language), 2500);
		} catch (error) {
			if (this.isCurrentTokenRequest(request)) {
				this.callbacks.onFeedback?.("error", error instanceof Error ? error.message : String(error));
			}
		} finally {
			if (this.isCurrentTokenRequest(request)) {
				this.activeTokenRequest = undefined;
				if (this.tokenRequestButton) {
					this.tokenRequestButton.disabled = false;
				}
			}
		}
	}

	private isCurrentTokenRequest(request: number): boolean {
		return request === this.tokenRequestGeneration && request === this.activeTokenRequest;
	}

	private invalidateTokenRequests(): void {
		this.tokenRequestGeneration += 1;
		this.activeTokenRequest = undefined;
		if (this.tokenRequestButton) {
			this.tokenRequestButton.disabled = false;
		}
	}

	private patchMusixmatchTokenInput(token: string): void {
		if (this.musixmatchTokenInput) {
			this.musixmatchTokenInput.value = token;
		}
	}

	private providerLabel(provider: ExtensionSettings["providers"]["order"][number]): string {
		return providerDisplayName(this.providers.find((item) => item.id === provider)?.id ?? provider);
	}

	private reportPersistence(persisted: boolean, language: UiLanguage): void {
		this.callbacks.onFeedback?.(persisted ? "saved" : "error", translate(persisted ? "saved" : "saveError", language), persisted ? 1500 : undefined);
	}

	private update(patch: Partial<ExtensionSettings>): SettingsUpdateResult {
		return this.store.updateWithResult(patch);
	}
}
