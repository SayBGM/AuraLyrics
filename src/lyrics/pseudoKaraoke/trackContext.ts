// §5.2 / §5.3 — derive track-wide vocal and section features.
import type { AudioAnalysisData, AudioAnalysisSection } from "../../audio/types";
import { scoreVocalCandidate } from "./scoring";
import type { ScoredSegment, SeedProfile, TrackVocalContext } from "./types";
import { clamp01 } from "./utils";

const S_TO_MS = 1000;

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

export const sectionVocalityAt = (context: TrackVocalContext, timeMs: number): number => {
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
