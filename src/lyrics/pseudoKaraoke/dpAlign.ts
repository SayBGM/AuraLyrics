// §8 — align units inside a phrase onto candidate boundary times via min-cost DP.
import {
	DP_CUMULATIVE_ERROR,
	DP_DURATION_ERROR_LEXICAL,
	DP_DURATION_ERROR_SPACE,
	DP_MASS_ERROR_BASE,
	DP_MASS_ERROR_CONFIDENCE,
	MIN_GAP_MS,
} from "./constants";
import { clamp } from "./utils";
import type { LineTimingModel } from "./vocalModel";
import { getLocalMassAtTime, getMassAtTime, getTimeByMassTarget } from "./vocalModel";

const isSpace = (unit: string): boolean => unit.trim().length === 0;
const isLexical = (unit: string): boolean => /[\p{L}\p{N}]/u.test(unit);

// §8.1 — collect candidate boundary times.
export const buildPhraseBoundaryCandidates = (phraseStart: number, phraseEnd: number, model: LineTimingModel): number[] => {
	const points: number[] = [phraseStart, phraseEnd];
	for (const frame of model.vocalMassCurve.frames) {
		if (frame.time > phraseStart && frame.time < phraseEnd && frame.mass > 0) {
			points.push(frame.time);
		}
	}
	for (const anchor of model.rhythmAnchors) {
		if (anchor > phraseStart && anchor < phraseEnd) {
			points.push(anchor);
		}
	}
	for (const span of model.silenceSpans) {
		for (const time of [span.start, span.center, span.end]) {
			if (time > phraseStart && time < phraseEnd) {
				points.push(time);
			}
		}
	}
	for (const candidate of model.vocalCandidates) {
		for (const time of [candidate.time, candidate.segmentStart, candidate.segmentEnd]) {
			if (time > phraseStart && time < phraseEnd) {
				points.push(time);
			}
		}
	}
	const sorted = points.sort((a, b) => a - b);
	const deduped: number[] = [];
	for (const time of sorted) {
		const last = deduped[deduped.length - 1];
		if (last === undefined || time - last >= 8) {
			deduped.push(time);
		}
	}
	if (deduped[0] !== phraseStart) {
		deduped.unshift(phraseStart);
	}
	if (deduped[deduped.length - 1] !== phraseEnd) {
		deduped.push(phraseEnd);
	}
	return deduped;
};

// §8.2 — DP. Returns boundary times of length unitCount + 1 (phraseStart..phraseEnd).
export const alignPhraseUnitsWithDP = (
	units: string[],
	weights: number[],
	phraseStart: number,
	phraseEnd: number,
	model: LineTimingModel
): number[] => {
	const unitCount = units.length;
	if (unitCount === 0) {
		return [phraseStart, phraseEnd];
	}
	if (unitCount === 1) {
		return [phraseStart, phraseEnd];
	}
	const candidates = buildPhraseBoundaryCandidates(phraseStart, phraseEnd, model);
	if (candidates.length < unitCount + 1) {
		return buildGreedyPhraseBoundaries(units, weights, phraseStart, phraseEnd, model);
	}

	const curve = model.vocalMassCurve;
	const phraseDuration = Math.max(1, phraseEnd - phraseStart);
	const cumMassStart = getMassAtTime(curve, phraseStart);
	const phraseTotalMass = Math.max(1e-6, getMassAtTime(curve, phraseEnd) - cumMassStart);
	const weightTotal = Math.max(
		1e-6,
		weights.reduce((sum, value) => sum + value, 0)
	);
	const averageDensity = phraseTotalMass / phraseDuration;
	const averageLocalMass = Math.max(1e-6, curve.frames.reduce((sum, frame) => sum + frame.mass, 0) / Math.max(1, curve.frames.length));
	const confidence = model.confidence;

	const prefix: number[] = [0];
	for (let index = 0; index < unitCount; index += 1) {
		prefix.push(prefix[index] + weights[index]);
	}
	const cumMass = candidates.map((time) => getMassAtTime(curve, time));
	const m = candidates.length;

	const transitionCost = (unitIndex: number, prev: number, current: number): number => {
		const time = candidates[current];
		const prevTime = candidates[prev];
		const segmentDuration = time - prevTime;
		if (segmentDuration < MIN_GAP_MS) {
			return Number.POSITIVE_INFINITY;
		}
		const unit = units[unitIndex];
		const expectedSegmentRatio = weights[unitIndex] / weightTotal;
		const expectedCumulativeRatio = prefix[unitIndex + 1] / weightTotal;
		const segmentMass = cumMass[current] - cumMass[prev];
		const actualSegmentRatio = segmentMass / phraseTotalMass;
		const actualDurationRatio = segmentDuration / phraseDuration;
		const actualCumulativeRatio = (cumMass[current] - cumMassStart) / phraseTotalMass;

		const massError = Math.abs(actualSegmentRatio - expectedSegmentRatio);
		const durationError = Math.abs(actualDurationRatio - expectedSegmentRatio);
		const cumulativeError = Math.abs(actualCumulativeRatio - expectedCumulativeRatio);
		const densityNorm = segmentMass / segmentDuration / averageDensity;

		const space = isSpace(unit);
		const lexical = isLexical(unit);
		const densityPenalty = lexical
			? Math.max(0, 0.82 - densityNorm) * 0.55
			: space
				? Math.max(0, densityNorm - 0.7) * 0.18
				: Math.max(0, densityNorm - 1.15) * 0.12;

		const isFinal = unitIndex === unitCount - 1;
		const localMassNorm = getLocalMassAtTime(curve, time) / averageLocalMass;
		const boundaryPenalty = isFinal ? 0 : localMassNorm * (0.11 + confidence * 0.06);
		// Let the phrase-final unit absorb a sustained tail (melisma) instead of being
		// penalized for it; keep the penalty on non-final units to avoid over-splitting.
		const longTailPenalty =
			!isFinal && lexical && actualDurationRatio > expectedSegmentRatio * 2.4 ? (actualDurationRatio - expectedSegmentRatio * 2.4) * 1.1 : 0;

		return (
			massError * (DP_MASS_ERROR_BASE + confidence * DP_MASS_ERROR_CONFIDENCE) +
			durationError * (space ? DP_DURATION_ERROR_SPACE : DP_DURATION_ERROR_LEXICAL) +
			cumulativeError * DP_CUMULATIVE_ERROR +
			densityPenalty +
			boundaryPenalty +
			longTailPenalty
		);
	};

	// dp[u][c] = min cost to end unit u at candidate c. Unit 0 starts at candidate 0.
	const dp: number[][] = Array.from({ length: unitCount }, () => new Array(m).fill(Number.POSITIVE_INFINITY));
	const parent: number[][] = Array.from({ length: unitCount }, () => new Array(m).fill(-1));

	for (let current = 1; current < m; current += 1) {
		// Leave room for the remaining units after unit 0.
		if (m - 1 - current < unitCount - 1) {
			continue;
		}
		const cost = transitionCost(0, 0, current);
		if (Number.isFinite(cost)) {
			dp[0][current] = cost;
			parent[0][current] = 0;
		}
	}

	for (let unitIndex = 1; unitIndex < unitCount; unitIndex += 1) {
		const isFinal = unitIndex === unitCount - 1;
		for (let current = unitIndex + 1; current < m; current += 1) {
			if (isFinal && current !== m - 1) {
				continue;
			}
			if (!isFinal && m - 1 - current < unitCount - 1 - unitIndex) {
				continue;
			}
			let best = Number.POSITIVE_INFINITY;
			let bestPrev = -1;
			for (let prev = unitIndex; prev < current; prev += 1) {
				if (!Number.isFinite(dp[unitIndex - 1][prev])) {
					continue;
				}
				const cost = dp[unitIndex - 1][prev] + transitionCost(unitIndex, prev, current);
				if (cost < best) {
					best = cost;
					bestPrev = prev;
				}
			}
			dp[unitIndex][current] = best;
			parent[unitIndex][current] = bestPrev;
		}
	}

	const finalCandidate = m - 1;
	if (!Number.isFinite(dp[unitCount - 1][finalCandidate])) {
		return buildGreedyPhraseBoundaries(units, weights, phraseStart, phraseEnd, model);
	}

	const boundaries = new Array(unitCount + 1).fill(phraseStart);
	boundaries[unitCount] = phraseEnd;
	let candidateIndex = finalCandidate;
	for (let unitIndex = unitCount - 1; unitIndex >= 0; unitIndex -= 1) {
		boundaries[unitIndex + 1] = candidates[candidateIndex];
		const prev = parent[unitIndex][candidateIndex];
		candidateIndex = prev >= 0 ? prev : 0;
	}
	boundaries[0] = phraseStart;
	return boundaries;
};

// §8.3 — greedy fallback.
export const buildGreedyPhraseBoundaries = (
	units: string[],
	weights: number[],
	phraseStart: number,
	phraseEnd: number,
	model: LineTimingModel
): number[] => {
	const unitCount = units.length;
	const curve = model.vocalMassCurve;
	const cumMassStart = getMassAtTime(curve, phraseStart);
	const phraseTotalMass = Math.max(1e-6, getMassAtTime(curve, phraseEnd) - cumMassStart);
	const weightTotal = Math.max(
		1e-6,
		weights.reduce((sum, value) => sum + value, 0)
	);
	const boundaries: number[] = [phraseStart];
	let weightAcc = 0;
	for (let index = 0; index < unitCount - 1; index += 1) {
		weightAcc += weights[index];
		const ratio = weightAcc / weightTotal;
		const targetMass = cumMassStart + ratio * phraseTotalMass;
		const time = getTimeByMassTarget(curve, targetMass);
		const lower = boundaries[boundaries.length - 1] + MIN_GAP_MS;
		const upper = phraseEnd - (unitCount - 1 - index) * MIN_GAP_MS;
		boundaries.push(clamp(time, lower, Math.max(lower, upper)));
	}
	boundaries.push(phraseEnd);
	return boundaries;
};
