import { describe, expect, test } from "vitest";
import { sampleHighlightMotion } from "../../src/renderer/animation/highlightMotion";
import type { HighlightMotion } from "../../src/settings/settingsSchema";

const motions: HighlightMotion[] = ["spring", "pulse", "bounce", "elastic", "wave", "ripple"];

describe("sampleHighlightMotion", () => {
	test.each(motions)("returns finite bounded transform data for %s", (motion) => {
		for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
			const sample = sampleHighlightMotion(motion, progress, 2, 1);
			for (const value of Object.values(sample)) {
				expect(Number.isFinite(value)).toBe(true);
			}
			expect(sample.scale).toBeGreaterThan(0);
			expect(sample.scaleX).toBeGreaterThan(0);
			expect(sample.scaleY).toBeGreaterThan(0);
		}
	});

	test.each(motions)("collapses %s to a layout-neutral sample for reduced motion", (motion) => {
		expect(sampleHighlightMotion(motion, 0.5, 1, 1, true)).toEqual({
			scale: 1,
			scaleX: 1,
			scaleY: 1,
			yOffset: 0,
			rotationDeg: 0,
			glow: 0,
			ripple: 0,
		});
	});

	test("uses the syllable index to stagger wave motion", () => {
		const first = sampleHighlightMotion("wave", 0.5, 0, 1);
		const second = sampleHighlightMotion("wave", 0.5, 1, 1);

		expect(second.yOffset).not.toBe(first.yOffset);
		expect(second.rotationDeg).not.toBe(first.rotationDeg);
	});

	test("keeps zero intensity and progress endpoints layout neutral", () => {
		expect(sampleHighlightMotion("ripple", 0.5, 0, 0)).toMatchObject({ scale: 1, yOffset: 0, ripple: 0 });
		expect(sampleHighlightMotion("bounce", 0, 0, 1)).toMatchObject({ scale: 1, yOffset: 0 });
		expect(sampleHighlightMotion("bounce", 1, 0, 1)).toMatchObject({ scale: 1, yOffset: 0 });
	});
});
