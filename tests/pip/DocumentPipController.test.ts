import { describe, expect, test, vi } from "vitest";
import { DocumentPipController } from "../../src/pip/DocumentPipController";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

const createPipWindow = (): Window => {
	const doc = document.implementation.createHTMLDocument("PiP");
	return {
		document: doc,
		closed: false,
		addEventListener: vi.fn(),
		close: vi.fn(),
	} as unknown as Window;
};

describe("DocumentPipController", () => {
	test("renders hover controls for close and playback actions", async () => {
		const pipWindow = createPipWindow();
		const onPrevious = vi.fn();
		const onTogglePlay = vi.fn();
		const onNext = vi.fn();
		const onClose = vi.fn();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		await new DocumentPipController().open(DEFAULT_SETTINGS, "", {
			isPlaying: true,
			onPrevious,
			onTogglePlay,
			onNext,
			onClose,
		});

		const controls = pipWindow.document.querySelector(".pip-controls");
		const close = pipWindow.document.querySelector('[data-control="close"]');
		expect(controls).not.toBeNull();
		expect(close?.classList.contains("pip-close")).toBe(true);
		expect(controls?.classList.contains("chrome-pip-controls")).toBe(true);
		expect(close?.getAttribute("aria-label")).toBe("Close");
		expect(controls?.querySelector('[data-control="close"]')).toBeNull();
		expect(pipWindow.document.querySelector('[data-control="previous"]')).not.toBeNull();
		expect(pipWindow.document.querySelector('[data-control="toggle-play"]')?.getAttribute("aria-label")).toBe("Pause");
		expect(pipWindow.document.querySelector('[data-control="next"]')).not.toBeNull();

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
		});

		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");
		const cover = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover");
		expect(root?.style.getPropertyValue("--background-blur")).toBe("12px");
		expect(root?.style.getPropertyValue("--background-dim")).toBe("0.4");
		expect(root?.style.getPropertyValue("--background-saturation")).toBe("0.7");
		expect(root?.style.getPropertyValue("--font-scale")).toBe("1.2");
		expect(root?.style.getPropertyValue("--lyrics-size")).toBe("");
		expect(cover?.hidden).toBe(true);
	});
});
