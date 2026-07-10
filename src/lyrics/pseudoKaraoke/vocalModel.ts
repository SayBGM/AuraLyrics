// §5 — Audio vocal model: turn audio analysis into a vocal energy curve.
import type { AudioAnalysisData, AudioAnalysisSection, AudioAnalysisSegment } from "../../audio/types";
import { MAX_SEGMENT_MS, MIN_SEGMENT_MS } from "./constants";
import { clamp, clamp01 } from "./utils";

const S_TO_MS = 1000;

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

// ───────────────────────── pitch / timbre helpers ─────────────────────────

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

const timbreSimilarity = (timbre: number[] | undefined, profile: SeedProfile | undefined): number => {
	if (!profile || !timbre?.length) {
		return 0;
	}
	return clamp01(1 - timbreDelta({ timbre }, { timbre: profile.timbre }));
};

// ───────────────────────── §5.1 candidate scoring ─────────────────────────

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

// ─────────────────── §5.2 / §5.3 track-level context ───────────────────

export const buildTrackVocalContext = (analysis: AudioAnalysisData | undefined): TrackVocalContext => {
	const segments = (analysis?.segments ?? []).filter((segment) => Number.isFinite(segment.start) && (segment.duration ?? 0) > 0);
	const scored: ScoredSegment[] = [];
	for (let index = 0; index < segments.length; index += 1) {
		const result = scoreVocalCandidate(segments[index], segments[index - 1], segments[index + 1]);
		if (result) {
			scored.push(result);
		}
	}
	return {
		scored,
		seedProfile: buildTrackSeedProfile(scored),
		sections: analysis?.sections ?? [],
		sectionVocality: computeSectionVocality(analysis?.sections ?? [], scored),
	};
};

const buildTrackSeedProfile = (scored: ScoredSegment[]): SeedProfile | undefined => {
	const vocalLike = scored.filter(
		(item) => item.baseScore >= 0.56 && item.harmonicScore >= 0.5 && item.pitchFocus >= 0.42 && item.durationMs >= 70 && item.durationMs <= 420
	);
	if (vocalLike.length < 4) {
		return undefined;
	}
	const timbreLength = vocalLike.find((item) => item.timbre?.length)?.timbre?.length ?? 0;
	const timbre = new Array(timbreLength).fill(0);
	let weightSum = 0;
	let durationSum = 0;
	const peakCounts = new Map<number, number>();
	for (const item of vocalLike) {
		const weight = item.baseScore;
		weightSum += weight;
		durationSum += item.durationMs * weight;
		if (item.timbre?.length) {
			for (let index = 0; index < timbreLength; index += 1) {
				timbre[index] += (item.timbre[index] ?? 0) * weight;
			}
		}
		if (item.pitchPeakIndex >= 0) {
			peakCounts.set(item.pitchPeakIndex, (peakCounts.get(item.pitchPeakIndex) ?? 0) + weight);
		}
	}
	if (weightSum <= 0) {
		return undefined;
	}
	const pitchPeakIndex = [...peakCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
	return {
		timbre: timbre.map((value) => value / weightSum),
		pitchPeakIndex,
		durationMs: durationSum / weightSum,
		strength: clamp01(vocalLike.length / Math.max(8, scored.length * 0.2)),
	};
};

const overlapMs = (segment: ScoredSegment, start: number, end: number): number =>
	Math.max(0, Math.min(segment.segmentEnd, end) - Math.max(segment.segmentStart, start));

const computeSectionVocality = (sections: AudioAnalysisSection[], scored: ScoredSegment[]): number[] =>
	sections.map((section) => {
		const start = (section.start ?? 0) * S_TO_MS;
		const end = start + (section.duration ?? 0) * S_TO_MS;
		if (end <= start) {
			return 0.5;
		}
		const within = scored.filter((segment) => overlapMs(segment, start, end) > 0);
		if (within.length === 0) {
			return 0.2;
		}
		const sortedScores = within.map((item) => item.baseScore).sort((a, b) => b - a);
		const topCount = Math.max(1, Math.ceil(sortedScores.length * 0.4));
		const topAvg = sortedScores.slice(0, topCount).reduce((sum, value) => sum + value, 0) / topCount;
		const coveredMs = within.reduce((sum, segment) => sum + overlapMs(segment, start, end) * segment.baseScore, 0);
		const coverage = clamp01(coveredMs / (end - start));
		const density = clamp01(within.length / ((end - start) / 220));
		return clamp01(topAvg * 0.46 + coverage * 0.32 + density * 0.22);
	});

const sectionVocalityAt = (context: TrackVocalContext, timeMs: number): number => {
	for (let index = 0; index < context.sections.length; index += 1) {
		const section = context.sections[index];
		const start = (section.start ?? 0) * S_TO_MS;
		const end = start + (section.duration ?? 0) * S_TO_MS;
		if (timeMs >= start && timeMs < end) {
			return context.sectionVocality[index] ?? 0.5;
		}
	}
	return 0.5;
};

// ─────────────────── §5.4 candidate refinement (per line) ───────────────────

export const buildVocalCandidates = (start: number, end: number, context: TrackVocalContext, sectionVocality: number): VocalCandidate[] => {
	const region = context.scored.filter((segment) => segment.time >= start - 120 && segment.time <= end + 120);
	if (region.length === 0) {
		return [];
	}
	const refined = region.map((segment) => {
		const neighborSupport = neighborSupportFor(segment, region);
		const runSupport = runSupportFor(segment, region);
		const profileSimilarity = timbreSimilarity(segment.timbre, context.seedProfile);
		const harmonicRunBoost = segment.harmonicScore > 0.55 && runSupport > 0.4 ? 0.05 : 0;
		const percussionPenalty = percussionPenaltyFor(segment);
		const isolationPenalty = neighborSupport < 0.05 ? 0.08 : 0;
		const profilePenalty = context.seedProfile && profileSimilarity < 0.25 ? (0.25 - profileSimilarity) * 0.4 : 0;
		const lowVocalSectionPenalty = sectionVocality < 0.3 ? (0.3 - sectionVocality) * 0.4 : 0;
		const score = clamp01(
			segment.baseScore * 0.6 +
				neighborSupport * 0.24 +
				runSupport * 0.18 +
				profileSimilarity * 0.18 +
				sectionVocality * 0.12 +
				harmonicRunBoost -
				percussionPenalty -
				isolationPenalty -
				profilePenalty -
				lowVocalSectionPenalty
		);
		return {
			time: segment.time,
			score,
			segmentStart: segment.segmentStart,
			segmentEnd: segment.segmentEnd,
			durationMs: segment.durationMs,
			harmonicScore: segment.harmonicScore,
			pitchPeakIndex: segment.pitchPeakIndex,
		} satisfies VocalCandidate;
	});

	const threshold = sectionVocality < 0.3 ? 0.3 : 0.24;
	const accepted = refined.filter((candidate) => candidate.score >= threshold).sort((a, b) => a.time - b.time);
	return dedupeCandidates(accepted, 55);
};

const neighborSupportFor = (segment: ScoredSegment, region: ScoredSegment[]): number => {
	let sum = 0;
	let weight = 0;
	for (const other of region) {
		if (other === segment) {
			continue;
		}
		const gap = Math.abs(other.time - segment.time);
		if (gap > 110) {
			continue;
		}
		const pitchProximity = other.pitchPeakIndex >= 0 && other.pitchPeakIndex === segment.pitchPeakIndex ? 1 : 0.55;
		const gapDecay = clamp01(1 - gap / 110);
		sum += other.baseScore * pitchProximity * gapDecay;
		weight += 1;
	}
	return weight > 0 ? clamp01(sum / weight) : 0;
};

const runSupportFor = (segment: ScoredSegment, region: ScoredSegment[]): number => {
	const nearby = region.filter((other) => Math.abs(other.time - segment.time) <= 220 && other.harmonicScore >= 0.45);
	return clamp01((nearby.length - 1) / 4);
};

const percussionPenaltyFor = (segment: ScoredSegment): number => {
	if (segment.durationMs < 90 && segment.attackRatio < 0.12 && segment.onsetScore > 0.55) {
		return 0.18;
	}
	if (segment.harmonicScore < 0.35 && segment.contrastScore > 0.4) {
		return 0.1;
	}
	return 0;
};

const dedupeCandidates = (candidates: VocalCandidate[], minGapMs: number): VocalCandidate[] => {
	const result: VocalCandidate[] = [];
	for (const candidate of candidates) {
		const last = result[result.length - 1];
		if (last && candidate.time - last.time < minGapMs) {
			if (candidate.score > last.score) {
				result[result.length - 1] = candidate;
			}
			continue;
		}
		result.push(candidate);
	}
	return result;
};

// ─────────────────── §5.5 rhythm anchors ───────────────────

export const buildRhythmAnchors = (start: number, end: number, analysis: AudioAnalysisData | undefined): number[] => {
	const interval = Math.max(1, end - start);
	const minGap = clamp(interval / 140, 18, 90);
	const points: number[] = [];
	for (const beat of analysis?.beats ?? []) {
		if ((beat.confidence ?? 0) >= 0.2) {
			points.push(beat.start * S_TO_MS);
		}
	}
	for (const tatum of analysis?.tatums ?? []) {
		if ((tatum.confidence ?? 0) >= 0.12) {
			points.push(tatum.start * S_TO_MS);
		}
	}
	const within = points.filter((time) => time >= start && time <= end).sort((a, b) => a - b);
	const result: number[] = [];
	for (const time of within) {
		const last = result[result.length - 1];
		if (last === undefined || time - last >= minGap) {
			result.push(time);
		}
	}
	return result;
};

// ─────────────────── §5.6 active window ───────────────────
// Deviation from §5.6: the window start is pinned to the line start — line sync data is
// trusted for onset, so only the tail is trimmed toward where the vocal actually ends.

export const buildVocalActivityWindow = (
	start: number,
	end: number,
	candidates: VocalCandidate[],
	confidence: number
): { activeStart: number; activeEnd: number } => {
	const interval = Math.max(1, end - start);
	if (candidates.length === 0 || confidence < 0.36) {
		return { activeStart: start, activeEnd: end };
	}
	const clusterGap = clamp(interval * 0.16, 180, 520);
	const clusters: VocalCandidate[][] = [];
	let current: VocalCandidate[] = [];
	for (const candidate of candidates) {
		const last = current[current.length - 1];
		if (last && candidate.time - last.time > clusterGap) {
			clusters.push(current);
			current = [];
		}
		current.push(candidate);
	}
	if (current.length > 0) {
		clusters.push(current);
	}
	const strongest = clusters.sort((a, b) => clusterStrength(b) - clusterStrength(a))[0];
	if (!strongest) {
		return { activeStart: start, activeEnd: end };
	}
	const tailPad = clamp(interval * 0.05, 40, 220);
	const minActive = clamp(interval * 0.4, 260, interval);
	let activeEnd = Math.min(end, strongest[strongest.length - 1].segmentEnd + tailPad);
	if (activeEnd - start < minActive) {
		activeEnd = Math.min(end, start + minActive);
	}
	return { activeStart: start, activeEnd };
};

const clusterStrength = (cluster: VocalCandidate[]): number => cluster.reduce((sum, candidate) => sum + candidate.score, 0);

// ─────────────────── §5.7 vocal mass curve ───────────────────

export const buildVocalMassCurve = (
	start: number,
	end: number,
	candidates: VocalCandidate[],
	anchors: number[],
	confidence: number
): VocalMassCurve => {
	const interval = Math.max(1, end - start);
	const stepMs = clamp(Math.round(interval / 88), 18, 36);
	const frameCount = Math.max(2, Math.ceil(interval / stepMs) + 1);
	const anchorSet = new Set(anchors.map((time) => Math.round(time)));
	const floor = candidates.length ? Math.max(0.008, 0.012 - confidence * 0.004) : 0.004;
	const frames: MassFrame[] = [];
	for (let index = 0; index < frameCount; index += 1) {
		const time = index === frameCount - 1 ? end : Math.min(end, Math.round(start + index * stepMs));
		let mass = floor;
		for (const candidate of candidates) {
			const dur = Math.max(1, candidate.durationMs || candidate.segmentEnd - candidate.segmentStart || stepMs);
			const peakR = clamp(dur * 0.6, 55, 220);
			const sustainR = clamp(dur * 1.1, 90, 320);
			const peak = clamp01(1 - Math.abs(time - candidate.time) / peakR);
			const sustain = clamp01(1 - Math.abs(time - (candidate.segmentStart + candidate.segmentEnd) / 2) / sustainR);
			const inSeg = time >= candidate.segmentStart && time <= candidate.segmentEnd ? 1 : 0;
			mass += candidate.score * (peak * 0.7 + sustain * 0.35 + inSeg * 0.18);
		}
		if (anchorSet.has(time) && confidence < 0.5) {
			mass += 0.03 + (0.5 - confidence) * 0.04;
		}
		frames.push({ time, mass: Math.max(floor, mass), cumulative: 0 });
	}
	let cumulative = 0;
	for (const frame of frames) {
		cumulative += frame.mass;
		frame.cumulative = cumulative;
	}
	return { frames, stepMs, totalMass: cumulative };
};

export const getMassAtTime = (curve: VocalMassCurve, time: number): number => {
	const { frames } = curve;
	if (frames.length === 0) {
		return 0;
	}
	if (time <= frames[0].time) {
		return 0;
	}
	const last = frames[frames.length - 1];
	if (time >= last.time) {
		return last.cumulative;
	}
	for (let index = 1; index < frames.length; index += 1) {
		const next = frames[index];
		if (time <= next.time) {
			const prev = frames[index - 1];
			const span = next.time - prev.time || 1;
			const progress = (time - prev.time) / span;
			return prev.cumulative + (next.cumulative - prev.cumulative) * progress;
		}
	}
	return last.cumulative;
};

export const getLocalMassAtTime = (curve: VocalMassCurve, time: number): number => {
	const { frames } = curve;
	if (frames.length === 0) {
		return 0;
	}
	let closest = frames[0];
	for (const frame of frames) {
		if (Math.abs(frame.time - time) < Math.abs(closest.time - time)) {
			closest = frame;
		}
	}
	return closest.mass;
};

export const getTimeByMassTarget = (curve: VocalMassCurve, targetMass: number): number => {
	const { frames } = curve;
	if (frames.length === 0) {
		return 0;
	}
	if (targetMass <= 0) {
		return frames[0].time;
	}
	const last = frames[frames.length - 1];
	if (targetMass >= last.cumulative) {
		return last.time;
	}
	for (let index = 1; index < frames.length; index += 1) {
		const next = frames[index];
		if (targetMass <= next.cumulative) {
			const prev = frames[index - 1];
			const span = next.cumulative - prev.cumulative || 1;
			const progress = (targetMass - prev.cumulative) / span;
			return prev.time + (next.time - prev.time) * progress;
		}
	}
	return last.time;
};

export const getTimeByMassRatio = (curve: VocalMassCurve, ratio: number): number => getTimeByMassTarget(curve, curve.totalMass * clamp01(ratio));

// ─────────────────── §5.8 silence spans ───────────────────

export const buildSilenceSpans = (curve: VocalMassCurve, confidence: number): SilenceSpan[] => {
	const { frames, stepMs } = curve;
	if (frames.length === 0) {
		return [];
	}
	const avg = frames.reduce((sum, frame) => sum + frame.mass, 0) / frames.length;
	const threshold = avg * (confidence >= 0.52 ? 0.58 : 0.68);
	const minSpan = Math.max(stepMs * 2, 90);
	const spans: SilenceSpan[] = [];
	let runStart: number | undefined;
	let runMassSum = 0;
	let runCount = 0;
	const flush = (endTime: number) => {
		if (runStart === undefined) {
			return;
		}
		if (endTime - runStart >= minSpan) {
			spans.push({
				start: runStart,
				end: endTime,
				center: (runStart + endTime) / 2,
				avgMass: runCount > 0 ? runMassSum / runCount : 0,
			});
		}
		runStart = undefined;
		runMassSum = 0;
		runCount = 0;
	};
	for (const frame of frames) {
		if (frame.mass <= threshold) {
			if (runStart === undefined) {
				runStart = frame.time;
			}
			runMassSum += frame.mass;
			runCount += 1;
		} else {
			flush(frame.time);
		}
	}
	flush(frames[frames.length - 1].time);
	return spans;
};

// ─────────────────── §5.9 model assembly ───────────────────

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
