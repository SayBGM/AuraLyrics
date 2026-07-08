import type { Syllable } from "../../lyrics/types";
import type { RhythmProfile } from "../AudioAnalysisWaveformService";
import { clamp } from "../animation/Spline";
import type { TimedParentheticalSegment } from "./parentheticalSegments";

export type KoreanTailSplit = {
	baseText: string;
	tailText: string;
	tailStartTime: number;
	melisma: boolean;
};

export type MelismaBoost = {
	step: number;
	scale: number;
	yOffset: number;
	glow: number;
};

const MIN_KOREAN_TAIL_DURATION_SEC = 1.35;
const MIN_SINGLE_TOKEN_KOREAN_TAIL_DURATION_SEC = 1.8;
const KOREAN_TAIL_RATIO = 2.1;
const MIN_KOREAN_TAIL_MAIN_SEC = 0.35;
const MIN_KOREAN_TAIL_SEC = 0.75;
const MAX_KOREAN_TAIL_SEC = 1.8;
const LONG_KOREAN_MELISMA_DURATION_SEC = 5;

export const koreanTailSplitForSegment = (
	segment: TimedParentheticalSegment,
	syllable: Syllable,
	allSyllables: Syllable[],
	rhythm: RhythmProfile | undefined
): KoreanTailSplit | undefined => {
	if (!isKoreanTailCandidate(segment.text, syllable, allSyllables, rhythm)) {
		return undefined;
	}
	const textSplit = splitFinalHangulSyllable(segment.text);
	if (!textSplit) {
		return undefined;
	}
	const duration = segment.endTime - segment.startTime;
	const maxTailDuration = Math.max(MIN_KOREAN_TAIL_MAIN_SEC, duration - MIN_KOREAN_TAIL_MAIN_SEC);
	const melisma = isLongKoreanMelisma(duration);
	const tailDuration = Math.min(tailDurationForRhythm(duration, rhythm, melisma), maxTailDuration);
	return {
		...textSplit,
		tailStartTime: segment.endTime - tailDuration,
		melisma,
	};
};

export const melismaBoostForProgress = (progress: number): MelismaBoost => {
	const step = progress > 0 && progress < 1 ? Math.min(4, Math.floor(progress * 5) + 1) : 0;
	const shimmer = Math.max(0, Math.sin(progress * Math.PI * 10));
	return {
		step,
		scale: step * 0.012 + shimmer * 0.018,
		yOffset: -(step * 0.025 + shimmer * 0.012),
		glow: step > 0 ? 0.34 + step * 0.085 + shimmer * 0.12 : 0,
	};
};

const isKoreanTailCandidate = (text: string, syllable: Syllable, allSyllables: Syllable[], rhythm: RhythmProfile | undefined): boolean =>
	!syllable.isPartOfWord && isFinalHeldKoreanSyllable(text, syllable, allSyllables, rhythm);

// Whether `syllable` is the line's last syllable, made of plain Hangul text (no parens,
// whitespace, or Latin-only content), and held long enough to warrant a sustain/melisma
// effect. Deliberately ignores isPartOfWord so split single-character syllables still qualify.
const isFinalHeldKoreanSyllable = (text: string, syllable: Syllable, allSyllables: Syllable[], rhythm: RhythmProfile | undefined): boolean => {
	const trimmed = text.trim();
	if (
		trimmed.length !== text.length ||
		/\s/u.test(trimmed) ||
		/[()（）]/u.test(trimmed) ||
		!/[가-힣]/u.test(trimmed) ||
		allSyllables.at(-1) !== syllable
	) {
		return false;
	}
	const duration = syllable.endTime - syllable.startTime;
	if (duration < minKoreanTailDuration(rhythm)) {
		return false;
	}
	const previousDurations = allSyllables
		.slice(0, -1)
		.map((item) => item.endTime - item.startTime)
		.filter((item) => Number.isFinite(item) && item > 0.05);
	if (previousDurations.length === 0) {
		return duration >= minSingleTokenKoreanTailDuration(rhythm);
	}
	return duration >= median(previousDurations) * KOREAN_TAIL_RATIO;
};

// Single split-out Hangul character (from splitHangulSyllables) plus optional trailing
// punctuation, e.g. "해" or "해," — but not a parenthesized token.
const SINGLE_HELD_KOREAN_CHAR = /^[가-힣][^\p{L}\p{N}\s]*$/u;

export const melismaSustainClassesForFinalSyllable = (
	segment: TimedParentheticalSegment,
	syllable: Syllable,
	allSyllables: Syllable[],
	rhythm: RhythmProfile | undefined
): string[] | undefined => {
	if (/[()（）]/u.test(segment.text) || !SINGLE_HELD_KOREAN_CHAR.test(segment.text)) {
		return undefined;
	}
	if (!isFinalHeldKoreanSyllable(segment.text, syllable, allSyllables, rhythm)) {
		return undefined;
	}
	const duration = segment.endTime - segment.startTime;
	return isLongKoreanMelisma(duration) ? ["korean-tail-sustain", "korean-melisma-sustain"] : ["korean-tail-sustain"];
};

const minKoreanTailDuration = (rhythm: RhythmProfile | undefined): number => {
	const beatDuration = rhythm?.beatDurationSec;
	return beatDuration && Number.isFinite(beatDuration) ? clamp(beatDuration * 2.5, 0.95, 1.8) : MIN_KOREAN_TAIL_DURATION_SEC;
};

const minSingleTokenKoreanTailDuration = (rhythm: RhythmProfile | undefined): number => {
	const beatDuration = rhythm?.beatDurationSec;
	return beatDuration && Number.isFinite(beatDuration) ? clamp(beatDuration * 3.25, 1.25, 2.3) : MIN_SINGLE_TOKEN_KOREAN_TAIL_DURATION_SEC;
};

const tailDurationForRhythm = (duration: number, rhythm: RhythmProfile | undefined, melisma: boolean): number => {
	if (melisma) {
		const beatDuration = rhythm?.beatDurationSec;
		const baseDuration = beatDuration && Number.isFinite(beatDuration) ? clamp(beatDuration * 2.5, 0.9, 1.8) : clamp(duration * 0.16, 0.9, 1.8);
		return duration - baseDuration;
	}
	const beatDuration = rhythm?.beatDurationSec;
	if (!beatDuration || !Number.isFinite(beatDuration)) {
		return Math.min(Math.max(duration * 0.45, MIN_KOREAN_TAIL_SEC), MAX_KOREAN_TAIL_SEC);
	}
	return clamp(beatDuration * 2.4, Math.min(0.62, duration * 0.4), Math.min(MAX_KOREAN_TAIL_SEC, duration * 0.72));
};

const isLongKoreanMelisma = (duration: number): boolean => duration >= LONG_KOREAN_MELISMA_DURATION_SEC;

const splitFinalHangulSyllable = (text: string): Pick<KoreanTailSplit, "baseText" | "tailText"> | undefined => {
	const match = /^(.*)([가-힣])([^\p{L}\p{N}\s]*)$/u.exec(text);
	if (!match) {
		return undefined;
	}
	const [, baseText, finalSyllable, trailingPunctuation] = match;
	if (!baseText || !/[가-힣]/u.test(baseText)) {
		return undefined;
	}
	return {
		baseText,
		tailText: `${finalSyllable}${trailingPunctuation}`,
	};
};

const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};
