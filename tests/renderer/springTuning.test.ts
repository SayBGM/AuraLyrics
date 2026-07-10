import { describe, expect, test } from "vitest";
import { Spring } from "../../src/renderer/animation/Spring";
import { DEFAULT_SPRING_SOFTNESS, SPRING_PROFILES, springTuningForSoftness } from "../../src/renderer/animation/springTuning";

describe("springTuningForSoftness", () => {
	test("preserves every legacy syllable spring profile at the default softness", () => {
		for (const profile of Object.values(SPRING_PROFILES)) {
			expect(springTuningForSoftness(profile, DEFAULT_SPRING_SOFTNESS)).toEqual(profile);
		}
	});

	test("maps hard, default, and soft endpoints to stable positive tuning", () => {
		const hard = springTuningForSoftness(SPRING_PROFILES.scale, 0);
		const defaultTuning = springTuningForSoftness(SPRING_PROFILES.scale, 0.65);
		const soft = springTuningForSoftness(SPRING_PROFILES.scale, 1);

		expect(hard).toEqual({ dampingRatio: 0.6, frequency: 1.064 });
		expect(defaultTuning).toEqual({ dampingRatio: 0.6, frequency: 0.7 });
		expect(soft).toEqual({ dampingRatio: 0.6, frequency: 0.504 });
		expect(hard.frequency).toBeGreaterThan(defaultTuning.frequency);
		expect(defaultTuning.frequency).toBeGreaterThan(soft.frequency);
		for (const tuning of [hard, defaultTuning, soft]) {
			const spring = new Spring(0, tuning.dampingRatio, tuning.frequency);
			spring.setTarget(1);
			for (let frame = 0; frame < 240; frame += 1) {
				expect(Number.isFinite(spring.update(1 / 60))).toBe(true);
			}
		}
	});

	test("falls back to the legacy default for non-finite softness", () => {
		expect(springTuningForSoftness(SPRING_PROFILES.glow, Number.NaN)).toEqual(SPRING_PROFILES.glow);
		expect(springTuningForSoftness(SPRING_PROFILES.yOffset, Number.POSITIVE_INFINITY)).toEqual(SPRING_PROFILES.yOffset);
	});
});
