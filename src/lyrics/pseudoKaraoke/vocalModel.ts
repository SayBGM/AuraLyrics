// Compatibility facade for the focused §5 vocal-model modules.
export { buildVocalCandidates } from "./candidates";
export { buildLineTimingModel } from "./lineTimingModel";
export { buildVocalMassCurve, getLocalMassAtTime, getMassAtTime, getTimeByMassRatio, getTimeByMassTarget } from "./massCurve";
export { buildRhythmAnchors, buildVocalActivityWindow } from "./rhythm";
export { getPitchStats, scoreVocalCandidate, timbreDelta } from "./scoring";
export { buildSilenceSpans } from "./silence";
export { buildTrackVocalContext } from "./trackContext";
export type {
	LineTimingModel,
	MassFrame,
	ScoredSegment,
	SeedProfile,
	SilenceSpan,
	TrackVocalContext,
	VocalCandidate,
	VocalMassCurve,
} from "./types";
