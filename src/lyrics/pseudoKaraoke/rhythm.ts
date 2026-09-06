// §5.5 / §5.6 — build rhythm anchors and the active line window.
import type { TrackVocalContext, VocalCandidate } from "./types";
import { clamp } from "./utils";

// First index whose value is >= target, in an ascending-sorted array (frames.length if none).
const lowerBoundIndex = (values: number[], target: number): number => {
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (values[mid] < target) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
};

export const buildRhythmAnchors = (start: number, end: number, context: TrackVocalContext): number[] => {
	const interval = Math.max(1, end - start);
	const minGap = clamp(interval / 140, 18, 90);
	const anchors = context.rhythmAnchors;
	const result: number[] = [];
	// `anchors` is sorted ascending track-wide, so [start, end] is a contiguous slice.
	for (let index = lowerBoundIndex(anchors, start); index < anchors.length; index += 1) {
		const time = anchors[index];
		if (time > end) {
			break;
		}
		const last = result[result.length - 1];
		if (last === undefined || time - last >= minGap) {
			result.push(time);
		}
	}
	return result;
};

// The window start is pinned to the line start. Line sync data is trusted for onset,
// so only the tail is trimmed toward where the vocal actually ends.
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
