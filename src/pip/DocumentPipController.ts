import type { ExtensionSettings } from "../settings/SettingsStore";
import { EventEmitter } from "../shared/EventEmitter";

export type PipSession = {
	window: Window;
	root: HTMLElement;
	setCover(url?: string): void;
	setPlaying(isPlaying: boolean): void;
	applySettings(settings: ExtensionSettings): void;
};

export type PipControls = {
	isPlaying: boolean;
	onPrevious(): void;
	onTogglePlay(): void;
	onNext(): void;
	onClose(): void;
};

export class DocumentPipController {
	public readonly closed = new EventEmitter<void>();
	private session?: PipSession;

	public isSupported(): boolean {
		return "documentPictureInPicture" in window && window.documentPictureInPicture !== undefined;
	}

	public isOpen(): boolean {
		return this.session !== undefined && !this.session.window.closed;
	}

	public async open(settings: ExtensionSettings, styles: string, controls?: PipControls): Promise<PipSession> {
		if (!this.isSupported()) {
			throw new Error("Document Picture-in-Picture is not supported in this Spotify client.");
		}
		const api = window.documentPictureInPicture;
		if (!api) {
			throw new Error("Document Picture-in-Picture is not available.");
		}
		if (this.session && !this.session.window.closed) {
			return this.session;
		}
		const size = this.getSize(settings.aspectRatio);
		const pipWindow = await api.requestWindow(size);
		const doc = pipWindow.document;
		doc.title = "AuraLyrics";
		doc.body.replaceChildren();
		const style = doc.createElement("style");
		style.textContent = styles;
		const root = doc.createElement("div");
		root.id = "aura-lyrics-root";
		const cover = doc.createElement("img");
		cover.className = "pip-cover";
		const scrim = doc.createElement("div");
		scrim.className = "pip-scrim";
		const vignette = doc.createElement("div");
		vignette.className = "pip-vignette";
		const content = doc.createElement("main");
		content.className = "pip-content";
		const closeButton = this.createControlButton(doc, "close", this.icon("close"), "Close", () => controls?.onClose());
		closeButton.classList.add("pip-close");
		const controlsElement = this.createControls(doc, controls);
		root.append(cover, scrim, vignette, content, closeButton, controlsElement);
		doc.head.append(style);
		doc.body.append(root);
		this.installControlVisibility(root, pipWindow);
		let coverUrl: string | undefined;
		let currentSettings = settings;
		const applySettings = (nextSettings: ExtensionSettings) => {
			currentSettings = nextSettings;
			this.applyRootSettings(root, nextSettings);
			cover.toggleAttribute("hidden", !coverUrl || !nextSettings.backgroundEnabled);
		};
		let currentPlaying: boolean | undefined;
		const session: PipSession = {
			window: pipWindow,
			root: content,
			setCover: (url) => {
				coverUrl = url;
				cover.toggleAttribute("hidden", !url || !currentSettings.backgroundEnabled);
				if (url) {
					cover.src = url;
				}
			},
			setPlaying: (isPlaying) => {
				if (currentPlaying === isPlaying) {
					return;
				}
				currentPlaying = isPlaying;
				this.updatePlayControl(controlsElement, isPlaying);
			},
			applySettings,
		};
		session.applySettings(settings);
		session.setPlaying(controls?.isPlaying ?? false);
		this.session = session;
		pipWindow.addEventListener("pagehide", () => {
			this.session = undefined;
			this.closed.emit();
		});
		return session;
	}

	public close(): void {
		this.session?.window.close();
		this.session = undefined;
	}

	private getSize(ratio: ExtensionSettings["aspectRatio"]): { width: number; height: number } {
		const width = 600;
		if (ratio === "16:9") {
			return { width, height: Math.round((width * 9) / 16) };
		}
		if (ratio === "4:3") {
			return { width, height: Math.round((width * 3) / 4) };
		}
		return { width, height: width };
	}

	private createControls(doc: Document, controls?: PipControls): HTMLElement {
		const wrapper = doc.createElement("div");
		wrapper.className = "pip-controls chrome-pip-controls";
		wrapper.append(
			this.createControlButton(doc, "previous", this.icon("previous"), "Previous track", () => controls?.onPrevious()),
			this.createControlButton(doc, "toggle-play", this.icon("pause"), "Pause", () => controls?.onTogglePlay()),
			this.createControlButton(doc, "next", this.icon("next"), "Next track", () => controls?.onNext())
		);
		return wrapper;
	}

	private createControlButton(doc: Document, control: string, icon: string, label: string, onClick: () => void): HTMLButtonElement {
		const button = doc.createElement("button");
		button.type = "button";
		button.dataset.control = control;
		button.innerHTML = icon;
		button.setAttribute("aria-label", label);
		button.addEventListener("click", onClick);
		return button;
	}

	private updatePlayControl(controlsElement: HTMLElement, isPlaying: boolean): void {
		const button = controlsElement.querySelector<HTMLButtonElement>('[data-control="toggle-play"]');
		if (!button) {
			return;
		}
		button.innerHTML = isPlaying ? this.icon("pause") : this.icon("play");
		button.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
	}

	private installControlVisibility(root: HTMLElement, pipWindow: Window): void {
		let hideTimer: number | undefined;
		const show = () => {
			root.classList.add("controls-visible");
			if (hideTimer !== undefined) {
				pipWindow.clearTimeout(hideTimer);
			}
			hideTimer = pipWindow.setTimeout(() => {
				root.classList.remove("controls-visible");
				hideTimer = undefined;
			}, 2200);
		};
		for (const eventName of ["pointermove", "mousemove", "focusin"] as const) {
			root.addEventListener(eventName, show);
		}
		for (const eventName of ["pointerleave", "mouseleave"] as const) {
			root.addEventListener(eventName, () => {
				if (hideTimer !== undefined) {
					pipWindow.clearTimeout(hideTimer);
					hideTimer = undefined;
				}
				root.classList.remove("controls-visible");
			});
		}
	}

	private applyRootSettings(root: HTMLElement, settings: ExtensionSettings): void {
		root.style.setProperty("--font-scale", String(settings.fontScale));
		root.style.setProperty("--background-blur", `${settings.backgroundBlurPx}px`);
		root.style.setProperty("--background-dim", String(settings.backgroundDim));
		root.style.setProperty("--background-saturation", String(settings.backgroundSaturation));
		root.style.setProperty("--vignette-strength", String(settings.vignetteStrength));
		root.style.setProperty("--inactive-blur", `${settings.inactiveBlurPx}px`);
		root.style.setProperty("--motion-intensity", String(settings.motionIntensity));
	}

	private icon(name: "close" | "next" | "pause" | "play" | "previous"): string {
		const icons = {
			close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.05 7.05 12 12m0 0 4.95 4.95M12 12l4.95-4.95M12 12l-4.95 4.95" /></svg>',
			previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 6 5 12l6 6V6Zm8 0-6 6 6 6V6Z" /></svg>',
			pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h3v12H8V6Zm5 0h3v12h-3V6Z" /></svg>',
			play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" /></svg>',
			next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 6 6 6-6 6V6ZM5 6l6 6-6 6V6Z" /></svg>',
		};
		return icons[name];
	}
}
