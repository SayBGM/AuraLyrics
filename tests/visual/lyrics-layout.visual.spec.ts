import { expect, type Page, test } from "@playwright/test";

type ScenarioName =
	| "album-art-instrumental"
	| "background-opposite"
	| "frame-interlude"
	| "line-sync"
	| "word-sync"
	| "korean-tail"
	| "multiline-active-row";

declare global {
	interface Window {
		auraVisualHarness?: {
			renderScenario(name: ScenarioName, timestamp?: number): void;
		};
	}
}

const baseUrl = process.env.AURA_VISUAL_BASE_URL ?? "http://127.0.0.1:4173";
const centerTolerancePx = 18;
const syllableCenterTolerancePx = 36;
const screenshotTolerance = {
	maxDiffPixelRatio: 0.04,
};

test.use({
	viewport: { width: 900, height: 520 },
});

test.beforeEach(async ({ page }) => {
	await page.goto(baseUrl);
	await expect(page.locator("#aura-lyrics-root")).toBeVisible();
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

	expect(metrics.activeCenterDelta).toBeLessThanOrEqual(syllableCenterTolerancePx);
	expect(metrics.minGap).toBeGreaterThanOrEqual(-1);
	expect(metrics.maxGap).toBeLessThanOrEqual(32);
	expect(glow.trackOverflow).toEqual({ x: "visible", y: "visible" });
	expect(glow.glowTop).toBeGreaterThanOrEqual(glow.viewportTop);
	expect(glow.glowBottom).toBeLessThanOrEqual(glow.viewportBottom);
	await expect(page.locator("#aura-lyrics-root")).toHaveScreenshot("word-sync-active.png", screenshotTolerance);
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
			coverWidth: Math.round(coverRect.width),
			coverHeight: Math.round(coverRect.height),
			objectFit: getComputedStyle(cover).objectFit,
		};
	});

	expect(metrics.albumArtMode).toBe(true);
	expect(metrics.contentChildren).toBe(0);
	expect(metrics.coverWidth).toBe(600);
	expect(metrics.coverHeight).toBe(600);
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

const renderScenario = async (page: Page, name: ScenarioName): Promise<void> => {
	await page.evaluate((scenarioName) => {
		if (!window.auraVisualHarness) {
			throw new Error("AuraLyrics visual harness API was not installed.");
		}
		window.auraVisualHarness.renderScenario(scenarioName);
	}, name);
	if (name === "album-art-instrumental") {
		await expect(page.locator("#aura-lyrics-root.album-art-mode")).toBeVisible();
		return;
	}
	await expect(page.locator(".aura-lyrics")).toBeVisible();
};

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
