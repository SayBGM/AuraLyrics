import { describe, expect, test } from "vitest";
import { buildUnitPhrases, pickPhraseBoundaryTime } from "../../../src/lyrics/pseudoKaraoke/phrases";
import type { LineTimingModel } from "../../../src/lyrics/pseudoKaraoke/types";

describe("buildUnitPhrases", () => {
	test("CJK-dominant units use maxSize 6 (hard break once size reaches 6)", () => {
		// Seven single-Hangul-syllable units, no whitespace, no punctuation: only the
		// maxSize threshold can trigger a break.
		const units = ["가", "나", "다", "라", "마", "바", "사"];
		const weights = units.map(() => 1);
		const phrases = buildUnitPhrases(units, weights);
		expect(phrases).toEqual([
			{ startIndex: 0, endIndex: 5, weight: 6 },
			{ startIndex: 6, endIndex: 6, weight: 1 },
		]);
	});

	test("Latin-dominant units use maxSize 4 (hard break once size reaches 4)", () => {
		const units = ["a", "b", "c", "d", "e"];
		const weights = units.map(() => 1);
		const phrases = buildUnitPhrases(units, weights);
		expect(phrases).toEqual([
			{ startIndex: 0, endIndex: 3, weight: 4 },
			{ startIndex: 4, endIndex: 4, weight: 1 },
		]);
	});

	test("hard-break punctuation forces a flush regardless of size", () => {
		const units = ["hi", "there.", "friend"];
		const weights = units.map(() => 1);
		const phrases = buildUnitPhrases(units, weights);
		expect(phrases).toEqual([
			{ startIndex: 0, endIndex: 1, weight: 2 },
			{ startIndex: 2, endIndex: 2, weight: 1 },
		]);
	});

	test("Latin soft-break fires at wordCount >= 3 before maxSize is reached", () => {
		const units = ["ab ", "cd ", "ef ", "gh "];
		const weights = [1, 1, 1, 1];
		const phrases = buildUnitPhrases(units, weights);
		// wordCount reaches 3 at index 2 (before maxSize=4 would force a break at index 3).
		expect(phrases).toEqual([
			{ startIndex: 0, endIndex: 2, weight: 3 },
			{ startIndex: 3, endIndex: 3, weight: 1 },
		]);
	});

	test("CJK soft-break fires once accumulated weight crosses 3.2 before maxSize is reached", () => {
		const units = ["가 ", "나 ", "다 ", "라 "];
		const weights = [1.2, 1.2, 1.2, 1.2];
		const phrases = buildUnitPhrases(units, weights);
		// weightAcc crosses 3.2 at index 2 (1.2+1.2+1.2=3.6), well before maxSize=6.
		expect(phrases).toEqual([
			{ startIndex: 0, endIndex: 2, weight: 3.5999999999999996 },
			{ startIndex: 3, endIndex: 3, weight: 1.2 },
		]);
	});

	test("empty input returns no phrases", () => {
		expect(buildUnitPhrases([], [])).toEqual([]);
	});
});

const baseModel = (overrides: Partial<LineTimingModel> = {}): LineTimingModel => ({
	rhythmAnchors: [],
	vocalCandidates: [],
	vocalMassCurve: { frames: [], stepMs: 20, totalMass: 0 },
	silenceSpans: [],
	confidence: 0.5,
	sectionVocality: 0.5,
	conservativeMode: false,
	activeStart: 0,
	activeEnd: 2000,
	...overrides,
});

describe("pickPhraseBoundaryTime", () => {
	test("upperBound <= lowerBound: clamps target directly against [prevBoundary+1, activeEnd]", () => {
		const model = baseModel({ activeStart: 0, activeEnd: 1000 });
		// lowerBound = 900 + 80 = 980; upperBound = 1000 - 2*80 = 840 <= lowerBound.
		const result = pickPhraseBoundaryTime(500, model, 900, 2, 1000);
		expect(result).toBe(901);
	});

	test("tier 1: snaps to the nearest low-mass silence span within the search radius", () => {
		const model = baseModel({
			activeStart: 0,
			activeEnd: 2000,
			silenceSpans: [
				{ start: 950, end: 1050, center: 1000, avgMass: 0.01 },
				{ start: 1300, end: 1400, center: 1350, avgMass: 0.5 },
			],
		});
		// interval = 2000, searchRadius = clamp(160, 60, 320) = 160; only the span at 1000 is
		// within radius of the target (1350 is 350ms away).
		const result = pickPhraseBoundaryTime(1000, model, 0, 1, 2000);
		expect(result).toBe(1000);
	});

	test("tier 2: falls back to the lowest-mass frame in the mass curve when no silence span matches", () => {
		const model = baseModel({
			activeStart: 0,
			activeEnd: 2000,
			silenceSpans: [],
			vocalMassCurve: {
				frames: [
					{ time: 900, mass: 0.5, cumulative: 0 },
					{ time: 1000, mass: 0.05, cumulative: 0 },
					{ time: 1100, mass: 0.3, cumulative: 0 },
				],
				stepMs: 100,
				totalMass: 0,
			},
		});
		const result = pickPhraseBoundaryTime(1000, model, 0, 1, 2000);
		expect(result).toBe(1000);
	});

	test("tier 3: clamps the raw target when neither a silence span nor a nearby frame exists", () => {
		const model = baseModel({ activeStart: 0, activeEnd: 2000, silenceSpans: [], vocalMassCurve: { frames: [], stepMs: 20, totalMass: 0 } });
		// lowerBound = 0 + 80 = 80; upperBound = 2000 - 1*80 = 1920; target is out of range.
		const result = pickPhraseBoundaryTime(-500, model, 0, 1, 2000);
		expect(result).toBe(80);
	});
});
