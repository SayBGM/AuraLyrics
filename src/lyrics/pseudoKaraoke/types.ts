import type { AudioAnalysisSection } from "../../audio/types";

export type ScoredSegment = {
	segmentStart: number; // ms
	segmentEnd: number; // ms
	time: number; // representative time (loudness peak), ms
	durationMs: number;
	baseScore: number;
	confidence: number;
	attackRatio: number;
	onsetScore: number;
	sustainedScore: number;
	loudnessScore: number;
	harmonicScore: number;
	contrastScore: number;
	pitchPeakIndex: number;
	pitchSpread: number;
	pitchFocus: number;
	timbre?: number[];
	pitches?: number[];
};

export type VocalCandidate = {
	time: number; // ms
	score: number;
	segmentStart: number; // ms
	segmentEnd: number; // ms
	durationMs: number;
	harmonicScore: number;
	pitchPeakIndex: number;
};

export type MassFrame = { time: number; mass: number; cumulative: number };
export type VocalMassCurve = { frames: MassFrame[]; stepMs: number; totalMass: number };
export type SilenceSpan = { start: number; end: number; center: number; avgMass: number };

export type SeedProfile = {
	timbre: number[];
	pitchPeakIndex: number;
	durationMs: number;
	strength: number;
};

export type TrackVocalContext = {
	scored: ScoredSegment[];
	seedProfile?: SeedProfile;
	sections: AudioAnalysisSection[];
	sectionVocality: number[];
};

export type LineTimingModel = {
	rhythmAnchors: number[];
	vocalCandidates: VocalCandidate[];
	vocalMassCurve: VocalMassCurve;
	silenceSpans: SilenceSpan[];
	confidence: number;
	sectionVocality: number;
	conservativeMode: boolean;
	activeStart: number;
	activeEnd: number;
};
