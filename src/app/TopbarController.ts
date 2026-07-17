import type { SpicetifyGlobal } from "../runtime/spicetify";

const LYRICS_BUTTON_LABEL = "AuraLyrics";
const SETTINGS_BUTTON_LABEL = "AuraLyrics 설정";

const SETTINGS_ICON = `
	<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
		<path d="M4 7h4m4 0h8M4 12h9m4 0h3M4 17h2m4 0h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		<circle cx="10" cy="7" r="2" stroke="currentColor" stroke-width="1.5" />
		<circle cx="15" cy="12" r="2" stroke="currentColor" stroke-width="1.5" />
		<circle cx="8" cy="17" r="2" stroke="currentColor" stroke-width="1.5" />
	</svg>
`;

export class TopbarController {
	private lyricsButton?: {
		element: HTMLElement;
		active?: boolean;
		deregister?: () => void;
	};
	private settingsButton?: {
		element: HTMLElement;
		deregister?: () => void;
	};

	public constructor(
		private readonly spicetify: SpicetifyGlobal,
		private readonly onToggle: () => void,
		private readonly onSettings: () => void
	) {}

	public register(): void {
		if (!this.spicetify.Topbar) {
			throw new Error("Spicetify.Topbar is not available.");
		}
		this.lyricsButton = new this.spicetify.Topbar.Button(LYRICS_BUTTON_LABEL, "lyrics", this.onToggle);
		this.settingsButton = new this.spicetify.Topbar.Button(SETTINGS_BUTTON_LABEL, SETTINGS_ICON, this.onSettings);
		this.decorateButton(this.lyricsButton.element, "toggle", LYRICS_BUTTON_LABEL);
		this.decorateButton(this.settingsButton.element, "settings", SETTINGS_BUTTON_LABEL);
		this.lyricsButton.element.addEventListener("contextmenu", this.handleContextMenu);
	}

	public setActive(active: boolean): void {
		if (this.lyricsButton) {
			this.lyricsButton.active = active;
			this.lyricsButton.element.classList.toggle("active", active);
		}
	}

	public destroy(): void {
		this.lyricsButton?.element.removeEventListener("contextmenu", this.handleContextMenu);
		this.lyricsButton?.deregister?.();
		this.settingsButton?.deregister?.();
		this.lyricsButton = undefined;
		this.settingsButton = undefined;
	}

	private readonly handleContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
		this.onSettings();
	};

	private decorateButton(element: HTMLElement, kind: "settings" | "toggle", label: string): void {
		element.classList.add("aura-lyrics-topbar-button", `aura-lyrics-topbar-${kind}`);
		element.setAttribute("aria-label", label);
	}
}
