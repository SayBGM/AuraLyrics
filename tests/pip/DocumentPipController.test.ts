import { describe, expect, test, vi } from "vitest";
import { buildTrackTheme } from "../../src/app/TrackThemeService";
import { DocumentPipController } from "../../src/pip/DocumentPipController";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

const createPipWindow = ({ height = 600, width = 600 } = {}): Window => {
	const doc = document.implementation.createHTMLDocument("PiP");
	return {
		document: doc,
		closed: false,
		innerHeight: height,
		innerWidth: width,
		addEventListener: vi.fn(),
		close: vi.fn(),
	} as unknown as Window;
};

describe("DocumentPipController", () => {
	test("shares concurrent open requests", async () => {
		const pipWindow = createPipWindow();
		let resolve!: (value: Window) => void;
		window.documentPictureInPicture = { requestWindow: vi.fn(() => new Promise<Window>((r) => (resolve = r))) };
		const controller = new DocumentPipController();
		const first = controller.open(DEFAULT_SETTINGS, "");
		const second = controller.open(DEFAULT_SETTINGS, "");
		resolve(pipWindow);
		expect(await first).toBe(await second);
	});

	test("cancels a pending open when closed", async () => {
		const pipWindow = createPipWindow();
		let resolve!: (value: Window) => void;
		window.documentPictureInPicture = { requestWindow: vi.fn(() => new Promise<Window>((r) => (resolve = r))) };
		const controller = new DocumentPipController();
		const pending = controller.open(DEFAULT_SETTINGS, "");
		controller.close();
		resolve(pipWindow);
		await expect(pending).rejects.toThrow("cancelled");
		expect(pipWindow.close).toHaveBeenCalledOnce();
	});
	test("renders hover controls for close and playback actions", async () => {
		const pipWindow = createPipWindow();
		const requestWindow = vi.fn(async () => pipWindow);
		const onPrevious = vi.fn();
		const onTogglePlay = vi.fn();
		const onNext = vi.fn();
		const onClose = vi.fn();
		window.documentPictureInPicture = {
			requestWindow,
		};

		await new DocumentPipController().open(DEFAULT_SETTINGS, "", {
			isPlaying: true,
			onPrevious,
			onTogglePlay,
			onNext,
			onClose,
		});

		expect(requestWindow).toHaveBeenCalledWith({ width: 600, height: 600 });
		const controls = pipWindow.document.querySelector(".pip-controls");
		const close = pipWindow.document.querySelector('[data-control="close"]');
		const frame = pipWindow.document.querySelector(".pip-border-frame");
		const frameSurface = pipWindow.document.querySelector(".pip-frame-surface");
		const innerShadow = pipWindow.document.querySelector(".pip-frame-inner-shadow");
		const frameProgress = pipWindow.document.querySelector(".pip-frame-progress");
		expect(controls).not.toBeNull();
		expect(close?.classList.contains("pip-close")).toBe(true);
		expect(controls?.classList.contains("chrome-pip-controls")).toBe(true);
		expect(close?.getAttribute("aria-label")).toBe("Close");
		expect(controls?.querySelector('[data-control="close"]')).toBeNull();
		expect(pipWindow.document.querySelector('[data-control="previous"]')).not.toBeNull();
		expect(pipWindow.document.querySelector('[data-control="toggle-play"]')?.getAttribute("aria-label")).toBe("Pause");
		expect(pipWindow.document.querySelector('[data-control="next"]')).not.toBeNull();
		expect(frame?.parentElement?.id).toBe("aura-lyrics-root");
		expect(frame?.tagName.toLowerCase()).toBe("div");
		expect(frameSurface?.tagName.toLowerCase()).toBe("div");
		expect(innerShadow?.tagName.toLowerCase()).toBe("div");
		expect(frameProgress?.querySelectorAll(".pip-frame-progress-segment")).toHaveLength(4);
		expect(pipWindow.document.querySelector(".pip-border-progress")).toBeNull();
		expect(pipWindow.document.querySelector(".pip-border-progress-halo")).toBeNull();
		expect(pipWindow.document.querySelector(".pip-border-track-fill")).toBeNull();
		expect(pipWindow.document.querySelector("#pip-border-progress-gradient")).toBeNull();

		pipWindow.document.querySelector<HTMLButtonElement>('[data-control="previous"]')?.click();
		pipWindow.document.querySelector<HTMLButtonElement>('[data-control="toggle-play"]')?.click();
		pipWindow.document.querySelector<HTMLButtonElement>('[data-control="next"]')?.click();
		pipWindow.document.querySelector<HTMLButtonElement>('[data-control="close"]')?.click();

		expect(onPrevious).toHaveBeenCalledOnce();
		expect(onTogglePlay).toHaveBeenCalledOnce();
		expect(onNext).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("shows controls on pointer movement without requiring click", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");
		root?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));

		expect(root?.classList.contains("controls-visible")).toBe(true);
	});

	test("does not rewrite the play toggle DOM when playback state is unchanged", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "", {
			isPlaying: true,
			onPrevious: vi.fn(),
			onTogglePlay: vi.fn(),
			onNext: vi.fn(),
			onClose: vi.fn(),
		});
		const button = pipWindow.document.querySelector<HTMLButtonElement>('[data-control="toggle-play"]');
		const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
		const innerHtmlWrites = vi.fn();
		Object.defineProperty(button, "innerHTML", {
			configurable: true,
			get: () => descriptor?.get?.call(button) ?? "",
			set: (value: string) => {
				innerHtmlWrites(value);
				descriptor?.set?.call(button, value);
			},
		});

		session.setPlaying(true);
		session.setPlaying(true);

		expect(innerHtmlWrites).not.toHaveBeenCalled();
	});

	test("marks the PiP root as playing only while playback is active", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "", {
			isPlaying: false,
			onPrevious: vi.fn(),
			onTogglePlay: vi.fn(),
			onNext: vi.fn(),
			onClose: vi.fn(),
		});
		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");

		expect(root?.classList.contains("is-playing")).toBe(false);
		session.setPlaying(true);
		expect(root?.classList.contains("is-playing")).toBe(true);
		session.setPlaying(false);
		expect(root?.classList.contains("is-playing")).toBe(false);
	});

	test("applies visual settings to the PiP root and background", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		session.setCover("https://example.com/cover.jpg");
		session.applySettings({
			...DEFAULT_SETTINGS,
			backgroundEnabled: false,
			backgroundBlurPx: 12,
			backgroundDim: 0.4,
			backgroundSaturation: 0.7,
			fontScale: 1.2,
			interludeStyle: "wave",
		});

		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");
		const cover = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover");
		expect(root?.style.getPropertyValue("--background-blur")).toBe("12px");
		expect(root?.style.getPropertyValue("--background-dim")).toBe("0.4");
		expect(root?.style.getPropertyValue("--background-saturation")).toBe("0.7");
		expect(root?.style.getPropertyValue("--font-scale")).toBe("1.2");
		expect(root?.style.getPropertyValue("--lyrics-size")).toBe("");
		expect(root?.classList.contains("interlude-style-wave")).toBe(true);
		expect(root?.classList.contains("interlude-style-frame")).toBe(false);
		expect(cover?.hidden).toBe(false);
		expect(root?.classList.contains("background-disabled")).toBe(true);
	});

	test("shows the album art background when a cover URL is available", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		session.setCover("https://i.scdn.co/image/ab67616d0000b273cover");

		const cover = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover");
		expect(cover?.hidden).toBe(false);
		expect(cover?.getAttribute("src")).toBe("https://i.scdn.co/image/ab67616d0000b273cover");
	});

	test("sets a base URL so Spotify image paths resolve inside the PiP document", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		session.setCover("/image/ab67616d0000b273cover");

		const base = pipWindow.document.querySelector<HTMLBaseElement>("base");
		const cover = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover");
		expect(base?.href).toBe(window.location.href);
		expect(cover?.src).toBe(`${window.location.origin}/image/ab67616d0000b273cover`);
	});

	test("renders a square-corner interlude frame with CSS progress segments instead of SVG paths", async () => {
		const pipWindow = createPipWindow({ width: 960, height: 420 });
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		await new DocumentPipController().open(DEFAULT_SETTINGS, "");

		const frame = pipWindow.document.querySelector<HTMLElement>(".pip-border-frame");
		expect(frame?.querySelector(".pip-frame-surface")).not.toBeNull();
		expect(frame?.querySelector(".pip-frame-inner-shadow")).not.toBeNull();
		expect(frame?.querySelector(".pip-frame-progress")).not.toBeNull();
		expect(frame?.querySelector(".pip-frame-progress-top")).not.toBeNull();
		expect(frame?.querySelector(".pip-frame-progress-right")).not.toBeNull();
		expect(frame?.querySelector(".pip-frame-progress-bottom")).not.toBeNull();
		expect(frame?.querySelector(".pip-frame-progress-left")).not.toBeNull();
		expect(frame?.querySelector("svg")).toBeNull();
		expect(frame?.querySelector(".pip-border-progress")).toBeNull();
	});

	test("applies and safely resets the complete track theme as PiP CSS variables", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		const theme = buildTrackTheme({
			DARK_VIBRANT: "#101820",
			DESATURATED: "#778899",
			LIGHT_VIBRANT: "#f5e6cc",
			PROMINENT: "#112233",
			VIBRANT: "#ff6b35",
			VIBRANT_NON_ALARMING: "#2d9cdb",
		});
		session.applyTheme(theme);

		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");
		expect(root?.style.getPropertyValue("--pip-accent-color")).toBe(theme.accent);
		expect(root?.style.getPropertyValue("--pip-accent-rgb")).toBe("45, 156, 219");
		expect(root?.style.getPropertyValue("--pip-background-color")).toBe(theme.background);
		expect(root?.style.getPropertyValue("--pip-surface-tone")).toBe(theme.surfaceTone);
		expect(root?.style.getPropertyValue("--pip-foreground-color")).toBe(theme.foreground);
		expect(root?.style.getPropertyValue("--pip-foreground-rgb")).toBe(theme.foregroundRgb);
		expect(root?.style.getPropertyValue("--pip-muted-foreground-color")).toBe(theme.mutedForeground);
		expect(root?.style.getPropertyValue("--pip-muted-rgb")).toBe(theme.mutedRgb);
		expect(root?.style.getPropertyValue("--pip-glow-rgb")).toBe(theme.glowRgb);
		expect(root?.style.getPropertyValue("--pip-scrim-rgb")).toBe(theme.scrimRgb);
		expect(root?.style.getPropertyValue("--pip-scrim-opacity")).toBe(String(theme.scrimOpacity));
		expect(root?.dataset.surfaceTone).toBe(theme.surfaceTone);

		session.applyTheme(undefined);
		for (const property of [
			"--pip-accent-color",
			"--pip-accent-rgb",
			"--pip-background-color",
			"--pip-surface-tone",
			"--pip-foreground-color",
			"--pip-foreground-rgb",
			"--pip-muted-foreground-color",
			"--pip-muted-rgb",
			"--pip-glow-rgb",
			"--pip-scrim-rgb",
			"--pip-scrim-opacity",
		]) {
			expect(root?.style.getPropertyValue(property)).toBe("");
		}
		expect(root?.dataset.surfaceTone).toBeUndefined();
	});
});
