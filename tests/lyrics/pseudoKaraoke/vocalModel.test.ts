import { describe, expect, test } from "vitest";
import { buildLineTimingModel, buildTrackVocalContext, getMassAtTime, getTimeByMassRatio } from "../../../src/lyrics/pseudoKaraoke/vocalModel";
import { buildVocalAnalysis } from "./fixtures";

describe("vocal model", () => {
	const analysis = buildVocalAnalysis(2, 6);
	const context = buildTrackVocalContext(analysis);

	test("scores usable segments into candidates", () => {
		expect(context.scored.length).toBeGreaterThan(0);
	});

	test("builds a line model with vocal candidates and a mass curve", () => {
		const model = buildLineTimingModel(2000, 6000, analysis, context);
		expect(model.vocalCandidates.length).toBeGreaterThan(0);
		expect(model.vocalMassCurve.totalMass).toBeGreaterThan(0);
		expect(model.activeEnd).toBeGreaterThan(model.activeStart);
	});

	test("cumulative mass is monotonically non-decreasing", () => {
		const { vocalMassCurve } = buildLineTimingModel(2000, 6000, analysis, context);
		let previous = -1;
		for (const frame of vocalMassCurve.frames) {
			expect(frame.cumulative).toBeGreaterThanOrEqual(previous);
			previous = frame.cumulative;
		}
	});

	test("getTimeByMassRatio inverts getMassAtTime at the endpoints", () => {
		const { vocalMassCurve, activeStart, activeEnd } = buildLineTimingModel(2000, 6000, analysis, context);
		expect(getTimeByMassRatio(vocalMassCurve, 0)).toBeCloseTo(activeStart, 0);
		expect(getTimeByMassRatio(vocalMassCurve, 1)).toBeCloseTo(activeEnd, 0);
		const mid = getTimeByMassRatio(vocalMassCurve, 0.5);
		expect(mid).toBeGreaterThan(activeStart);
		expect(mid).toBeLessThan(activeEnd);
		// round-trip: mass at the time for ratio r ≈ r * total
		const target = vocalMassCurve.totalMass * 0.5;
		expect(getMassAtTime(vocalMassCurve, mid)).toBeCloseTo(target, 1);
	});
});
