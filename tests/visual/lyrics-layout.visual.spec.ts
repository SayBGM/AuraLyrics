import { expect, type Page, test } from "@playwright/test";

type ScenarioName = "line-sync" | "word-sync" | "parenthetical-adlib" | "korean-tail" | "multiline-active-row";

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

test("parenthetical ad-lib rows scroll independently with stable spacing", async ({ page }) => {
	await renderScenario(page, "parenthetical-adlib");

	const metrics = await page.evaluate(() => {
		const rectFor = (selector: string): DOMRect => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) {
				throw new Error(`Missing element for ${selector}`);
			}
			return element.getBoundingClientRect();
		};
		const centerY = (rect: DOMRect): number => rect.top + rect.height / 2;
		const active = document.querySelector<HTMLElement>(".syllable-row.active");
		const rows = Array.from(document.querySelectorAll<HTMLElement>(".syllable-row"));
		const parentheticalRows = rows.filter((row) => row.classList.contains("parenthetical-only"));
		const rowGaps = rows.slice(1).map((row, index) => Math.round(row.getBoundingClientRect().top - rows[index].getBoundingClientRect().bottom));
		const viewport = rectFor(".lyrics-viewport");
		const activeRect = rectFor(".syllable-row.active");

		return {
			activeText: active?.textContent ?? "",
			activeCenterDelta: Math.abs(centerY(activeRect) - centerY(viewport)),
			parentheticalTexts: parentheticalRows.map((row) => row.textContent?.trim()),
			rowGaps,
		};
	});

	expect(metrics.activeText).toBe("hey");
	expect(metrics.activeCenterDelta).toBeLessThanOrEqual(syllableCenterTolerancePx);
	expect(metrics.parentheticalTexts).toEqual(["hey", "hey"]);
	expect(metrics.rowGaps.every((gap) => gap >= 0 && gap <= 42)).toBe(true);
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

const renderScenario = async (page: Page, name: ScenarioName): Promise<void> => {
	await page.evaluate((scenarioName) => {
		if (!window.auraVisualHarness) {
			throw new Error("AuraLyrics visual harness API was not installed.");
		}
		window.auraVisualHarness.renderScenario(scenarioName);
	}, name);
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
