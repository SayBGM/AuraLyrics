// §5.4 — refine track-level segment scores into per-line vocal candidates.
import { timbreSimilarity } from "./scoring";
import type { ScoredSegment, TrackVocalContext, VocalCandidate } from "./types";
import { clamp01 } from "./utils";

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
