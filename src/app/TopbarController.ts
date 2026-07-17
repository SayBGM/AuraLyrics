import type { SpicetifyGlobal } from "../runtime/spicetify";

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
		this.lyricsButton = new this.spicetify.Topbar.Button("AuraLyrics", "lyrics", this.onToggle);
		this.settingsButton = new this.spicetify.Topbar.Button("AuraLyrics Settings", "settings", this.onSettings);
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
}
