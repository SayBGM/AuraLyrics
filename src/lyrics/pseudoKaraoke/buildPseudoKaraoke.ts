// §9 — assemble synthesized syllable timing from line lyrics + audio analysis.
import type { AudioAnalysisData } from "../../audio/types";
import type { Interlude, LineLyrics, LineVocal, Syllable, SyllableLyrics, SyllableVocal, SyllableVocalSet } from "../types";
import { alignPhraseUnitsWithDP } from "./dpAlign";
import { buildLineTimingModel } from "./lineTimingModel";
import { getTimeByMassRatio } from "./massCurve";
import { buildUnitPhrases, pickPhraseBoundaryTime } from "./phrases";
import { tokenizeLine } from "./tokenize";
import { buildTrackVocalContext } from "./trackContext";
import type { TrackVocalContext } from "./types";
import { getUnitWeight } from "./unitWeights";

const S_TO_MS = 1000;
const MS_TO_S = 1 / 1000;

const isWhitespace = (unit: string): boolean => unit.trim().length === 0;
const hasTrailingSpace = (unit: string): boolean => /\s$/u.test(unit);

// Convert a single line into a syllable vocal (times in ms in/out internally; output in seconds).
export const buildPseudoKaraokeLine = (
	line: LineVocal,
	analysis: AudioAnalysisData | undefined,
	context: TrackVocalContext
): SyllableVocal | null => {
	const startMs = line.startTime * S_TO_MS;
	const endMs = Math.max(startMs + 1, line.endTime * S_TO_MS);
	const lineDurationMs = endMs - startMs;

	const model = buildLineTimingModel(startMs, endMs, analysis, context);
	let units = tokenizeLine(line.text, { lineConfidence: model.confidence, lineDurationMs });
	if (units.length === 0) {
		return null;
	}
	let weights = units.map(getUnitWeight);

	if (model.conservativeMode) {
		units = mergeUnitsConservatively(units);
		weights = units.map(getUnitWeight);
	}

	const { activeStart, activeEnd } = model;
	const phrases = buildUnitPhrases(units, weights);
	if (phrases.length === 0) {
		return null;
	}

	// §7 — phrase boundary times.
	const phraseWeightTotal = phrases.reduce((sum, phrase) => sum + phrase.weight, 0) || 1;
	const phraseBoundaries: number[] = [activeStart];
	let acc = 0;
	for (let index = 0; index < phrases.length - 1; index += 1) {
		acc += phrases[index].weight;
		const targetTime = getTimeByMassRatio(model.vocalMassCurve, acc / phraseWeightTotal);
		const remaining = phrases.length - 1 - index;
		const boundary = pickPhraseBoundaryTime(targetTime, model, phraseBoundaries[phraseBoundaries.length - 1], remaining, activeEnd);
		phraseBoundaries.push(boundary);
	}
	phraseBoundaries.push(activeEnd);

	// §8 — per-phrase internal alignment.
	const boundaries: number[] = [activeStart];
	for (let index = 0; index < phrases.length; index += 1) {
		const phrase = phrases[index];
		const phraseUnits = units.slice(phrase.startIndex, phrase.endIndex + 1);
		const phraseWeights = weights.slice(phrase.startIndex, phrase.endIndex + 1);
		const pStart = phraseBoundaries[index];
		const pEnd = phraseBoundaries[index + 1];
		const internal = alignPhraseUnitsWithDP(phraseUnits, phraseWeights, pStart, pEnd, model);
		for (let k = 1; k < internal.length; k += 1) {
			boundaries.push(internal[k]);
		}
	}

	// Line-window invariant: the greedy fallback's minimum-gap cascade can walk past the
	// phrase end on degenerate inputs, so clamp every boundary into [startMs, endMs] and
	// force monotonic order before emitting syllables.
	for (let index = 0; index < boundaries.length; index += 1) {
		const lowerBound = index > 0 ? boundaries[index - 1] : startMs;
		boundaries[index] = Math.min(endMs, Math.max(lowerBound, boundaries[index]));
	}

	// Build syllables, dropping whitespace-only units.
	const syllables: Syllable[] = [];
	let prevEndedWithSpace = true;
	for (let index = 0; index < units.length; index += 1) {
		const unit = units[index];
		if (isWhitespace(unit)) {
			prevEndedWithSpace = true;
			continue;
		}
		const text = unit.trim();
		// The previous syllable's minimum-duration floor can pass the next boundary, so
		// floor the start at the previous end to keep syllables ordered and non-overlapping.
		const startTime = Math.max(boundaries[index] * MS_TO_S, syllables.at(-1)?.endTime ?? startMs * MS_TO_S);
		const endTime = Math.min(endMs * MS_TO_S, Math.max(startTime + MS_TO_S, boundaries[index + 1] * MS_TO_S));
		syllables.push({ text, startTime, endTime, isPartOfWord: !prevEndedWithSpace });
		prevEndedWithSpace = hasTrailingSpace(unit);
	}
	if (syllables.length === 0) {
		return null;
	}

	return {
		startTime: syllables[0].startTime,
		endTime: syllables[syllables.length - 1].endTime,
		syllables,
	};
};

// Convert line lyrics → syllable lyrics. Returns null when synthesis is not possible.
export const buildPseudoKaraokeLyrics = (
	lyrics: LineLyrics,
	analysis: AudioAnalysisData | undefined,
	_durationMs?: number
): SyllableLyrics | null => {
	const context = buildTrackVocalContext(analysis);
	if (context.scored.length === 0) {
		return null;
	}

	const content: Array<SyllableVocalSet | Interlude> = [];
	let synthesizedAny = false;
	for (const item of lyrics.content) {
		if (item.type === "interlude") {
			content.push(item);
			continue;
		}
		const lead = buildPseudoKaraokeLine(item, analysis, context);
		if (!lead) {
			// Fall back to a single full-line syllable so the line still renders.
			content.push(lineToSingleSyllableSet(item));
			continue;
		}
		synthesizedAny = true;
		content.push({ type: "vocal", oppositeAligned: item.oppositeAligned, lead, translatedText: item.translatedText });
	}

	if (!synthesizedAny) {
		return null;
	}

	return {
		type: "syllable",
		startTime: lyrics.startTime,
		endTime: lyrics.endTime,
		content,
	};
};

const lineToSingleSyllableSet = (line: LineVocal): SyllableVocalSet => ({
	type: "vocal",
	oppositeAligned: line.oppositeAligned,
	translatedText: line.translatedText,
	lead: {
		startTime: line.startTime,
		endTime: line.endTime,
		syllables: [{ text: line.text, startTime: line.startTime, endTime: line.endTime, isPartOfWord: false }],
	},
});

// mergeUnitsConservatively — combine adjacent non-space units within a word to avoid over-splitting.
const mergeUnitsConservatively = (units: string[]): string[] => {
	const result: string[] = [];
	let index = 0;
	while (index < units.length) {
		const unit = units[index];
		if (isWhitespace(unit)) {
			result.push(unit);
			index += 1;
			continue;
		}
		if (index + 1 < units.length && !isWhitespace(units[index + 1]) && !hasTrailingSpace(unit)) {
			result.push(unit + units[index + 1]);
			index += 2;
			continue;
		}
		result.push(unit);
		index += 1;
	}
	return result;
};
