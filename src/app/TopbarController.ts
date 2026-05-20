import type { SpicetifyGlobal } from "../runtime/spicetify";

export class TopbarController {
	private button?: {
		element: HTMLElement;
		active?: boolean;
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
		this.button = new this.spicetify.Topbar.Button("AuraLyrics", "lyrics", this.onToggle);
		this.button.element.addEventListener("contextmenu", this.handleContextMenu);
	}

	public setActive(active: boolean): void {
		if (this.button) {
			this.button.active = active;
			this.button.element.classList.toggle("active", active);
		}
	}

	public destroy(): void {
		this.button?.element.removeEventListener("contextmenu", this.handleContextMenu);
		this.button?.deregister?.();
	}

	private readonly handleContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
		this.onSettings();
	};
}
