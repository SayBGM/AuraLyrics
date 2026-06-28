// §6 / §7 — group units into breath phrases, and place phrase boundaries in time.
import { AGGRESSIVE } from "./tokenize";
import { clamp } from "./utils";
import type { LineTimingModel } from "./vocalModel";
import { getLocalMassAtTime } from "./vocalModel";

export type Phrase = {
	startIndex: number;
	endIndex: number; // inclusive
	weight: number;
};

const HARD_BREAK = /[.!?;:)\]）。！？；：]$/u;
const MIN_BOUNDARY_GAP_MS = 80;

const isWhitespace = (unit: string): boolean => unit.trim().length === 0;
const hasTrailingSpace = (unit: string): boolean => /\s$/u.test(unit);
const startsWord = (units: string[], index: number): boolean =>
	!isWhitespace(units[index]) && (index === 0 || hasTrailingSpace(units[index - 1]) || isWhitespace(units[index - 1]));

const isCjkDominant = (units: string[]): boolean => {
	let aggressive = 0;
	let total = 0;
	for (const unit of units) {
		for (const char of unit) {
			if (/\s/u.test(char)) {
				continue;
			}
			total += 1;
			if (AGGRESSIVE.test(char)) {
				aggressive += 1;
			}
		}
	}
	return total > 0 && aggressive / total >= 0.5;
};

export const buildUnitPhrases = (units: string[], weights: number[]): Phrase[] => {
	if (units.length === 0) {
		return [];
	}
	const cjkDominant = isCjkDominant(units);
	const maxSize = cjkDominant ? 6 : 4;
	const phrases: Phrase[] = [];
	let startIndex = 0;
	let weightAcc = 0;
	let wordCount = 0;
	let size = 0;

	const flush = (endIndex: number) => {
		phrases.push({ startIndex, endIndex, weight: weights.slice(startIndex, endIndex + 1).reduce((sum, value) => sum + value, 0) });
		startIndex = endIndex + 1;
		weightAcc = 0;
		wordCount = 0;
		size = 0;
	};

	for (let index = 0; index < units.length; index += 1) {
		const unit = units[index];
		weightAcc += weights[index];
		if (startsWord(units, index)) {
			wordCount += 1;
		}
		if (!isWhitespace(unit)) {
			size += 1;
		}
		if (index === units.length - 1) {
			flush(index);
			break;
		}
		const trimmed = unit.trim();
		const hardBreak = HARD_BREAK.test(trimmed) || size >= maxSize;
		const nextIsLetter = !isWhitespace(units[index + 1]);
		const softBreak =
			hasTrailingSpace(unit) && nextIsLetter && (cjkDominant ? weightAcc >= 3.2 || wordCount >= 5 : weightAcc >= 4.6 || wordCount >= 3);
		if (hardBreak || softBreak) {
			flush(index);
		}
	}
	return phrases;
};

// §7 — snap a target boundary time onto a breath point (silence span / mass valley).
export const pickPhraseBoundaryTime = (
	targetTime: number,
	model: LineTimingModel,
	prevBoundary: number,
	remaining: number,
	activeEnd: number
): number => {
	const interval = Math.max(1, model.activeEnd - model.activeStart);
	const searchRadius = clamp(interval * 0.08, 60, 320);
	const lowerBound = prevBoundary + MIN_BOUNDARY_GAP_MS;
	const upperBound = activeEnd - remaining * MIN_BOUNDARY_GAP_MS;
	if (upperBound <= lowerBound) {
		return clamp(targetTime, prevBoundary + 1, activeEnd);
	}

	const silence = model.silenceSpans
		.filter((span) => Math.abs(span.center - targetTime) <= searchRadius)
		.sort((a, b) => a.avgMass - b.avgMass || Math.abs(a.center - targetTime) - Math.abs(b.center - targetTime))[0];
	if (silence) {
		return clamp(silence.center, lowerBound, upperBound);
	}

	const { frames } = model.vocalMassCurve;
	let best: number | undefined;
	let bestMass = Number.POSITIVE_INFINITY;
	for (const frame of frames) {
		if (Math.abs(frame.time - targetTime) > searchRadius) {
			continue;
		}
		if (frame.mass < bestMass) {
			bestMass = frame.mass;
			best = frame.time;
		}
	}
	if (best !== undefined) {
		return clamp(best, lowerBound, upperBound);
	}
	return clamp(targetTime, lowerBound, upperBound);
};

export { getLocalMassAtTime };
