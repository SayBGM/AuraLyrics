import { describe, expect, test } from "vitest";
import { MIN_GAP_MS } from "../../../src/lyrics/pseudoKaraoke/constants";
import { alignPhraseUnitsWithDP, buildGreedyPhraseBoundaries, buildPhraseBoundaryCandidates } from "../../../src/lyrics/pseudoKaraoke/dpAlign";
import { buildLineTimingModel } from "../../../src/lyrics/pseudoKaraoke/lineTimingModel";
import { buildTrackVocalContext } from "../../../src/lyrics/pseudoKaraoke/trackContext";
import type { LineTimingModel } from "../../../src/lyrics/pseudoKaraoke/types";
import { buildVocalAnalysis } from "./fixtures";

const realModel = (startMs: number, endMs: number): LineTimingModel => {
	const analysis = buildVocalAnalysis(startMs / 1000, endMs / 1000);
	const context = buildTrackVocalContext(analysis);
	return buildLineTimingModel(startMs, endMs, analysis, context);
};

const emptyModel = (overrides: Partial<LineTimingModel> = {}): LineTimingModel => ({
	rhythmAnchors: [],
	vocalCandidates: [],
	vocalMassCurve: { frames: [], stepMs: 20, totalMass: 0 },
	silenceSpans: [],
	confidence: 0,
	sectionVocality: 0.5,
	conservativeMode: false,
	activeStart: 2000,
	activeEnd: 2050,
	...overrides,
});

describe("buildPhraseBoundaryCandidates", () => {
	test("always starts at phraseStart, ends at phraseEnd, strictly increasing", () => {
		const model = realModel(2000, 6000);
		const candidates = buildPhraseBoundaryCandidates(2000, 6000, model);
		expect(candidates[0]).toBe(2000);
		expect(candidates[candidates.length - 1]).toBe(6000);
		for (let index = 1; index < candidates.length; index += 1) {
			expect(candidates[index]).toBeGreaterThan(candidates[index - 1]);
		}
	});

	test("dedupes candidate points that fall within 8ms of the previous one", () => {
		const model = emptyModel({
			vocalMassCurve: {
				frames: [
					{ time: 2100, mass: 1, cumulative: 1 },
					{ time: 2104, mass: 1, cumulative: 2 }, // 4ms after the prior candidate -> deduped away
					{ time: 2200, mass: 1, cumulative: 3 },
				],
				stepMs: 20,
				totalMass: 3,
			},
			activeStart: 2000,
			activeEnd: 6000,
		});
		const candidates = buildPhraseBoundaryCandidates(2000, 6000, model);
		expect(candidates).toEqual([2000, 2100, 2200, 6000]);
	});
});

describe("alignPhraseUnitsWithDP", () => {
	test("0-unit early return is [phraseStart, phraseEnd]", () => {
		const model = realModel(2000, 6000);
		expect(alignPhraseUnitsWithDP([], [], 2000, 6000, model)).toEqual([2000, 6000]);
	});

	test("1-unit early return is [phraseStart, phraseEnd]", () => {
		const model = realModel(2000, 6000);
		expect(alignPhraseUnitsWithDP(["hi"], [1], 2000, 6000, model)).toEqual([2000, 6000]);
	});

	test("boundaries: correct length, fixed endpoints, monotonic, respect MIN_GAP_MS on the DP path", () => {
		const model = realModel(2000, 9000);
		const units = ["h", "e", "l", "l", "o"];
		const weights = [1, 1, 1, 1, 1];
		// Enough candidates for the DP path to be taken (not the greedy fallback).
		const candidates = buildPhraseBoundaryCandidates(2000, 9000, model);
		expect(candidates.length).toBeGreaterThanOrEqual(units.length + 1);

		const boundaries = alignPhraseUnitsWithDP(units, weights, 2000, 9000, model);
		expect(boundaries).toHaveLength(units.length + 1);
		expect(boundaries[0]).toBe(2000);
		expect(boundaries[boundaries.length - 1]).toBe(9000);
		for (let index = 1; index < boundaries.length; index += 1) {
			expect(boundaries[index]).toBeGreaterThanOrEqual(boundaries[index - 1]);
		}
		for (let index = 1; index < boundaries.length - 1; index += 1) {
			// Internal gaps chosen by the DP must respect MIN_GAP_MS (the final segment can be
			// shorter after the line-window clamp applied by the caller, but that clamp isn't
			// part of this function, so every internal transition here is a real DP choice).
			expect(boundaries[index] - boundaries[index - 1]).toBeGreaterThanOrEqual(MIN_GAP_MS);
		}
	});

	test("falls back to greedy boundaries when candidates < unitCount + 1", () => {
		const model = emptyModel({ activeStart: 2000, activeEnd: 2050 });
		const units = ["a", "b", "c", "d", "e", "f", "g", "h"];
		const weights = units.map(() => 1);
		const candidates = buildPhraseBoundaryCandidates(2000, 2050, model);
		expect(candidates.length).toBeLessThan(units.length + 1);

		const boundaries = alignPhraseUnitsWithDP(units, weights, 2000, 2050, model);
		const greedy = buildGreedyPhraseBoundaries(units, weights, 2000, 2050, model);
		expect(boundaries).toEqual(greedy);
	});

	test("falls back to greedy boundaries when the DP path is infeasible (all gaps below MIN_GAP_MS)", () => {
		// 11 frames 10ms apart -> exactly unitCount+1 candidates, forcing every consecutive
		// transition to use a 10ms gap, which is below MIN_GAP_MS (24ms) and therefore
		// Number.POSITIVE_INFINITY for every transition -> the DP table has no finite path.
		const frames = [];
		for (let time = 2000; time <= 2100; time += 10) {
			frames.push({ time, mass: 1, cumulative: (time - 2000) / 10 + 1 });
		}
		const tightModel = emptyModel({
			vocalMassCurve: { frames, stepMs: 10, totalMass: frames[frames.length - 1].cumulative },
			activeStart: 2000,
			activeEnd: 2100,
		});
		const units = new Array(10).fill("a");
		const weights = units.map(() => 1);
		const candidates = buildPhraseBoundaryCandidates(2000, 2100, tightModel);
		expect(candidates).toHaveLength(units.length + 1);

		const boundaries = alignPhraseUnitsWithDP(units, weights, 2000, 2100, tightModel);
		const greedy = buildGreedyPhraseBoundaries(units, weights, 2000, 2100, tightModel);
		expect(boundaries).toEqual(greedy);
	});
});

describe("buildGreedyPhraseBoundaries", () => {
	test("returns unitCount + 1 boundaries, fixed endpoints, monotonic", () => {
		const model = realModel(2000, 6000);
		const units = ["a", "b", "c"];
		const weights = [1, 2, 1];
		const boundaries = buildGreedyPhraseBoundaries(units, weights, 2000, 6000, model);
		expect(boundaries).toHaveLength(units.length + 1);
		expect(boundaries[0]).toBe(2000);
		expect(boundaries[boundaries.length - 1]).toBe(6000);
		for (let index = 1; index < boundaries.length; index += 1) {
			expect(boundaries[index]).toBeGreaterThanOrEqual(boundaries[index - 1]);
		}
	});
});
