import { expect, type Page, test } from "@playwright/test";

type ScenarioName =
	| "album-art-instrumental"
	| "aurora-intro-ready"
	| "aurora-loading-dark"
	| "aurora-metadata-light"
	| "background-opposite"
	| "frame-interlude"
	| "highlight-marker-wave"
	| "interlude-dots"
	| "interlude-wave"
	| "line-sync"
	| "provider-credit"
	| "reduced-motion-lyrics"
	| "static-document"
	| "translated-line"
	| "word-sync"
	| "synthetic-word-sync"
	| "korean-tail"
	| "multiline-active-row"
	| "parenthetical-echo"
	| "settings-general"
	| "settings-lyrics"
	| "settings-appearance"
	| "settings-motion"
	| "settings-providers"
	| "settings-advanced"
	| "settings-lyrics-ko"
	| "settings-providers-ja";

type TransitionScenarioName = "metadata-next" | "metadata-previous" | "outro-up" | "reduced-motion-next" | "short-tail-next";
type TransitionPhase = "start" | "mid";

type RectSnapshot = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type ChromeRects = Record<"border" | "close" | "controls", RectSnapshot>;

type CoverHarnessState = {
	lastAnimate: boolean | null;
	planes: Array<{
		duration: string;
		inlineTransition: string;
		state: string | null;
	}>;
};

type TransitionPolicyState = {
	durationSec: number;
	metadataSkipped: boolean;
	thresholdSec: number | null;
	updateTimestampSec: number;
};

declare global {
	interface Window {
		auraVisualHarness?: {
			completeTransition(): Promise<void>;
			getCoverState(): CoverHarnessState;
			getTransitionChromeBaseline(): ChromeRects;
			getTransitionPolicyState(): TransitionPolicyState;
			renderScenario(name: ScenarioName, timestamp?: number): void;
			renderTransitionScenario(name: TransitionScenarioName, phase?: TransitionPhase): void;
		};
	}
}

const baseUrl = process.env.AURA_VISUAL_BASE_URL ?? "http://127.0.0.1:4173";
const centerTolerancePx = 18;
const syllableCenterTolerancePx = 36;
const screenshotTolerance = {
	maxDiffPixelRatio: process.env.CI ? 0.12 : 0.04,
};
const transitionScreenshotOptions = {
	...screenshotTolerance,
	animations: "allow" as const,
};

test.use({
	viewport: { width: 900, height: 520 },
});

test.beforeEach(async ({ page }) => {
	await page.goto(baseUrl);
	await expect(page.locator("#aura-lyrics-root")).toBeVisible();
});

test("visual harness uses the production cover layer structure", async ({ page }) => {
	const cover = page.locator("#aura-lyrics-root > .pip-cover-layer > .pip-cover");

	await expect(cover).toHaveCount(1);
	await expect(cover).toHaveAttribute("data-cover-state", "active");
	const state = await coverState(page);
	expect(state).toEqual({
		lastAnimate: false,
		planes: [{ duration: "0s", inlineTransition: "none", state: "active" }],
	});
});

test("lyrics outro moves up into persistent metadata at deterministic start, midpoint, and completion", async ({ page }) => {
	await renderTransitionScenario(page, "outro-up", "start");
	let metrics = await transitionMetrics(page);

	expect(metrics.transitionClass).toBe("scene-transition-up");
	expect(metrics.planeCount).toBe(2);
	expect(metrics.outgoing?.translationY).toBeCloseTo(0, 1);
	expect(metrics.incoming?.translationY ?? 0).toBeGreaterThan(400);
	expect(metrics.incoming?.rect.y ?? 0).toBeGreaterThan(metrics.outgoing?.rect.y ?? 0);
	expect(metrics.outgoingLastLineState).toEqual({ active: false, sung: true });
	expect(await transitionPolicyState(page)).toEqual({
		durationSec: 210,
		metadataSkipped: false,
		thresholdSec: 10,
		updateTimestampSec: 10,
	});
	await expectChromeToStayFixed(page);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("outro-up-start.png", transitionScreenshotOptions);

	await renderTransitionScenario(page, "outro-up", "mid");
	metrics = await transitionMetrics(page);
	expect(metrics.outgoing?.translationY ?? 0).toBeLessThan(0);
	expect(metrics.incoming?.translationY ?? 0).toBeGreaterThan(0);
	expect(Math.abs(metrics.outgoing?.translationX ?? 0)).toBeLessThan(1);
	expect(Math.abs(metrics.incoming?.translationX ?? 0)).toBeLessThan(1);
	await expectChromeToStayFixed(page);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("outro-up-mid.png", transitionScreenshotOptions);

	await completeTransition(page);
	metrics = await transitionMetrics(page);
	expect(metrics.planeCount).toBe(0);
	expect(metrics.rootChildCount).toBe(1);
	expect(metrics.transitionClass).toBeNull();
	expect(metrics.visibleTitle).toBe("Current Horizon");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("outro-up-complete.png", transitionScreenshotOptions);
});

test("next metadata moves left and completes with only the next scene", async ({ page }) => {
	await renderTransitionScenario(page, "metadata-next", "start");
	let metrics = await transitionMetrics(page);
	expect(metrics.outgoing?.translationX).toBeCloseTo(0, 1);
	expect(metrics.incoming?.translationX ?? 0).toBeGreaterThan(800);
	expect(metrics.incoming?.rect.x ?? 0).toBeGreaterThan(metrics.outgoing?.rect.x ?? 0);
	await expectChromeToStayFixed(page);

	await renderTransitionScenario(page, "metadata-next", "mid");
	metrics = await transitionMetrics(page);

	expect(metrics.transitionClass).toBe("scene-transition-next");
	expect(metrics.outgoing?.translationX ?? 0).toBeLessThan(0);
	expect(metrics.incoming?.translationX ?? 0).toBeGreaterThan(0);
	expect(Math.abs(metrics.outgoing?.translationY ?? 0)).toBeLessThan(1);
	expect(Math.abs(metrics.incoming?.translationY ?? 0)).toBeLessThan(1);
	expect(metrics.outgoingTitle).toBe("Current Horizon");
	expect(metrics.incomingTitle).toBe("Next Light");
	expect(await coverState(page)).toEqual({
		lastAnimate: true,
		planes: [
			{ duration: "0.36s", inlineTransition: "", state: "outgoing" },
			{ duration: "0.36s", inlineTransition: "", state: "incoming" },
		],
	});
	await expectChromeToStayFixed(page);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("metadata-next-mid.png", transitionScreenshotOptions);

	await completeTransition(page);
	metrics = await transitionMetrics(page);
	expect(metrics.planeCount).toBe(0);
	expect(metrics.rootChildCount).toBe(1);
	expect(metrics.visibleTitle).toBe("Next Light");
	expect((await coverState(page)).planes).toEqual([{ duration: "0.36s", inlineTransition: "", state: "active" }]);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("metadata-next-complete.png", transitionScreenshotOptions);
});

test("previous metadata moves right and completes with only the previous scene", async ({ page }) => {
	await renderTransitionScenario(page, "metadata-previous", "start");
	let metrics = await transitionMetrics(page);
	expect(metrics.outgoing?.translationX).toBeCloseTo(0, 1);
	expect(metrics.incoming?.translationX ?? 0).toBeLessThan(-800);
	expect(metrics.incoming?.rect.x ?? 0).toBeLessThan(metrics.outgoing?.rect.x ?? 0);
	await expectChromeToStayFixed(page);

	await renderTransitionScenario(page, "metadata-previous", "mid");
	metrics = await transitionMetrics(page);

	expect(metrics.transitionClass).toBe("scene-transition-previous");
	expect(metrics.outgoing?.translationX ?? 0).toBeGreaterThan(0);
	expect(metrics.incoming?.translationX ?? 0).toBeLessThan(0);
	expect(Math.abs(metrics.outgoing?.translationY ?? 0)).toBeLessThan(1);
	expect(Math.abs(metrics.incoming?.translationY ?? 0)).toBeLessThan(1);
	expect(metrics.outgoingTitle).toBe("Current Horizon");
	expect(metrics.incomingTitle).toBe("Before Dawn");
	await expectChromeToStayFixed(page);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("metadata-previous-mid.png", transitionScreenshotOptions);

	await completeTransition(page);
	metrics = await transitionMetrics(page);
	expect(metrics.planeCount).toBe(0);
	expect(metrics.rootChildCount).toBe(1);
	expect(metrics.visibleTitle).toBe("Before Dawn");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("metadata-previous-complete.png", transitionScreenshotOptions);
});

test("short-tail sequence skips current metadata but keeps the leftward next transition", async ({ page }) => {
	await renderTransitionScenario(page, "short-tail-next", "mid");
	let metrics = await transitionMetrics(page);

	expect(metrics.transitionClass).toBe("scene-transition-next");
	expect(metrics.outgoing?.translationX ?? 0).toBeLessThan(0);
	expect(metrics.incoming?.translationX ?? 0).toBeGreaterThan(0);
	expect(metrics.outgoingTitle).toBeNull();
	expect(metrics.incomingTitle).toBe("Next Light");
	expect(metrics.allTitles).not.toContain("Current Horizon");
	expect(metrics.outgoingHasLyrics).toBe(true);
	expect(metrics.outgoingLastLineState).toEqual({ active: false, sung: true });
	expect(await transitionPolicyState(page)).toEqual({
		durationSec: 5.5,
		metadataSkipped: true,
		thresholdSec: null,
		updateTimestampSec: 5.5,
	});
	await expectChromeToStayFixed(page);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("short-tail-next-mid.png", transitionScreenshotOptions);

	await completeTransition(page);
	metrics = await transitionMetrics(page);
	expect(metrics.planeCount).toBe(0);
	expect(metrics.rootChildCount).toBe(1);
	expect(metrics.visibleTitle).toBe("Next Light");
});

test("reduced motion presents the final next scene immediately without duplicate planes", async ({ page }) => {
	await renderTransitionScenario(page, "reduced-motion-next", "mid");
	const metrics = await transitionMetrics(page);
	const coverTransitionDuration = await page.locator(".pip-cover").evaluate((cover) => getComputedStyle(cover).transitionDuration);

	expect(metrics.planeCount).toBe(0);
	expect(metrics.rootChildCount).toBe(1);
	expect(metrics.transitionClass).toBeNull();
	expect(metrics.visibleTitle).toBe("Next Light");
	expect(coverTransitionDuration).toBe("0s");
	expect(await coverState(page)).toEqual({
		lastAnimate: false,
		planes: [{ duration: "0s", inlineTransition: "none", state: "active" }],
	});
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("metadata-next-reduced-motion.png", transitionScreenshotOptions);
});

test("Aurora intro-ready metadata shows only the track identity on the adaptive dark surface", async ({ page }) => {
	await renderScenario(page, "aurora-intro-ready");

	const metrics = await metadataMetrics(page);

	expect(metrics).toMatchObject({
		backgroundCoverOpacity: "0.95",
		backgroundCoverTransitionDuration: "0s",
		eyebrow: null,
		title: "Midnight Bloom",
		byline: "Haneul Park · Afterglow",
		hasProgress: false,
		surfaceTone: "dark",
		foregroundVariable: "#ffffff",
		titleColor: "rgb(255, 255, 255)",
		controlsOpacity: "1",
		playColor: "rgb(17, 20, 24)",
	});
	expect(metrics.coverWidth).toBeGreaterThan(60);
	expect(metrics.coverSource).toContain("data:image/svg+xml");
	await expect(page.locator(".track-metadata-scene.intro")).toBeVisible();
	await expect(page.locator(".track-metadata-eyebrow")).toHaveCount(0);
	await expect(page.locator(".track-metadata-progress")).toHaveCount(0);
	await expect(page.getByText("LOADING", { exact: true })).toHaveCount(0);
	await expect(page.getByText("NOW PLAYING", { exact: true })).toHaveCount(0);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("aurora-intro-ready.png", screenshotTolerance);
});

test("Aurora loading metadata stays editorial and readable on a dark album", async ({ page }) => {
	await renderScenario(page, "aurora-loading-dark");

	const metrics = await metadataMetrics(page);

	expect(metrics).toMatchObject({
		eyebrow: "LOADING",
		title: "Midnight Bloom",
		byline: "Haneul Park · Afterglow",
		hasProgress: true,
		surfaceTone: "dark",
		foregroundVariable: "#ffffff",
		titleColor: "rgb(255, 255, 255)",
		controlsOpacity: "1",
		playColor: "rgb(17, 20, 24)",
	});
	expect(metrics.progressWidth).toBeGreaterThan(120);
	expect(metrics.controlsBackground).toContain("rgba(255, 255, 255");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("aurora-loading-dark.png", screenshotTolerance);
});

test("Aurora persistent metadata uses near-black text without a loading label on a light album", async ({ page }) => {
	await renderScenario(page, "aurora-metadata-light");

	const metrics = await metadataMetrics(page);

	expect(metrics).toMatchObject({
		eyebrow: null,
		title: "Sunlit Letters",
		byline: "Mira Lee · Paper Skies",
		hasProgress: false,
		surfaceTone: "light",
		foregroundVariable: "#090b0f",
		titleColor: "rgb(9, 11, 15)",
		controlsOpacity: "1",
		playColor: "rgb(17, 20, 24)",
	});
	expect(metrics.controlsBackground).toContain("rgba(255, 255, 255");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("aurora-metadata-light.png", screenshotTolerance);
});

test("settings modal keeps its dark desktop sidebar layout within the viewport", async ({ page }) => {
	await page.setViewportSize({ width: 1024, height: 760 });
	await renderScenario(page, "settings-general");

	const metrics = await page.evaluate(() => {
		const modal = document.querySelector<HTMLElement>(".main-trackCreditsModal-container");
		const navigation = document.querySelector<HTMLElement>(".settings-navigation");
		const panel = document.querySelector<HTMLElement>(".settings-panel-scroll");
		if (!modal || !navigation || !panel) {
			throw new Error("Missing settings modal elements.");
		}
		const modalRect = modal.getBoundingClientRect();
		const navigationRect = navigation.getBoundingClientRect();
		const panelRect = panel.getBoundingClientRect();

		return {
			modalBottom: modalRect.bottom,
			modalTop: modalRect.top,
			navigationWidth: Math.round(navigationRect.width),
			panelWidth: Math.round(panelRect.width),
			orientation: navigation.getAttribute("aria-orientation"),
			background: getComputedStyle(modal).backgroundColor,
		};
	});

	expect(metrics.modalTop).toBeGreaterThanOrEqual(16);
	expect(metrics.modalBottom).toBeLessThanOrEqual(744);
	expect(metrics.navigationWidth).toBe(200);
	expect(metrics.panelWidth).toBeGreaterThan(600);
	expect(metrics.orientation).toBe("vertical");
	expect(metrics.background).toBe("rgb(13, 13, 15)");
	await expect(page.locator(".main-trackCreditsModal-container")).toHaveScreenshot("settings-dark-sidebar.png", screenshotTolerance);
});

test("settings lyrics panel keeps the current-song delay card readable and reachable", async ({ page }) => {
	await page.setViewportSize({ width: 1024, height: 760 });
	await renderScenario(page, "settings-lyrics");

	const card = page.locator('[data-control-id="current-track-delay"]');
	await expect(card).toBeVisible();
	await expect(card).toContainText("Midnight Bloom");
	await expect(card).toContainText("+150 ms");
	await expect(card).toContainText("Song-specific setting");
	await expect(card.locator("button")).toHaveCount(5);
	await expect(page.locator('[data-control-id="track-delay-minus-100"]')).toHaveAttribute("aria-label", "Adjust current song lyrics by -100 ms");
	await expect(page.locator('[data-control-id="track-delay-plus-100"]')).toHaveAttribute("aria-label", "Adjust current song lyrics by +100 ms");
	await expect(page.locator(".main-trackCreditsModal-container")).toHaveScreenshot("settings-track-delay.png", screenshotTolerance);
});

for (const [scenario, snapshot] of [
	["settings-appearance", "settings-appearance.png"],
	["settings-motion", "settings-motion.png"],
	["settings-providers", "settings-providers.png"],
	["settings-advanced", "settings-advanced.png"],
] as const) {
	test(`${scenario} keeps the desktop information groups inside the shared shell`, async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 760 });
		await renderScenario(page, scenario);

		await expect(page.locator(".settings-group").first()).toBeVisible();
		await expect(page.locator(".settings-feedback")).toBeVisible();
		await expect(page.locator(".main-trackCreditsModal-container")).toHaveScreenshot(snapshot, screenshotTolerance);
	});
}

test("highlight settings update the compact preview independently", async ({ page }) => {
	await page.setViewportSize({ width: 1024, height: 760 });
	await renderScenario(page, "settings-appearance");

	await page.locator('[data-control-id="highlight-effect"]').selectOption("marker");
	await page.locator('[data-control-id="highlight-motion"]').selectOption("wave");
	const preview = page.locator(".highlight-preview");
	await preview.scrollIntoViewIfNeeded();
	await expect(preview).toHaveAttribute("data-effect", "marker");
	await expect(preview).toHaveAttribute("data-motion", "wave");
	await expect(preview).toHaveAccessibleName("Highlight preview");
	await expect(page.locator('[data-control-id="highlight-effect"]')).toHaveValue("marker");
	await expect(page.locator('[data-control-id="highlight-motion"]')).toHaveValue("wave");
	await expect(page.locator(".main-trackCreditsModal-container")).toHaveScreenshot("settings-highlight-preview.png", screenshotTolerance);
});

test("compact Korean lyrics settings keep long descriptions and touch targets readable", async ({ page }) => {
	await page.setViewportSize({ width: 640, height: 760 });
	await renderScenario(page, "settings-lyrics-ko");

	await expect(page.locator('[data-control-id="current-track-delay"]')).toBeVisible();
	await expect(page.locator(".settings-navigation")).toHaveAttribute("aria-orientation", "horizontal");
	const buttonHeight = await page.locator('[data-control-id="track-delay-plus-50"]').evaluate((button) => button.getBoundingClientRect().height);
	expect(buttonHeight).toBeGreaterThanOrEqual(44);
	await expect(page.locator(".main-trackCreditsModal-container")).toHaveScreenshot("settings-lyrics-ko-compact.png", screenshotTolerance);
});

test("mobile Japanese provider settings keep masked credentials and 44px reorder targets", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 760 });
	await renderScenario(page, "settings-providers-ja");

	await expect(page.locator('[data-control-id="musixmatch-token"]')).toHaveAttribute("type", "password");
	const reorderHeight = await page.locator('[data-control-id="provider-lrclib-up"]').evaluate((button) => button.getBoundingClientRect().height);
	expect(reorderHeight).toBeGreaterThanOrEqual(44);
	await expect(page.locator(".main-trackCreditsModal-container")).toHaveScreenshot("settings-providers-ja-mobile.png", screenshotTolerance);
});

test("static lyrics use a manually scrollable document layout with translation", async ({ page }) => {
	await page.setViewportSize({ width: 600, height: 600 });
	await renderScenario(page, "static-document");
	const metrics = await page.locator(".static-lyrics-viewport").evaluate((viewport) => ({
		overflowY: getComputedStyle(viewport).overflowY,
		tabIndex: (viewport as HTMLElement).tabIndex,
		trackTransform: (viewport.querySelector(".static-lyrics-track") as HTMLElement | null)?.style.transform ?? null,
	}));

	expect(metrics).toEqual({ overflowY: "auto", tabIndex: 0, trackTransform: "" });
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("static-lyrics-document.png", screenshotTolerance);
});

test("translated line lyrics remain readable in a 480 by 270 PiP", async ({ page }) => {
	await page.setViewportSize({ width: 480, height: 270 });
	await renderScenario(page, "translated-line");

	await expect(page.locator(".line-group.active .lyric-translation")).toHaveText("Starlight shines on us");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("translated-line-480x270.png", screenshotTolerance);
});

test("a 320 by 180 PiP shows only the active lyric row", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 180 });
	await renderScenario(page, "line-sync");

	await expect(page.locator(".line-group:not(.out-of-context)")).toHaveCount(1);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("line-sync-320x180.png", screenshotTolerance);
});

for (const [scenario, snapshot] of [
	["interlude-dots", "interlude-dots.png"],
	["interlude-wave", "interlude-wave.png"],
	["reduced-motion-lyrics", "lyrics-reduced-motion.png"],
	["provider-credit", "provider-credit.png"],
] as const) {
	test(`${scenario} matches the shared lyric presentation`, async ({ page }) => {
		await page.setViewportSize({ width: 600, height: 600 });
		await renderScenario(page, scenario);
		if (scenario === "provider-credit") {
			const credit = page.locator(".provider-credit");
			await expect(credit.filter({ has: page.locator(".provider-credit-label") })).toHaveCount(1);
			await expect(credit).toHaveClass(/active/);
			await expect(credit).not.toHaveClass(/out-of-context/);
			await expect(credit).toHaveCSS("opacity", "1");
			const creditBox = await credit.boundingBox();
			expect(creditBox).not.toBeNull();
			expect(creditBox?.y).toBeGreaterThanOrEqual(0);
			expect((creditBox?.y ?? 0) + (creditBox?.height ?? 0)).toBeLessThanOrEqual(600);
			await expect(page.locator(".line-group:not(.out-of-context)")).toHaveCount(0);
			await expect(page.locator(".line-group").first()).toHaveCSS("opacity", "0");
		}
		await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot(snapshot, screenshotTolerance);
	});
}

test("synthetic karaoke uses the themed syllable wake without a visible timing marker", async ({ page }) => {
	await renderScenario(page, "synthetic-word-sync");

	const metrics = await page.evaluate(() => {
		const lyrics = document.querySelector<HTMLElement>(".aura-lyrics");
		const activeSyllable = document.querySelector<HTMLElement>(".syllable-group.active .syllable.active");
		const activeGroup = document.querySelector<HTMLElement>(".vocals-group.syllable-group.active");
		const pipRoot = document.querySelector<HTMLElement>("#aura-lyrics-root");
		if (!lyrics || !activeSyllable || !activeGroup || !pipRoot) {
			throw new Error("Missing synthetic syllable wake elements.");
		}
		const descriptionId = lyrics.getAttribute("aria-describedby");
		const description = descriptionId ? document.getElementById(descriptionId) : null;
		const wakeColor = pipRoot.style.getPropertyValue("--pip-synthetic-wake-color");
		const wakeRgb = pipRoot.style.getPropertyValue("--pip-synthetic-wake-rgb");
		const colorProbe = document.createElement("span");
		colorProbe.style.color = wakeColor;
		document.body.append(colorProbe);
		const computedWakeColor = getComputedStyle(colorProbe).color;
		colorProbe.remove();
		const activeStyle = getComputedStyle(activeSyllable);
		const haloStyle = getComputedStyle(activeGroup, "::after");
		const syntheticStyleSource = Array.from(document.querySelectorAll("style"))
			.map((style) => style.textContent ?? "")
			.find((source) => source.includes('.aura-lyrics.synthetic-timing[data-highlight-effect="fill"] .syllable.active'));
		const gradientProgress = activeSyllable.style.getPropertyValue("--gradient-progress");
		return {
			hasSyntheticClass: lyrics.classList.contains("synthetic-timing"),
			timingSource: lyrics.dataset.timingSource,
			descriptionId,
			descriptionText: description?.textContent ?? null,
			descriptionIsLocalizedNode: description?.hasAttribute("data-aura-synthetic-description") ?? false,
			legacyClassMarkerCount: document.querySelectorAll(".aura-timing-marker").length,
			legacyDataMarkerCount: document.querySelectorAll("[data-aura-timing-marker]").length,
			wakeColor,
			wakeRgb,
			computedWakeColor,
			backgroundImage: activeStyle.backgroundImage,
			syntheticStyleSource: syntheticStyleSource ?? "",
			gradientProgress,
			gradientProgressValue: Number.parseFloat(gradientProgress),
			halo: {
				content: haloStyle.content,
				opacity: Number.parseFloat(haloStyle.opacity),
				animationName: haloStyle.animationName,
				position: haloStyle.position,
				pointerEvents: haloStyle.pointerEvents,
			},
		};
	});

	expect(metrics.hasSyntheticClass).toBe(true);
	expect(metrics.timingSource).toBe("synthetic");
	expect(metrics.descriptionId).toMatch(/^aura-synthetic-timing-description-\d+$/);
	expect(metrics.descriptionText).toBe("Synthesized karaoke sync");
	expect(metrics.descriptionIsLocalizedNode).toBe(true);
	expect(metrics.legacyClassMarkerCount).toBe(0);
	expect(metrics.legacyDataMarkerCount).toBe(0);
	expect(metrics.wakeColor).not.toBe("#ffffff");
	expect(metrics.wakeRgb).not.toBe("255, 255, 255");
	expect(metrics.backgroundImage).toContain("linear-gradient");
	expect(metrics.backgroundImage).toContain(metrics.computedWakeColor);
	expect(metrics.syntheticStyleSource).toContain("var(--pip-synthetic-wake-color)");
	expect(metrics.gradientProgress).toMatch(/^\d+(?:\.\d+)?%$/);
	expect(metrics.gradientProgressValue).toBeGreaterThan(0);
	expect(metrics.gradientProgressValue).toBeLessThan(100);
	expect(metrics.halo.content).toBe('""');
	expect(metrics.halo.opacity).toBeGreaterThan(0);
	expect(metrics.halo.opacity).toBeLessThanOrEqual(0.16);
	expect(metrics.halo.animationName).toBe("synthetic-wake-halo-breathe");
	expect(metrics.halo.position).toBe("absolute");
	expect(metrics.halo.pointerEvents).toBe("none");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("synthetic-syllable-wake.png", screenshotTolerance);
});

test("line-sync rows stay centered without changing lyric layout width", async ({ page }) => {
	await renderScenario(page, "line-sync");

	const metrics = await page.evaluate(() => {
		const rectFor = (selector: string): DOMRect => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) {
				throw new Error(`Missing element for ${selector}`);
			}
			return element.getBoundingClientRect();
		};
		const centerY = (rect: DOMRect): number => rect.top + rect.height / 2;
		const viewport = rectFor(".lyrics-viewport");
		const activeRow = rectFor(".line-group.active");
		const lineWidths = Array.from(document.querySelectorAll<HTMLElement>(".line-group .line"))
			.filter((line) => line.textContent === "Same lyric width stays steady")
			.map((line) => line.offsetWidth);
		const lines = Array.from(document.querySelectorAll<HTMLElement>(".line-group .line"));
		const lineGaps = lines.slice(1).map((line, index) => Math.round(line.getBoundingClientRect().top - lines[index].getBoundingClientRect().bottom));

		return {
			activeCenterDelta: Math.abs(centerY(activeRow) - centerY(viewport)),
			maxWidthDelta: Math.max(...lineWidths) - Math.min(...lineWidths),
			lineGaps,
		};
	});

	expect(metrics.activeCenterDelta).toBeLessThanOrEqual(centerTolerancePx);
	expect(metrics.maxWidthDelta).toBeLessThanOrEqual(1);
	expect(metrics.lineGaps.every((gap) => gap >= 18 && gap <= 72)).toBe(true);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("line-sync-active.png", screenshotTolerance);
});

test("word and syllable sync keeps readable tracking and visible glow", async ({ page }) => {
	await renderScenario(page, "word-sync");

	const metrics = await wordRowMetrics(page, ".syllable-row.active .syllable-main .word");
	const glow = await glowMetrics(page, ".syllable-row.active");
	const nativeState = await page.evaluate(() => {
		const lyrics = document.querySelector<HTMLElement>(".aura-lyrics");
		const activeSyllable = document.querySelector<HTMLElement>(".syllable-group.active .syllable.active");
		const activeGroup = document.querySelector<HTMLElement>(".vocals-group.syllable-group.active");
		if (!lyrics || !activeSyllable || !activeGroup) {
			throw new Error("Missing native syllable elements.");
		}
		return {
			hasSyntheticClass: lyrics.classList.contains("synthetic-timing"),
			timingSource: lyrics.dataset.timingSource ?? null,
			describedBy: lyrics.getAttribute("aria-describedby"),
			syntheticDescriptionCount: document.querySelectorAll("[data-aura-synthetic-description]").length,
			wakeSyllableSelectorMatches: activeSyllable.matches(".aura-lyrics.synthetic-timing .syllable.active"),
			wakeHaloSelectorMatches: activeGroup.matches(".aura-lyrics.synthetic-timing .vocals-group.syllable-group.active"),
		};
	});

	expect(metrics.activeCenterDelta).toBeLessThanOrEqual(syllableCenterTolerancePx);
	expect(metrics.minGap).toBeGreaterThanOrEqual(-1);
	expect(metrics.maxGap).toBeLessThanOrEqual(32);
	expect(glow.trackOverflow).toEqual({ x: "visible", y: "visible" });
	expect(glow.glowTop).toBeGreaterThanOrEqual(glow.viewportTop);
	expect(glow.glowBottom).toBeLessThanOrEqual(glow.viewportBottom);
	expect(nativeState).toEqual({
		hasSyntheticClass: false,
		timingSource: null,
		describedBy: null,
		syntheticDescriptionCount: 0,
		wakeSyllableSelectorMatches: false,
		wakeHaloSelectorMatches: false,
	});
	await expect(page.locator(".pip-cover")).toHaveCSS("opacity", "0.95");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("word-sync-active.png", screenshotTolerance);
});

test("marker and wave combine on existing syllable timing", async ({ page }) => {
	await renderScenario(page, "highlight-marker-wave");

	const metrics = await page.evaluate(() => {
		const scene = document.querySelector<HTMLElement>(".aura-lyrics");
		const active = document.querySelector<HTMLElement>(".syllable.active");
		if (!scene || !active) {
			throw new Error("Missing highlighted syllable scene.");
		}
		const marker = getComputedStyle(active, "::before");
		return {
			effect: scene.dataset.highlightEffect,
			motion: scene.dataset.highlightMotion,
			progress: active.style.getPropertyValue("--highlight-progress"),
			transform: active.style.transform,
			markerContent: marker.content,
			markerBackground: marker.backgroundColor,
		};
	});

	expect(metrics.effect).toBe("marker");
	expect(metrics.motion).toBe("wave");
	expect(Number.parseFloat(metrics.progress)).toBeGreaterThan(0);
	expect(metrics.transform).toContain("rotate(");
	expect(metrics.markerContent).toBe('""');
	expect(metrics.markerBackground).not.toBe("rgba(0, 0, 0, 0)");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("highlight-marker-wave.png", screenshotTolerance);
});

test("parenthetical echoes stay right aligned and keep stable flow before and during interaction", async ({ page }) => {
	await page.setViewportSize({ width: 480, height: 300 });
	const measure = async (timestamp: number) => {
		await renderScenario(page, "parenthetical-echo", timestamp);
		return page.evaluate(() => {
			const rows = Array.from(document.querySelectorAll<HTMLElement>(".syllable-row"));
			const row = rows.find((candidate) => candidate.classList.contains("has-parenthetical-echo"));
			const echo = row?.querySelector<HTMLElement>(".syllable-echo");
			const next = row ? rows[rows.indexOf(row) + 1] : undefined;
			const group = row?.closest<HTMLElement>(".vocals-group");
			if (!row || !echo || !next || !group) {
				throw new Error("Missing parenthetical echo rows.");
			}
			const rowRect = row.getBoundingClientRect();
			const echoRect = echo.getBoundingClientRect();
			const nextRect = next.getBoundingClientRect();
			const style = getComputedStyle(echo);
			const groupStyle = getComputedStyle(group);
			return {
				layoutHeight: row.offsetHeight,
				paddingBlockStart: groupStyle.paddingBlockStart,
				paddingBlockEnd: groupStyle.paddingBlockEnd,
				rightDelta: Math.abs(rowRect.right - echoRect.right),
				nextGap: nextRect.top - echoRect.bottom,
				justifyContent: style.justifyContent,
				textAlign: style.textAlign,
			};
		});
	};

	const before = await measure(-0.2);
	const active = await measure(3.4);

	expect(before.justifyContent).toBe("flex-end");
	expect(before.textAlign).toBe("right");
	expect(before.rightDelta).toBeLessThanOrEqual(1);
	expect(before.nextGap).toBeGreaterThanOrEqual(0);
	expect(active.layoutHeight).toBe(before.layoutHeight);
	expect(active.paddingBlockStart).toBe(before.paddingBlockStart);
	expect(active.paddingBlockEnd).toBe(before.paddingBlockEnd);
	expect(active.rightDelta).toBeLessThanOrEqual(1);
	expect(active.nextGap).toBeGreaterThanOrEqual(0);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("parenthetical-echo.png", screenshotTolerance);
});

test("Korean tail sustain remains aligned and unclipped", async ({ page }) => {
	await renderScenario(page, "korean-tail");

	const metrics = await page.evaluate(() => {
		const rectFor = (selector: string): DOMRect => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) {
				throw new Error(`Missing element for ${selector}`);
			}
			return element.getBoundingClientRect();
		};
		const centerY = (rect: DOMRect): number => rect.top + rect.height / 2;
		const tailWord = rectFor(".korean-tail-word");
		const base = rectFor(".korean-tail-base");
		const sustain = rectFor(".korean-tail-sustain");
		const viewport = rectFor(".lyrics-viewport");
		const activeRow = rectFor(".syllable-row.active");

		return {
			text: document.querySelector(".korean-tail-word")?.textContent,
			sustainActive: document.querySelector(".korean-tail-sustain")?.classList.contains("active"),
			activeCenterDelta: Math.abs(centerY(activeRow) - centerY(viewport)),
			inlineGap: Math.round(sustain.left - base.right),
			wordWidthDelta: Math.abs(tailWord.width - (base.width + sustain.width)),
		};
	});

	expect(metrics.text).toBe("사랑해");
	expect(metrics.sustainActive).toBe(true);
	expect(metrics.activeCenterDelta).toBeLessThanOrEqual(syllableCenterTolerancePx);
	expect(metrics.inlineGap).toBeLessThanOrEqual(1);
	expect(metrics.wordWidthDelta).toBeLessThanOrEqual(4);
});

test("multi-line active rows center by the whole row and keep glow inside the viewport", async ({ page }) => {
	await page.setViewportSize({ width: 640, height: 520 });
	await renderScenario(page, "multiline-active-row");

	const metrics = await page.evaluate(() => {
		const rectFor = (selector: string): DOMRect => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) {
				throw new Error(`Missing element for ${selector}`);
			}
			return element.getBoundingClientRect();
		};
		const centerY = (rect: DOMRect): number => rect.top + rect.height / 2;
		const viewport = rectFor(".lyrics-viewport");
		const activeRow = rectFor(".line-group.active");
		const activeLine = rectFor(".line-group.active .line");
		const inactiveLineWidths = Array.from(document.querySelectorAll<HTMLElement>(".line-group .line"))
			.filter((line) => line.textContent === "This active lyric wraps across multiple visual lines without changing measure")
			.map((line) => line.offsetWidth);

		return {
			activeCenterDelta: Math.abs(centerY(activeRow) - centerY(viewport)),
			activeLineHeight: activeLine.height,
			widthDelta: Math.max(...inactiveLineWidths) - Math.min(...inactiveLineWidths),
		};
	});
	const glow = await glowMetrics(page, ".line-group.active");

	expect(metrics.activeCenterDelta).toBeLessThanOrEqual(centerTolerancePx);
	expect(metrics.activeLineHeight).toBeGreaterThan(90);
	expect(metrics.widthDelta).toBeLessThanOrEqual(1);
	expect(glow.glowTop).toBeGreaterThanOrEqual(glow.viewportTop);
	expect(glow.glowBottom).toBeLessThanOrEqual(glow.viewportBottom);
});

test("frame interlude stays balanced in a wide short PiP", async ({ page }) => {
	await page.setViewportSize({ width: 960, height: 420 });
	await renderScenario(page, "frame-interlude");

	const metrics = await page.evaluate(() => {
		const pipRoot = document.querySelector<HTMLElement>("#aura-lyrics-root");
		const content = document.querySelector<HTMLElement>(".pip-content");
		const current = document.querySelector<HTMLElement>(".context-current");
		const topSegment = document.querySelector<HTMLElement>(".pip-frame-progress-top");
		if (!pipRoot || !content || !current || !topSegment) {
			throw new Error("Missing frame interlude elements.");
		}
		const top = Number(pipRoot.style.getPropertyValue("--pip-frame-progress-top"));
		const right = Number(pipRoot.style.getPropertyValue("--pip-frame-progress-right"));
		const bottom = Number(pipRoot.style.getPropertyValue("--pip-frame-progress-bottom"));
		const left = Number(pipRoot.style.getPropertyValue("--pip-frame-progress-left"));
		const contentRect = content.getBoundingClientRect();
		const topSegmentRect = topSegment.getBoundingClientRect();

		return {
			frameActive: pipRoot.classList.contains("interlude-frame-active"),
			frameSize: topSegmentRect.height,
			progress: [top, right, bottom, left],
			currentText: current.textContent ?? "",
			contentWidth: contentRect.width,
			contentHeight: contentRect.height,
		};
	});

	expect(metrics.frameActive).toBe(true);
	expect(metrics.frameSize).toBeGreaterThanOrEqual(12);
	expect(metrics.frameSize).toBeLessThanOrEqual(18);
	expect(metrics.progress.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
	expect(metrics.progress[0]).toBe(1);
	expect(metrics.progress[1]).toBeGreaterThan(0);
	expect(metrics.currentText).toContain("After the break returns");
	expect(metrics.contentWidth).toBeGreaterThan(700);
	expect(metrics.contentHeight).toBeGreaterThan(260);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("frame-interlude-wide-short.png", screenshotTolerance);
});

test("instrumental album art mode hides lyrics and shows the cover cleanly", async ({ page }) => {
	await page.setViewportSize({ width: 600, height: 600 });
	await renderScenario(page, "album-art-instrumental");

	const metrics = await page.evaluate(() => {
		const pipRoot = document.querySelector<HTMLElement>("#aura-lyrics-root");
		const cover = document.querySelector<HTMLImageElement>(".pip-cover");
		const content = document.querySelector<HTMLElement>("#aura-visual-root");
		if (!pipRoot || !cover || !content) {
			throw new Error("Missing album art elements.");
		}
		const coverRect = cover.getBoundingClientRect();

		return {
			albumArtMode: pipRoot.classList.contains("album-art-mode"),
			contentChildren: content.children.length,
			albumArtSentinelCount: content.querySelectorAll(":scope > .album-art-scene[aria-hidden='true']").length,
			coverWidth: Math.round(coverRect.width),
			coverHeight: Math.round(coverRect.height),
			coverOpacity: getComputedStyle(cover).opacity,
			objectFit: getComputedStyle(cover).objectFit,
		};
	});

	expect(metrics.albumArtMode).toBe(true);
	expect(metrics.contentChildren).toBe(1);
	expect(metrics.albumArtSentinelCount).toBe(1);
	expect(metrics.coverWidth).toBe(600);
	expect(metrics.coverHeight).toBe(600);
	expect(metrics.coverOpacity).toBe("1");
	expect(metrics.objectFit).toBe("contain");
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("album-art-instrumental.png", screenshotTolerance);
});

test("background opposite vocals stay secondary and opposite aligned", async ({ page }) => {
	await page.setViewportSize({ width: 600, height: 600 });
	await renderScenario(page, "background-opposite");

	const metrics = await page.evaluate(() => {
		const group = document.querySelector<HTMLElement>(".syllable-group");
		const lead = document.querySelector<HTMLElement>(".vocals.lead .lyric");
		const background = document.querySelector<HTMLElement>(".vocals.background .lyric");
		if (!group || !lead || !background) {
			throw new Error("Missing background vocal elements.");
		}
		const leadRect = lead.getBoundingClientRect();
		const backgroundRect = background.getBoundingClientRect();

		return {
			oppositeAligned: group.classList.contains("opposite-aligned"),
			backgroundActive: document.querySelector(".vocals.background.active") !== null,
			backgroundFontSize: parseFloat(getComputedStyle(background).fontSize),
			leadFontSize: parseFloat(getComputedStyle(lead).fontSize),
			backgroundLeft: backgroundRect.left,
			leadLeft: leadRect.left,
		};
	});

	expect(metrics.oppositeAligned).toBe(true);
	expect(metrics.backgroundActive).toBe(true);
	expect(metrics.backgroundFontSize).toBeLessThan(metrics.leadFontSize);
	expect(metrics.backgroundLeft).toBeGreaterThanOrEqual(metrics.leadLeft - 1);
});

const coverState = async (page: Page): Promise<CoverHarnessState> =>
	page.evaluate(() => {
		if (!window.auraVisualHarness) {
			throw new Error("AuraLyrics visual harness API was not installed.");
		}
		return window.auraVisualHarness.getCoverState();
	});

const transitionPolicyState = async (page: Page): Promise<TransitionPolicyState> =>
	page.evaluate(() => {
		if (!window.auraVisualHarness) {
			throw new Error("AuraLyrics visual harness API was not installed.");
		}
		return window.auraVisualHarness.getTransitionPolicyState();
	});

const renderTransitionScenario = async (page: Page, name: TransitionScenarioName, phase: TransitionPhase): Promise<void> => {
	await page.evaluate(
		({ scenarioName, transitionPhase }) => {
			if (!window.auraVisualHarness) {
				throw new Error("AuraLyrics visual harness API was not installed.");
			}
			window.auraVisualHarness.renderTransitionScenario(scenarioName, transitionPhase);
		},
		{ scenarioName: name, transitionPhase: phase }
	);
	if (name === "reduced-motion-next") {
		await expect(page.locator("#aura-visual-root > .track-metadata-scene")).toHaveCount(1);
		return;
	}
	await expect(page.locator('#aura-visual-root > [data-scene-plane="incoming"]')).toHaveCount(1);
	await expect(page.locator('#aura-visual-root > [data-scene-plane="outgoing"]')).toHaveCount(1);
};

const completeTransition = async (page: Page): Promise<void> => {
	await page.evaluate(async () => {
		if (!window.auraVisualHarness) {
			throw new Error("AuraLyrics visual harness API was not installed.");
		}
		await window.auraVisualHarness.completeTransition();
	});
	await expect(page.locator("#aura-visual-root > [data-scene-plane]")).toHaveCount(0);
};

const expectChromeToStayFixed = async (page: Page): Promise<void> => {
	const result = await page.evaluate(() => {
		if (!window.auraVisualHarness) {
			throw new Error("AuraLyrics visual harness API was not installed.");
		}
		const rect = (selector: string): RectSnapshot => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) {
				throw new Error(`Missing fixed chrome element: ${selector}`);
			}
			const bounds = element.getBoundingClientRect();
			return {
				x: Number(bounds.x.toFixed(3)),
				y: Number(bounds.y.toFixed(3)),
				width: Number(bounds.width.toFixed(3)),
				height: Number(bounds.height.toFixed(3)),
			};
		};
		const selectors = {
			border: ".pip-border-frame",
			close: ".pip-close",
			controls: ".pip-controls",
		} as const;
		const current = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, rect(selector)])) as ChromeRects;
		const presentation = Object.fromEntries(
			Object.entries({ close: selectors.close, controls: selectors.controls }).map(([key, selector]) => {
				const element = document.querySelector<HTMLElement>(selector);
				if (!element) {
					throw new Error(`Missing fixed chrome presentation element: ${selector}`);
				}
				const computed = getComputedStyle(element);
				return [key, { opacity: computed.opacity, pointerEvents: computed.pointerEvents, visibility: computed.visibility }];
			})
		);
		const nestedInScenePlane = Object.values(selectors).some((selector) =>
			document.querySelector<HTMLElement>(selector)?.closest("[data-scene-plane]")
		);
		return {
			baseline: window.auraVisualHarness.getTransitionChromeBaseline(),
			current,
			nestedInScenePlane,
			presentation,
		};
	});

	expect(result.current).toEqual(result.baseline);
	expect(result.nestedInScenePlane).toBe(false);
	expect(result.presentation).toEqual({
		close: { opacity: "1", pointerEvents: "auto", visibility: "visible" },
		controls: { opacity: "1", pointerEvents: "auto", visibility: "visible" },
	});
};

const transitionMetrics = async (page: Page) =>
	page.evaluate(() => {
		const planeMetrics = (kind: "incoming" | "outgoing") => {
			const plane = document.querySelector<HTMLElement>(`#aura-visual-root > [data-scene-plane="${kind}"]`);
			if (!plane) {
				return null;
			}
			const transform = new DOMMatrixReadOnly(getComputedStyle(plane).transform);
			const rect = plane.getBoundingClientRect();
			return {
				rect: {
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height,
				},
				translationX: transform.m41,
				translationY: transform.m42,
			};
		};
		const content = document.querySelector<HTMLElement>("#aura-visual-root");
		if (!content) {
			throw new Error("Missing visual content root.");
		}
		return {
			allTitles: Array.from(content.querySelectorAll<HTMLElement>(".track-metadata-title"), (title) => title.textContent ?? ""),
			incoming: planeMetrics("incoming"),
			incomingTitle: content.querySelector<HTMLElement>('[data-scene-plane="incoming"] .track-metadata-title')?.textContent ?? null,
			outgoing: planeMetrics("outgoing"),
			outgoingHasLyrics: content.querySelector('[data-scene-plane="outgoing"] .lyrics-track') !== null,
			outgoingLastLineState: (() => {
				const lines = content.querySelectorAll<HTMLElement>('[data-scene-plane="outgoing"] .line-group');
				const line = lines.item(lines.length - 1);
				return line ? { active: line.classList.contains("active"), sung: line.classList.contains("sung") } : null;
			})(),
			outgoingTitle: content.querySelector<HTMLElement>('[data-scene-plane="outgoing"] .track-metadata-title')?.textContent ?? null,
			planeCount: content.querySelectorAll(":scope > [data-scene-plane]").length,
			rootChildCount: content.children.length,
			transitionClass:
				["scene-transition-next", "scene-transition-previous", "scene-transition-up"].find((className) => content.classList.contains(className)) ??
				null,
			visibleTitle: content.querySelector<HTMLElement>(":scope > .track-metadata-scene .track-metadata-title")?.textContent ?? null,
		};
	});

const renderScenario = async (page: Page, name: ScenarioName, timestamp?: number): Promise<void> => {
	await page.evaluate(
		({ scenarioName, timestampSec }) => {
			if (!window.auraVisualHarness) {
				throw new Error("AuraLyrics visual harness API was not installed.");
			}
			window.auraVisualHarness.renderScenario(scenarioName, timestampSec);
		},
		{ scenarioName: name, timestampSec: timestamp }
	);
	if (name.startsWith("settings-")) {
		await expect(page.locator(".aura-lyrics-settings")).toBeVisible();
		return;
	}
	if (name === "album-art-instrumental") {
		await expect(page.locator("#aura-lyrics-root.album-art-mode")).toBeVisible();
		return;
	}
	await expect(page.locator(".aura-lyrics")).toBeVisible();
};

const metadataMetrics = async (page: Page) =>
	page.evaluate(() => {
		const pipRoot = document.querySelector<HTMLElement>("#aura-lyrics-root");
		const title = document.querySelector<HTMLElement>(".track-metadata-title");
		const controls = document.querySelector<HTMLElement>(".pip-controls");
		const play = document.querySelector<HTMLElement>('[data-control="toggle-play"]');
		if (!pipRoot || !title || !controls || !play) {
			throw new Error("Missing Aurora metadata or playback controls.");
		}
		const progress = document.querySelector<HTMLElement>(".track-metadata-progress");
		const cover = document.querySelector<HTMLImageElement>(".track-metadata-cover");
		const backgroundCover = document.querySelector<HTMLImageElement>("#aura-lyrics-root > .pip-cover-layer > .pip-cover");
		return {
			backgroundCoverOpacity: backgroundCover ? getComputedStyle(backgroundCover).opacity : null,
			backgroundCoverTransitionDuration: backgroundCover ? getComputedStyle(backgroundCover).transitionDuration : null,
			eyebrow: document.querySelector(".track-metadata-eyebrow")?.textContent ?? null,
			title: title.textContent,
			byline: document.querySelector(".track-metadata-byline")?.textContent ?? null,
			hasProgress: progress !== null,
			progressWidth: progress?.getBoundingClientRect().width ?? 0,
			surfaceTone: pipRoot.dataset.surfaceTone,
			foregroundVariable: pipRoot.style.getPropertyValue("--pip-foreground-color"),
			titleColor: getComputedStyle(title).color,
			controlsOpacity: getComputedStyle(controls).opacity,
			controlsBackground: getComputedStyle(controls).backgroundImage,
			playColor: getComputedStyle(play).color,
			coverWidth: cover?.getBoundingClientRect().width ?? 0,
			coverSource: cover?.src ?? null,
		};
	});

const wordRowMetrics = async (page: Page, wordSelector: string) =>
	page.evaluate((selector) => {
		const rectFor = (targetSelector: string): DOMRect => {
			const element = document.querySelector<HTMLElement>(targetSelector);
			if (!element) {
				throw new Error(`Missing element for ${targetSelector}`);
			}
			return element.getBoundingClientRect();
		};
		const centerY = (rect: DOMRect): number => rect.top + rect.height / 2;
		const viewport = rectFor(".lyrics-viewport");
		const activeRow = rectFor(".syllable-row.active");
		const words = Array.from(document.querySelectorAll<HTMLElement>(selector)).map((word) => word.getBoundingClientRect());
		const gaps = words.slice(1).map((word, index) => word.left - words[index].right);

		return {
			activeCenterDelta: Math.abs(centerY(activeRow) - centerY(viewport)),
			minGap: Math.min(...gaps),
			maxGap: Math.max(...gaps),
		};
	}, wordSelector);

const glowMetrics = async (page: Page, rowSelector: string) =>
	page.evaluate((selector) => {
		const rectFor = (targetSelector: string): DOMRect => {
			const element = document.querySelector<HTMLElement>(targetSelector);
			if (!element) {
				throw new Error(`Missing element for ${targetSelector}`);
			}
			return element.getBoundingClientRect();
		};
		const row = document.querySelector<HTMLElement>(selector);
		const track = document.querySelector<HTMLElement>(".lyrics-track");
		if (!row || !track) {
			throw new Error(`Missing row or track for ${selector}`);
		}
		const viewport = rectFor(".lyrics-viewport");
		const lyric = row.querySelector<HTMLElement>(".lyric") ?? row;
		const lyricRect = lyric.getBoundingClientRect();
		const computed = getComputedStyle(lyric);
		const blur = parseFloat(computed.getPropertyValue("--text-shadow-blur-radius")) || 12;
		const trackStyle = getComputedStyle(track);

		return {
			glowTop: lyricRect.top - blur,
			glowBottom: lyricRect.bottom + blur,
			viewportTop: viewport.top,
			viewportBottom: viewport.bottom,
			trackOverflow: { x: trackStyle.overflowX, y: trackStyle.overflowY },
		};
	}, rowSelector);
