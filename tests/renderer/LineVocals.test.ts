import { describe, expect, test } from "vitest";
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
		const target = vocals.element.querySelector<HTMLElement>(".line.highlight-target");
		vocals.setHoldEndTime(8);

		vocals.animate(4);
		expect(target?.style.getPropertyValue("--line-progress")).toBe("50%");
		expect(vocals.element.classList.contains("active")).toBe(true);
		expect(target?.classList.contains("active")).toBe(true);

		vocals.animate(6.5);
		expect(target?.style.getPropertyValue("--line-progress")).toBe("100%");
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
		const target = vocals.element.querySelector<HTMLElement>(".line.highlight-target");

		vocals.applySettings({ ...DEFAULT_SETTINGS, highlightMotion: "wave" });
		vocals.animate(4);

		expect(vocals.element.querySelector(".line.highlight-target")).toBe(target);
		expect(target?.style.transform).toContain("rotate(");
		vocals.applySettings({ ...DEFAULT_SETTINGS, highlightMotion: "wave", reduceMotion: true });
		vocals.animate(4);
		expect(target?.style.transform).toBe("translateY(calc(var(--lyrics-size) * 0)) rotate(0deg) scaleX(1) scaleY(1)");
	});
});
