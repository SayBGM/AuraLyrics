import { describe, expect, test } from "vitest";
import { buildVocalCandidates } from "../../../src/lyrics/pseudoKaraoke/candidates";
import { buildLineTimingModel } from "../../../src/lyrics/pseudoKaraoke/lineTimingModel";
import {
	buildVocalMassCurve,
	getLocalMassAtTime,
	getMassAtTime,
	getTimeByMassRatio,
	getTimeByMassTarget,
} from "../../../src/lyrics/pseudoKaraoke/massCurve";
import { buildRhythmAnchors, buildVocalActivityWindow } from "../../../src/lyrics/pseudoKaraoke/rhythm";
import { getPitchStats, scoreVocalCandidate, timbreDelta } from "../../../src/lyrics/pseudoKaraoke/scoring";
import { buildSilenceSpans } from "../../../src/lyrics/pseudoKaraoke/silence";
import { buildTrackVocalContext, sectionVocalityAt } from "../../../src/lyrics/pseudoKaraoke/trackContext";
import * as facade from "../../../src/lyrics/pseudoKaraoke/vocalModel";
import { buildVocalAnalysis } from "./fixtures";

describe("vocal model module boundaries", () => {
	const analysis = buildVocalAnalysis(2, 6);

	test("keeps the legacy vocalModel facade mapped to the focused modules", () => {
		expect(facade.getPitchStats).toBe(getPitchStats);
		expect(facade.timbreDelta).toBe(timbreDelta);
		expect(facade.scoreVocalCandidate).toBe(scoreVocalCandidate);
		expect(facade.buildTrackVocalContext).toBe(buildTrackVocalContext);
		expect(facade.buildVocalCandidates).toBe(buildVocalCandidates);
		expect(facade.buildRhythmAnchors).toBe(buildRhythmAnchors);
		expect(facade.buildVocalActivityWindow).toBe(buildVocalActivityWindow);
		expect(facade.buildVocalMassCurve).toBe(buildVocalMassCurve);
		expect(facade.getMassAtTime).toBe(getMassAtTime);
		expect(facade.getLocalMassAtTime).toBe(getLocalMassAtTime);
		expect(facade.getTimeByMassTarget).toBe(getTimeByMassTarget);
		expect(facade.getTimeByMassRatio).toBe(getTimeByMassRatio);
		expect(facade.buildSilenceSpans).toBe(buildSilenceSpans);
		expect(facade.buildLineTimingModel).toBe(buildLineTimingModel);
	});

	test("preserves the segment score characteristics at the scoring boundary", () => {
		const [segment, next] = analysis.segments ?? [];
		const scored = scoreVocalCandidate(segment, undefined, next);

		expect(scored).not.toBeNull();
		expect(scored?.segmentStart).toBe(2000);
		expect(scored?.segmentEnd).toBe(2200);
		expect(scored?.time).toBeCloseTo(2044, 8);
		expect(scored?.durationMs).toBeCloseTo(200, 8);
		expect(scored?.baseScore).toBeCloseTo(0.83307037, 7);
		expect(scored?.pitchPeakIndex).toBe(0);
	});

	test("assembles the line model from the same candidate, timing, mass, and silence stages", () => {
		const context = buildTrackVocalContext(analysis);
		const model = buildLineTimingModel(2000, 6000, analysis, context);
		const sectionVocality = sectionVocalityAt(context, 4000);
		const candidates = buildVocalCandidates(2000, 6000, context, sectionVocality);
		const anchors = buildRhythmAnchors(2000, 6000, analysis);
		const activeWindow = buildVocalActivityWindow(2000, 6000, candidates, model.confidence);
		const massCurve = buildVocalMassCurve(activeWindow.activeStart, activeWindow.activeEnd, candidates, anchors, model.confidence);

		expect(model.sectionVocality).toBe(sectionVocality);
		expect(model.vocalCandidates).toEqual(candidates);
		expect(model.rhythmAnchors).toEqual(anchors);
		expect({ activeStart: model.activeStart, activeEnd: model.activeEnd }).toEqual(activeWindow);
		expect(model.vocalMassCurve).toEqual(massCurve);
		expect(model.silenceSpans).toEqual(buildSilenceSpans(massCurve, model.confidence));
	});
});
