// §5.5 / §5.6 — build rhythm anchors and the active line window.
import type { AudioAnalysisData } from "../../audio/types";
import type { VocalCandidate } from "./types";
import { clamp } from "./utils";

const S_TO_MS = 1000;

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
