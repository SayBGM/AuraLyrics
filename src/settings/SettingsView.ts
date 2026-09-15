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
	private dialog?: HTMLDialogElement;
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
		if (this.dialog?.open) {
			this.shell?.focusActiveTab();
			return;
		}
		const ownerDocument = window.document;
		const dialog = ownerDocument.createElement("dialog");
		dialog.className = "aura-lyrics-settings-modal";
		dialog.setAttribute("aria-labelledby", "aura-lyrics-settings-title");
		let pointerDownTarget: EventTarget | undefined;
		dialog.addEventListener("pointerdown", (event) => {
			pointerDownTarget = event.target ?? undefined;
		});
		dialog.addEventListener("click", (event) => {
			const startedOnBackdrop = pointerDownTarget === undefined || pointerDownTarget === dialog;
			pointerDownTarget = undefined;
			if (event.target === dialog && startedOnBackdrop) {
				this.destroy();
			}
		});
		dialog.addEventListener("cancel", (event) => {
			event.preventDefault();
			this.destroy();
		});
		const header = ownerDocument.createElement("header");
		header.className = "aura-lyrics-settings-modal-header";
		const title = ownerDocument.createElement("h1");
		title.id = "aura-lyrics-settings-title";
		title.className = "aura-lyrics-settings-modal-title";
		title.textContent = translate("settingsTitle", this.store.get().language);
		const closeButton = ownerDocument.createElement("button");
		closeButton.type = "button";
		closeButton.className = "aura-lyrics-settings-modal-close";
		closeButton.setAttribute("aria-label", translate("settingsClose", this.store.get().language));
		closeButton.innerHTML =
			'<svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fill-rule="evenodd"></path></svg>';
		closeButton.addEventListener("click", () => this.destroy());
		header.append(title, closeButton);
		const container = ownerDocument.createElement("div");
		container.className = "aura-lyrics-settings";
		container.setAttribute("role", "region");
		container.setAttribute("aria-label", translate("settingsTitle", this.store.get().language));
		const shell = new SettingsModalShell(ownerDocument, {
			language: () => this.store.get().language,
			onActivate: (section, focusTab) => this.activateSection(section, focusTab),
		});
		this.lifecycle.prepare(dialog, {
			onAttached: () => shell.focusActiveTab(),
			onDetached: () => this.onDetached(container, shell),
			onRequestClose: () => this.destroy(),
		});
		this.container = container;
		this.dialog = dialog;
		this.shell = shell;
		shell.mount(container, this.activeSection);
		this.renderActivePanel();
		dialog.append(header, container);
		ownerDocument.body.append(dialog);
		if (typeof dialog.showModal === "function") {
			dialog.showModal();
		} else {
			dialog.setAttribute("open", "");
		}
		shell.attachResponsive(window);
		this.lifecycle.start();
	}

	public destroy(): void {
		const dialog = this.dialog;
		if (dialog?.open && typeof dialog.close === "function") {
			dialog.close();
		}
		this.lifecycle.destroy(() => undefined);
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
				this.refreshModalText();
			}
			this.renderActivePanel();
			this.lifecycle.restorePanelState(shell.panelScroller, state, () => shell.focusActiveTab());
		}, 0);
	}

	private refreshModalText(): void {
		const language = this.store.get().language;
		this.dialog
			?.querySelector<HTMLElement>("#aura-lyrics-settings-title")
			?.replaceChildren(document.createTextNode(translate("settingsTitle", language)));
		this.dialog
			?.querySelector<HTMLButtonElement>(".aura-lyrics-settings-modal-close")
			?.setAttribute("aria-label", translate("settingsClose", language));
	}

	private onDetached(container: HTMLElement, shell: SettingsModalShell): void {
		shell.detachResponsive();
		this.panelRenderer.cleanup();
		this.clearRefreshTimer();
		this.clearFeedbackTimer();
		this.feedbackState = "idle";
		if (this.container === container) {
			this.container = undefined;
			this.dialog = undefined;
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
