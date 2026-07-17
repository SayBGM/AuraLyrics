import type { LyricsProvider } from "../lyrics/types";
import { SettingsModalLifecycle } from "./SettingsModalLifecycle";
import { SettingsModalShell } from "./SettingsModalShell";
import { SettingsPanelRenderer } from "./SettingsPanelRenderer";
import type { SettingsStore } from "./SettingsStore";
import { translate } from "./settingsTranslations";
import type { SettingsCallbacks, SettingsFeedbackState, SettingsSection } from "./settingsViewTypes";

export class SettingsView {
	private activeSection: SettingsSection = "general";
	private container?: HTMLDivElement;
	private readonly lifecycle: SettingsModalLifecycle;
	private readonly panelRenderer: SettingsPanelRenderer;
	private refreshTimer?: number;
	private feedbackTimer?: number;
	private feedbackState: SettingsFeedbackState = "idle";
	private shell?: SettingsModalShell;

	public constructor(
		private readonly store: SettingsStore,
		providers: LyricsProvider[],
		callbacks: SettingsCallbacks
	) {
		this.lifecycle = new SettingsModalLifecycle(window, window.document);
		this.panelRenderer = new SettingsPanelRenderer(window.document, store, providers, {
			...callbacks,
			onFeedback: (state, text, durationMs) => this.showFeedback(state, text, durationMs),
			onScheduleRefresh: (refreshNavigation) => this.schedulePanelRefresh(refreshNavigation),
		});
	}

	public open(): void {
		const spicetify = window.Spicetify;
		if (!spicetify?.PopupModal) {
			return;
		}
		const ownerDocument = window.document;
		const container = ownerDocument.createElement("div");
		container.className = "aura-lyrics-settings";
		container.setAttribute("role", "region");
		container.setAttribute("aria-label", translate("settingsTitle", this.store.get().language));
		const shell = new SettingsModalShell(ownerDocument, {
			language: () => this.store.get().language,
			onActivate: (section, focusTab) => this.activateSection(section, focusTab),
		});
		this.lifecycle.prepare(container, {
			onAttached: () => shell.focusActiveTab(),
			onDetached: () => this.onDetached(container, shell),
			onRequestClose: () => this.destroy(),
		});
		this.container = container;
		this.shell = shell;
		shell.mount(container, this.activeSection);
		this.renderActivePanel();
		spicetify.PopupModal.display({ title: "AuraLyrics", content: container });
		shell.attachResponsive(window);
		this.lifecycle.start();
	}

	public destroy(): void {
		this.lifecycle.destroy(() => window.Spicetify?.PopupModal?.hide?.());
	}

	public refreshCurrentTrack(): void {
		if (this.container && this.activeSection === "lyrics") {
			this.schedulePanelRefresh();
		}
	}

	public reportPersistenceFailure(): boolean {
		if (!this.container || !this.shell) {
			return false;
		}
		this.showFeedback("error", translate("saveError", this.store.get().language));
		return true;
	}

	private activateSection(section: SettingsSection, focusTab: boolean): void {
		const changed = section !== this.activeSection;
		this.activeSection = section;
		this.shell?.syncActiveSection(section);
		if (changed) {
			this.renderActivePanel();
			if (this.shell) {
				this.shell.panelScroller.scrollTop = 0;
			}
		}
		if (focusTab) {
			this.shell?.focusActiveTab();
		}
	}

	private renderActivePanel(): void {
		this.shell?.panelScroller.replaceChildren(this.panelRenderer.render(this.activeSection));
	}

	private schedulePanelRefresh(refreshNavigation = false): void {
		const shell = this.shell;
		const state = this.lifecycle.capturePanelState(shell?.panelScroller);
		this.clearRefreshTimer();
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = undefined;
			if (!this.container || this.shell !== shell || !shell) {
				return;
			}
			if (refreshNavigation) {
				shell.refreshText();
			}
			this.renderActivePanel();
			this.lifecycle.restorePanelState(shell.panelScroller, state, () => shell.focusActiveTab());
		}, 0);
	}

	private onDetached(container: HTMLElement, shell: SettingsModalShell): void {
		shell.detachResponsive();
		this.panelRenderer.cleanup();
		this.clearRefreshTimer();
		this.clearFeedbackTimer();
		this.feedbackState = "idle";
		if (this.container === container) {
			this.container = undefined;
			this.shell = undefined;
		}
	}

	private showFeedback(state: SettingsFeedbackState, text: string, durationMs?: number): void {
		if (this.feedbackState === "error" && state !== "saved" && state !== "success" && state !== "error") {
			return;
		}
		this.clearFeedbackTimer();
		this.feedbackState = state;
		this.shell?.setFeedback(state, text);
		const timeout = durationMs ?? (state === "saved" ? 1500 : state === "success" ? 2500 : undefined);
		if (timeout === undefined || state === "error" || state === "working" || state === "previewing") {
			return;
		}
		this.feedbackTimer = window.setTimeout(() => {
			this.feedbackTimer = undefined;
			this.feedbackState = "idle";
			this.shell?.setFeedback("idle");
		}, timeout);
	}

	private clearRefreshTimer(): void {
		if (this.refreshTimer !== undefined) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	private clearFeedbackTimer(): void {
		if (this.feedbackTimer !== undefined) {
			window.clearTimeout(this.feedbackTimer);
			this.feedbackTimer = undefined;
		}
	}
}
