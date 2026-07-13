import type { TrackTheme } from "../app/TrackThemeService";
import type { ExtensionSettings } from "../settings/SettingsStore";
import { EventEmitter } from "../shared/EventEmitter";
import { THEME_CSS_PROPERTIES } from "../shared/themeCssProperties";
import { PipCoverTransitionController } from "./PipCoverTransitionController";

export type PipSession = {
	window: Window;
	root: HTMLElement;
	setCover(url?: string): void;
	setPlaying(isPlaying: boolean): void;
	applyTheme(theme?: TrackTheme): void;
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
	private sessionCleanup?: () => void;
	private openPromise?: Promise<PipSession>;
	private generation = 0;

	public isSupported(): boolean {
		return "documentPictureInPicture" in window && window.documentPictureInPicture !== undefined;
	}

	public isOpen(): boolean {
		return this.session !== undefined && !this.session.window.closed;
	}

	public async open(settings: ExtensionSettings, styles: string, controls?: PipControls): Promise<PipSession> {
		if (this.openPromise) return this.openPromise;
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
		const generation = ++this.generation;
		const openPromise = this.openInternal(api, generation, settings, styles, controls);
		this.openPromise = openPromise;
		try {
			return await openPromise;
		} finally {
			if (this.openPromise === openPromise) this.openPromise = undefined;
		}
	}

	private async openInternal(
		api: NonNullable<Window["documentPictureInPicture"]>,
		generation: number,
		settings: ExtensionSettings,
		styles: string,
		controls?: PipControls
	): Promise<PipSession> {
		const pipWindow = await api.requestWindow({ width: 600, height: 600 });
		if (generation !== this.generation) {
			pipWindow.close();
			throw new Error("Document Picture-in-Picture open was cancelled.");
		}
		const doc = pipWindow.document;
		doc.title = "AuraLyrics";
		doc.body.replaceChildren();
		const base = doc.createElement("base");
		base.href = window.location.href;
		const style = doc.createElement("style");
		style.textContent = styles;
		const root = doc.createElement("div");
		root.id = "aura-lyrics-root";
		const coverLayer = doc.createElement("div");
		coverLayer.className = "pip-cover-layer";
		const scrim = doc.createElement("div");
		scrim.className = "pip-scrim";
		const vignette = doc.createElement("div");
		vignette.className = "pip-vignette";
		const borderFrame = this.createBorderFrame(doc);
		const content = doc.createElement("main");
		content.className = "pip-content";
		const closeButton = this.createControlButton(doc, "close", this.icon("close"), "Close", () => controls?.onClose());
		closeButton.classList.add("pip-close");
		const controlsElement = this.createControls(doc, controls);
		root.append(coverLayer, scrim, vignette, borderFrame, content, closeButton, controlsElement);
		doc.head.append(base, style);
		doc.body.append(root);
		this.installControlVisibility(root, pipWindow);
		const coverController = new PipCoverTransitionController(coverLayer, (hasCover) => {
			root.classList.toggle("cover-missing", !hasCover);
		});
		let sessionDestroyed = false;
		const destroySession = () => {
			if (sessionDestroyed) return;
			sessionDestroyed = true;
			coverController.destroy();
		};
		let currentSettings = settings;
		const applySettings = (nextSettings: ExtensionSettings) => {
			currentSettings = nextSettings;
			this.applyRootSettings(root, nextSettings);
			root.classList.toggle("background-disabled", !nextSettings.backgroundEnabled);
		};
		let currentPlaying: boolean | undefined;
		const session: PipSession = {
			window: pipWindow,
			root: content,
			setCover: (url) => {
				const resolvedUrl = url ? new URL(url, base.href).href : undefined;
				coverController.setCover(resolvedUrl, {
					animate: currentSettings.motionEnabled && !currentSettings.reduceMotion,
				});
			},
			setPlaying: (isPlaying) => {
				if (currentPlaying === isPlaying) {
					return;
				}
				currentPlaying = isPlaying;
				root.classList.toggle("is-playing", isPlaying);
				this.updatePlayControl(controlsElement, isPlaying);
			},
			applyTheme: (theme) => this.applyTheme(root, theme),
			applySettings,
		};
		session.applySettings(settings);
		session.setPlaying(controls?.isPlaying ?? false);
		this.session = session;
		this.sessionCleanup = destroySession;
		pipWindow.addEventListener("pagehide", () => {
			destroySession();
			if (this.session !== session) return;
			this.session = undefined;
			if (this.sessionCleanup === destroySession) this.sessionCleanup = undefined;
			this.generation++;
			this.closed.emit();
		});
		return session;
	}

	public close(): void {
		this.generation++;
		const session = this.session;
		const cleanup = this.sessionCleanup;
		this.session = undefined;
		this.sessionCleanup = undefined;
		session?.applyTheme(undefined);
		cleanup?.();
		session?.window.close();
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

	private createBorderFrame(doc: Document): HTMLElement {
		const frame = doc.createElement("div");
		frame.className = "pip-border-frame";
		frame.setAttribute("aria-hidden", "true");
		const surface = doc.createElement("div");
		surface.className = "pip-frame-surface";
		const innerShadow = doc.createElement("div");
		innerShadow.className = "pip-frame-inner-shadow";
		const progress = doc.createElement("div");
		progress.className = "pip-frame-progress";
		for (const side of ["top", "right", "bottom", "left"] as const) {
			const segment = doc.createElement("div");
			segment.className = `pip-frame-progress-segment pip-frame-progress-${side}`;
			progress.append(segment);
		}
		frame.append(surface, progress, innerShadow);
		return frame;
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
		root.classList.toggle("reduce-motion", settings.reduceMotion || !settings.motionEnabled);
		root.classList.toggle("interlude-style-frame", settings.interludeStyle === "frame");
		root.classList.toggle("interlude-style-dots", settings.interludeStyle === "dots");
		root.classList.toggle("interlude-style-wave", settings.interludeStyle === "wave");
	}

	private applyTheme(root: HTMLElement, theme: TrackTheme | undefined): void {
		if (!theme) {
			for (const property of THEME_CSS_PROPERTIES) {
				root.style.removeProperty(property);
			}
			delete root.dataset.surfaceTone;
			return;
		}
		const values: Record<(typeof THEME_CSS_PROPERTIES)[number], string> = {
			"--pip-accent-color": theme.accent,
			"--pip-accent-rgb": theme.accentRgb,
			"--pip-background-color": theme.background,
			"--pip-surface-tone": theme.surfaceTone,
			"--pip-foreground-color": theme.foreground,
			"--pip-foreground-rgb": theme.foregroundRgb,
			"--pip-synthetic-wake-color": theme.syntheticWakeForeground,
			"--pip-synthetic-wake-rgb": theme.syntheticWakeRgb,
			"--pip-muted-foreground-color": theme.mutedForeground,
			"--pip-muted-rgb": theme.mutedRgb,
			"--pip-glow-rgb": theme.glowRgb,
			"--pip-scrim-rgb": theme.scrimRgb,
			"--pip-scrim-opacity": String(theme.scrimOpacity),
		};
		for (const property of THEME_CSS_PROPERTIES) {
			root.style.setProperty(property, values[property]);
		}
		root.dataset.surfaceTone = theme.surfaceTone;
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
