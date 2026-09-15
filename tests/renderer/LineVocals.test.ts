import { describe, expect, test, vi } from "vitest";
import type { LineVocal } from "../../src/lyrics/types";
import { LineVocals } from "../../src/renderer/components/LineVocals";
import { DEFAULT_SETTINGS } from "../../src/settings/settingsSchema";

const line: LineVocal = {
	type: "vocal",
	text: "Existing line timing",
	startTime: 2,
	endTime: 6,
	oppositeAligned: false,
};

describe("LineVocals highlighting", () => {
	test("derives line-wide progress from the existing line range without word timing", () => {
		const vocals = new LineVocals(line, DEFAULT_SETTINGS);
		const target = vocals.element.querySelector<HTMLElement>(".line.highlight-layout-host");
		const glyphLayer = vocals.element.querySelector<HTMLElement>(".highlight-glyph-layer.highlight-target");
		vocals.setHoldEndTime(8);
		expect(target?.classList.contains("idle")).toBe(true);
		expect(vocals.getHighlightDecorationTracks()).toHaveLength(1);
		expect(vocals.getHighlightDecorationTracks()[0].host).toBe(target);
		expect(glyphLayer?.contains(vocals.getHighlightDecorationTracks()[0].decorationLayer)).toBe(false);

		vocals.animate(4);
		expect(target?.style.getPropertyValue("--highlight-progress")).toBe("50%");
		expect(vocals.element.classList.contains("active")).toBe(true);
		expect(target?.classList.contains("active")).toBe(true);

		vocals.animate(6.5);
		expect(target?.style.getPropertyValue("--highlight-progress")).toBe("100%");
		expect(vocals.element.classList.contains("active")).toBe(true);
		expect(target?.classList.contains("sung")).toBe(true);

		vocals.animate(8);
		expect(vocals.element.classList.contains("sung")).toBe(true);
		expect(line).toEqual({
			type: "vocal",
			text: "Existing line timing",
			startTime: 2,
			endTime: 6,
			oppositeAligned: false,
		});
	});

	test("changes motion live without replacing the line DOM", () => {
		const vocals = new LineVocals(line, DEFAULT_SETTINGS);
		const target = vocals.element.querySelector<HTMLElement>(".line.highlight-layout-host");

		vocals.applySettings({ ...DEFAULT_SETTINGS, highlightMotion: "wave" });
		vocals.animate(4);

		expect(vocals.element.querySelector(".line.highlight-layout-host")).toBe(target);
		expect(target?.style.transform).toContain("rotate(");
		vocals.applySettings({ ...DEFAULT_SETTINGS, highlightMotion: "wave", reduceMotion: true });
		vocals.animate(4);
		expect(target?.style.transform).toBe("translateY(calc(var(--lyrics-size) * 0)) rotate(0deg) scaleX(1) scaleY(1)");
	});

	test("writes nothing when the same timestamp is animated twice", () => {
		const vocals = new LineVocals(line, DEFAULT_SETTINGS);
		const target = vocals.element.querySelector<HTMLElement>(".line.highlight-layout-host");
		const glyphLayer = vocals.element.querySelector<HTMLElement>(".highlight-glyph-layer.highlight-target");
		if (!target || !glyphLayer) {
			throw new Error("Expected the line highlight elements.");
		}
		vocals.animate(4);
		const setProperty = vi.spyOn(target.style, "setProperty");
		const glyphSetProperty = vi.spyOn(glyphLayer.style, "setProperty");
		const toggle = vi.spyOn(target.classList, "toggle");

		vocals.animate(4);

		expect(setProperty).not.toHaveBeenCalled();
		expect(glyphSetProperty).not.toHaveBeenCalled();
		expect(toggle).not.toHaveBeenCalled();

		vocals.animate(4.5);

		expect(setProperty).toHaveBeenCalled();
	});

	test("renders a sanitized performer label separately when enabled", () => {
		const vocals = new LineVocals(
			{
				...line,
				performers: [{ name: "Lead" }, { name: "  Guest  " }, { name: "Lead" }, { name: "" }],
			},
			{ ...DEFAULT_SETTINGS, showPerformers: true }
		);

		expect(vocals.element.querySelector(".lyric-performers")?.textContent).toBe("Lead, Guest");
		expect(vocals.element.querySelector(".line")?.textContent).toBe(line.text);
	});

	test("does not render performer data when the option is off", () => {
		const vocals = new LineVocals({ ...line, performers: [{ name: "Lead" }] }, DEFAULT_SETTINGS);

		expect(vocals.element.querySelector(".lyric-performers")).toBeNull();
	});
});
