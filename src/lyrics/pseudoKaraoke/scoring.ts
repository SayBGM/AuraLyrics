// §5.1 — score audio analysis segments as possible vocal candidates.
import type { AudioAnalysisSegment } from "../../audio/types";
import { MAX_SEGMENT_MS, MIN_SEGMENT_MS } from "./constants";
import type { ScoredSegment, SeedProfile } from "./types";
import { clamp01 } from "./utils";

const S_TO_MS = 1000;

type PitchStats = { peak: number; focus: number; spread: number };

export const getPitchStats = (pitches?: number[]): PitchStats => {
	if (!pitches?.length) {
		return { peak: 0, focus: 0, spread: 0 };
	}
	const sorted = [...pitches].sort((a, b) => b - a);
	const sum = pitches.reduce((total, value) => total + Math.max(0, value), 0);
	const mean = sum / pitches.length;
	const variance = pitches.reduce((total, value) => total + (value - mean) ** 2, 0) / pitches.length;
	return {
		peak: sorted[0] ?? 0,
		focus: sum > 0 ? ((sorted[0] ?? 0) + (sorted[1] ?? 0) + (sorted[2] ?? 0)) / sum : 0,
		spread: Math.sqrt(variance),
	};
};

const peakIndex = (pitches?: number[]): number => {
	if (!pitches?.length) {
		return -1;
	}
	let best = 0;
	for (let index = 1; index < pitches.length; index += 1) {
		if (pitches[index] > pitches[best]) {
			best = index;
		}
	}
	return best;
};

export const timbreDelta = (a?: { timbre?: number[] }, b?: { timbre?: number[] }): number => {
	const x = a?.timbre;
	const y = b?.timbre;
	if (!x?.length || !y?.length) {
		return 0;
	}
	const count = Math.min(x.length, y.length, 6);
	let sum = 0;
	for (let index = 0; index < count; index += 1) {
		sum += Math.abs(x[index] - y[index]);
	}
	return clamp01(sum / (count * 45));
};

export const timbreSimilarity = (timbre: number[] | undefined, profile: SeedProfile | undefined): number => {
	if (!profile || !timbre?.length) {
		return 0;
	}
	return clamp01(1 - timbreDelta({ timbre }, { timbre: profile.timbre }));
};

export const scoreVocalCandidate = (
	segment: AudioAnalysisSegment,
	prev?: AudioAnalysisSegment,
	next?: AudioAnalysisSegment
): ScoredSegment | null => {
	const durMs = Math.max(1, (segment.duration ?? 0) * S_TO_MS);
	if (durMs < MIN_SEGMENT_MS || durMs > MAX_SEGMENT_MS) {
		return null;
	}
	const conf = clamp01(segment.confidence ?? 0);
	const lStart = segment.loudness_start ?? -60;
	const lMax = segment.loudness_max ?? lStart;
	const lRise = lMax - lStart;
	const lMaxTime = segment.loudness_max_time ?? Math.min(segment.duration ?? 0, 0.08);
	const attackRatio = clamp01(lMaxTime / Math.max(segment.duration ?? 1e-3, 1e-3));
	const attack = clamp01(1 - Math.abs(attackRatio - 0.22) / 0.22);
	const onset = clamp01((lRise + 2) / 10);
	const sustained = clamp01((durMs - 60) / 180);
	const loud = clamp01((lMax + 36) / 28);
	const pitch = getPitchStats(segment.pitches);
	const harmonic = clamp01((pitch.peak * 0.55 + pitch.focus * 0.65 - 0.35) / 0.55);
	const contrast = Math.max(timbreDelta(segment, prev), timbreDelta(segment, next));

	let score = conf * 0.16 + onset * 0.2 + attack * 0.12 + sustained * 0.15 + harmonic * 0.22 + contrast * 0.1 + loud * 0.05;
	if (durMs < 90 && attackRatio < 0.12 && onset > 0.55) {
		score -= 0.18;
	}
	if (pitch.focus < 0.38 && pitch.peak < 0.42) {
		score -= 0.12;
	}
	if (pitch.spread > 0.25 && durMs < 110) {
		score -= 0.08;
	}

	const segmentStart = (segment.start ?? 0) * S_TO_MS;
	return {
		segmentStart,
		segmentEnd: segmentStart + durMs,
		time: segmentStart + lMaxTime * S_TO_MS,
		durationMs: durMs,
		baseScore: clamp01(score),
		confidence: conf,
		attackRatio,
		onsetScore: onset,
		sustainedScore: sustained,
		loudnessScore: loud,
		harmonicScore: harmonic,
		contrastScore: contrast,
		pitchPeakIndex: peakIndex(segment.pitches),
		pitchSpread: pitch.spread,
		pitchFocus: pitch.focus,
		timbre: segment.timbre,
		pitches: segment.pitches,
	};
};
