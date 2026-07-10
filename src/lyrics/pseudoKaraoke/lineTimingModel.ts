// §5.9 — assemble the focused analysis stages into a per-line timing model.
import type { AudioAnalysisData } from "../../audio/types";
import { buildVocalCandidates } from "./candidates";
import { buildVocalMassCurve } from "./massCurve";
import { buildRhythmAnchors, buildVocalActivityWindow } from "./rhythm";
import { buildSilenceSpans } from "./silence";
import { sectionVocalityAt } from "./trackContext";
import type { LineTimingModel, TrackVocalContext } from "./types";
import { clamp01 } from "./utils";

export const buildLineTimingModel = (
	start: number,
	end: number,
	analysis: AudioAnalysisData | undefined,
	context: TrackVocalContext
): LineTimingModel => {
	const sectionVocality = sectionVocalityAt(context, (start + end) / 2);
	const candidates = buildVocalCandidates(start, end, context, sectionVocality);
	const anchors = buildRhythmAnchors(start, end, analysis);

	const interval = Math.max(1, end - start);
	const sortedScores = candidates.map((candidate) => candidate.score).sort((a, b) => b - a);
	const topCount = Math.max(1, Math.ceil(sortedScores.length * 0.4));
	const topAvg = sortedScores.length ? sortedScores.slice(0, topCount).reduce((sum, value) => sum + value, 0) / topCount : 0;
	const coverage = clamp01(candidates.reduce((sum, candidate) => sum + candidate.durationMs, 0) / interval);
	const density = clamp01(candidates.length / (interval / 320));
	const confidence = clamp01(topAvg * 0.42 + coverage * 0.24 + density * 0.16 + sectionVocality * 0.18);
	const strongCandidates = candidates.filter((candidate) => candidate.score >= 0.5).length;
	const conservativeMode = sectionVocality < 0.33 || (confidence < 0.36 && strongCandidates < 2);

	const { activeStart, activeEnd } = buildVocalActivityWindow(start, end, candidates, confidence);
	const vocalMassCurve = buildVocalMassCurve(activeStart, activeEnd, candidates, anchors, confidence);
	const silenceSpans = buildSilenceSpans(vocalMassCurve, confidence);

	return {
		rhythmAnchors: anchors,
		vocalCandidates: candidates,
		vocalMassCurve,
		silenceSpans,
		confidence,
		sectionVocality,
		conservativeMode,
		activeStart,
		activeEnd,
	};
};
