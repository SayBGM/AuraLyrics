import { createSettingsIcon } from "./settingsIcons";
import { settingsStyles } from "./settingsStyles";
import { translate } from "./settingsTranslations";
import { SETTINGS_SECTIONS, type SettingsSection, settingsPanelId, settingsTabId } from "./settingsViewTypes";

type SettingsModalShellCallbacks = {
	language(): "en" | "ja" | "ko";
	onActivate(section: SettingsSection, focusTab: boolean): void;
};

export class SettingsModalShell {
	private activeSection: SettingsSection = "general";
	private compact = false;
	private mediaListener?: (event: MediaQueryListEvent) => void;
	private mediaQuery?: MediaQueryList;
	public navigation!: HTMLElement;
	public panelScroller!: HTMLDivElement;

	public constructor(
		private readonly ownerDocument: Document,
		private readonly callbacks: SettingsModalShellCallbacks
	) {}

	public mount(container: HTMLElement, activeSection: SettingsSection): void {
		this.activeSection = activeSection;
		const layout = this.ownerDocument.createElement("div");
		layout.className = "settings-layout";
		const navigation = this.ownerDocument.createElement("nav");
		navigation.className = "settings-navigation";
		navigation.setAttribute("role", "tablist");
		this.navigation = navigation;
		for (const section of SETTINGS_SECTIONS) {
			navigation.append(this.navigationTab(section));
		}

		const panelScroller = this.ownerDocument.createElement("div");
		panelScroller.className = "settings-panel-scroll";
		this.panelScroller = panelScroller;
		layout.append(navigation, panelScroller);
		const styles = this.ownerDocument.createElement("style");
		styles.textContent = settingsStyles;
		container.replaceChildren(styles, layout);
		this.refreshText();
		this.syncActiveSection(activeSection);
	}

	public syncActiveSection(section: SettingsSection): void {
		this.activeSection = section;
		this.navigation.setAttribute("aria-orientation", this.compact ? "horizontal" : "vertical");
		for (const item of SETTINGS_SECTIONS) {
			const button = this.navigation.querySelector<HTMLButtonElement>(`[data-section="${item.id}"]`);
			if (!button) {
				continue;
			}
			const active = item.id === this.activeSection;
			button.setAttribute("aria-selected", String(active));
			button.tabIndex = active ? 0 : -1;
			if (active) {
				button.setAttribute("aria-controls", settingsPanelId(item.id));
			} else {
				button.removeAttribute("aria-controls");
			}
		}
	}

	public refreshText(): void {
		const language = this.callbacks.language();
		this.navigation.setAttribute("aria-label", translate("settingsNavigation", language));
		for (const section of SETTINGS_SECTIONS) {
			const label = this.navigation.querySelector<HTMLElement>(`[data-section="${section.id}"] .settings-tab-label`);
			if (label) {
				label.textContent = translate(section.label, language);
			}
		}
	}

	public setCompact(compact: boolean): void {
		this.compact = compact;
		this.syncActiveSection(this.activeSection);
	}

	public attachResponsive(hostWindow: Window): void {
		this.detachResponsive();
		if (typeof hostWindow.matchMedia !== "function") {
			this.setCompact(false);
			return;
		}
		const mediaQuery = hostWindow.matchMedia("(max-width: 680px)");
		const listener = (event: MediaQueryListEvent): void => this.setCompact(event.matches);
		this.mediaQuery = mediaQuery;
		this.mediaListener = listener;
		this.setCompact(mediaQuery.matches);
		mediaQuery.addEventListener("change", listener);
	}

	public detachResponsive(): void {
		if (this.mediaQuery && this.mediaListener) {
			this.mediaQuery.removeEventListener("change", this.mediaListener);
		}
		this.mediaQuery = undefined;
		this.mediaListener = undefined;
	}

	public focusActiveTab(): void {
		this.navigation.querySelector<HTMLButtonElement>(`[data-section="${this.activeSection}"]`)?.focus();
	}

	private navigationTab(section: (typeof SETTINGS_SECTIONS)[number]): HTMLButtonElement {
		const button = this.ownerDocument.createElement("button");
		button.type = "button";
		button.className = "settings-tab";
		button.id = settingsTabId(section.id);
		button.dataset.section = section.id;
		button.setAttribute("role", "tab");
		const label = this.ownerDocument.createElement("span");
		label.className = "settings-tab-label";
		button.append(createSettingsIcon(section.icon, this.ownerDocument), label);
		button.addEventListener("click", () => this.callbacks.onActivate(section.id, false));
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
		} else if ((!this.compact && event.key === "ArrowDown") || (this.compact && event.key === "ArrowRight")) {
			nextIndex = (index + 1) % SETTINGS_SECTIONS.length;
		} else if ((!this.compact && event.key === "ArrowUp") || (this.compact && event.key === "ArrowLeft")) {
			nextIndex = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
		}
		if (nextIndex === undefined) {
			return;
		}
		event.preventDefault();
		this.callbacks.onActivate(SETTINGS_SECTIONS[nextIndex].id, true);
	}
}
