import { afterEach, describe, expect, test, vi } from "vitest";
import { buildTrackTheme } from "../../src/app/TrackThemeService";
import { DocumentPipController } from "../../src/pip/DocumentPipController";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";
import { THEME_CSS_PROPERTIES } from "../../src/shared/themeCssProperties";

const createPipWindow = ({ height = 600, width = 600 } = {}): Window => {
	const doc = document.implementation.createHTMLDocument("PiP");
	const pipWindow = {
		document: doc,
		closed: false,
		innerHeight: height,
		innerWidth: width,
		addEventListener: vi.fn(),
		setTimeout: (handler: TimerHandler, timeout?: number) => window.setTimeout(handler, timeout),
		clearTimeout: (timer?: number) => window.clearTimeout(timer),
		close: vi.fn(),
	} as unknown as Window;
	Object.defineProperty(doc, "defaultView", { configurable: true, value: pipWindow });
	return pipWindow;
};

describe("DocumentPipController", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

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
		const root = pipWindow.document.querySelector("#aura-lyrics-root");
		const coverLayer = pipWindow.document.querySelector(".pip-cover-layer");
		const content = pipWindow.document.querySelector(".pip-content");
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
		expect(coverLayer?.parentElement).toBe(root);
		expect(content?.parentElement).toBe(root);
		expect(coverLayer?.contains(content ?? null)).toBe(false);
		expect(Array.from(root?.children ?? []).map((element) => element.className)).toEqual([
			"pip-cover-layer",
			"pip-scrim",
			"pip-vignette",
			"pip-border-frame",
			"pip-content",
			"pip-close",
			"pip-controls chrome-pip-controls",
		]);
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
		expect(root?.classList.contains("cover-missing")).toBe(true);
		expect(root?.classList.contains("background-disabled")).toBe(true);
		cover?.dispatchEvent(new Event("load"));
		expect(root?.classList.contains("cover-missing")).toBe(false);
	});

	test("shows the album art background only after the requested cover loads", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		session.setCover("https://i.scdn.co/image/ab67616d0000b273cover");

		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");
		const cover = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover");
		expect(root?.classList.contains("cover-missing")).toBe(true);
		expect(cover?.dataset.coverState).toBe("pending");
		expect(cover?.hidden).toBe(false);
		expect(cover?.getAttribute("src")).toBe("https://i.scdn.co/image/ab67616d0000b273cover");

		cover?.dispatchEvent(new Event("load"));

		expect(root?.classList.contains("cover-missing")).toBe(false);
		expect(cover?.dataset.coverState).toBe("active");
	});

	test("clears a previous cover when the next track has none and shows a later cover", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");
		session.setCover("https://example.com/first.jpg");
		const first = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover");
		first?.dispatchEvent(new Event("load"));

		session.setCover(undefined);

		expect(pipWindow.document.querySelector(".pip-cover")).toBeNull();
		expect(root?.classList.contains("cover-missing")).toBe(true);

		session.setCover("https://example.com/second.jpg");
		const second = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover");

		expect(second).not.toBe(first);
		expect(second?.getAttribute("src")).toBe("https://example.com/second.jpg");
		expect(root?.classList.contains("cover-missing")).toBe(true);
		second?.dispatchEvent(new Event("load"));
		expect(root?.classList.contains("cover-missing")).toBe(false);
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

	test.each([
		["reduced motion", { reduceMotion: true }],
		["disabled motion", { motionEnabled: false }],
	])("replaces a loaded cover immediately for %s", async (_label, setting) => {
		vi.useFakeTimers();
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		session.setCover("https://example.com/a.jpg");
		const a = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover") as HTMLImageElement;
		a.dispatchEvent(new Event("load"));
		session.applySettings({ ...DEFAULT_SETTINGS, ...setting });
		session.setCover("https://example.com/b.jpg");
		const b = pipWindow.document.querySelectorAll<HTMLImageElement>(".pip-cover")[1];

		b.dispatchEvent(new Event("load"));

		expect(Array.from(pipWindow.document.querySelectorAll(".pip-cover"))).toEqual([b]);
		expect(b.dataset.coverState).toBe("active");
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each([
		["reduced motion", { reduceMotion: true }],
		["disabled motion", { motionEnabled: false }],
	])("finishes an active cover crossfade immediately when applying %s", async (_label, setting) => {
		vi.useFakeTimers();
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open(DEFAULT_SETTINGS, "");
		session.setCover("https://example.com/a.jpg");
		const a = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover") as HTMLImageElement;
		a.dispatchEvent(new Event("load"));
		session.setCover("https://example.com/b.jpg");
		const b = pipWindow.document.querySelectorAll<HTMLImageElement>(".pip-cover")[1];
		b.dispatchEvent(new Event("load"));
		expect(Array.from(pipWindow.document.querySelectorAll(".pip-cover"))).toEqual([a, b]);

		session.applySettings({ ...DEFAULT_SETTINGS, ...setting });

		expect(Array.from(pipWindow.document.querySelectorAll(".pip-cover"))).toEqual([b]);
		expect(b.dataset.coverState).toBe("active");
		expect(b.style.transition).toBe("none");
		expect(vi.getTimerCount()).toBe(0);
	});

	test("uses newly applied settings for subsequent cover requests", async () => {
		vi.useFakeTimers();
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};

		const session = await new DocumentPipController().open({ ...DEFAULT_SETTINGS, reduceMotion: true }, "");
		session.setCover("https://example.com/a.jpg");
		const a = pipWindow.document.querySelector<HTMLImageElement>(".pip-cover") as HTMLImageElement;
		a.dispatchEvent(new Event("load"));
		session.applySettings(DEFAULT_SETTINGS);
		session.setCover("https://example.com/b.jpg");
		const b = pipWindow.document.querySelectorAll<HTMLImageElement>(".pip-cover")[1];

		b.dispatchEvent(new Event("load"));

		expect(Array.from(pipWindow.document.querySelectorAll(".pip-cover"))).toEqual([a, b]);
		expect(a.dataset.coverState).toBe("outgoing");
		expect(b.dataset.coverState).toBe("incoming");
		expect(vi.getTimerCount()).toBe(1);
	});

	test("destroys cover state on pagehide and makes the stale session harmless", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};
		const controller = new DocumentPipController();
		const session = await controller.open(DEFAULT_SETTINGS, "");
		session.setCover("https://example.com/a.jpg");
		const root = pipWindow.document.querySelector<HTMLElement>("#aura-lyrics-root");
		const pagehide = vi.mocked(pipWindow.addEventListener).mock.calls.find(([eventName]) => eventName === "pagehide")?.[1];

		if (typeof pagehide === "function") pagehide.call(pipWindow, new Event("pagehide"));

		expect(pipWindow.document.querySelector(".pip-cover")).toBeNull();
		expect(root?.classList.contains("cover-missing")).toBe(true);
		session.setCover("https://example.com/stale.jpg");
		expect(pipWindow.document.querySelector(".pip-cover")).toBeNull();
		expect(controller.isOpen()).toBe(false);
	});

	test("destroys cover state on close and makes the stale session harmless", async () => {
		const pipWindow = createPipWindow();
		window.documentPictureInPicture = {
			requestWindow: vi.fn(async () => pipWindow),
		};
		const controller = new DocumentPipController();
		const session = await controller.open(DEFAULT_SETTINGS, "");
		session.setCover("https://example.com/a.jpg");

		controller.close();

		expect(pipWindow.document.querySelector(".pip-cover")).toBeNull();
		session.setCover("https://example.com/stale.jpg");
		expect(pipWindow.document.querySelector(".pip-cover")).toBeNull();
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

		const controller = new DocumentPipController();
		const session = await controller.open(DEFAULT_SETTINGS, "");
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
		expect(root?.style.getPropertyValue("--pip-synthetic-wake-color")).toBe(theme.syntheticWakeForeground);
		expect(root?.style.getPropertyValue("--pip-synthetic-wake-rgb")).toBe(theme.syntheticWakeRgb);
		expect(root?.style.getPropertyValue("--pip-muted-foreground-color")).toBe(theme.mutedForeground);
		expect(root?.style.getPropertyValue("--pip-muted-rgb")).toBe(theme.mutedRgb);
		expect(root?.style.getPropertyValue("--pip-glow-rgb")).toBe(theme.glowRgb);
		expect(root?.style.getPropertyValue("--pip-scrim-rgb")).toBe(theme.scrimRgb);
		expect(root?.style.getPropertyValue("--pip-scrim-opacity")).toBe(String(theme.scrimOpacity));
		expect(root?.dataset.surfaceTone).toBe(theme.surfaceTone);

		session.applyTheme(undefined);
		for (const property of THEME_CSS_PROPERTIES) {
			expect(root?.style.getPropertyValue(property)).toBe("");
		}
		expect(root?.dataset.surfaceTone).toBeUndefined();

		session.applyTheme(theme);
		controller.close();
		expect(root?.style.getPropertyValue("--pip-synthetic-wake-color")).toBe("");
		expect(root?.style.getPropertyValue("--pip-synthetic-wake-rgb")).toBe("");
	});
});
