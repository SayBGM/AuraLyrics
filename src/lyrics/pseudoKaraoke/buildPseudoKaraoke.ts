// §9 — assemble synthesized syllable timing from line lyrics + audio analysis.

import type { AudioAnalysisData } from "../../renderer/AudioAnalysisWaveformService";
import { parseWordLevelParentheticals } from "../../renderer/lyrics/parentheticalSegments";
import type { Interlude, LineLyrics, LineVocal, Syllable, SyllableLyrics, SyllableVocal, SyllableVocalSet } from "../types";
import { LOW_CONFIDENCE_FLOOR, ONSET_OVERSPLIT_RATIO, ONSET_STRONG } from "./constants";
import { alignPhraseUnitsWithDP } from "./dpAlign";
import { buildUnitPhrases, pickPhraseBoundaryTime } from "./phrases";
import { tokenizeLine } from "./tokenize";
import { getUnitWeight } from "./unitWeights";
import {
	buildLineTimingModel,
	buildTrackVocalContext,
	getMassAtTime,
	getTimeByMassTarget,
	type LineTimingModel,
	type TrackVocalContext,
} from "./vocalModel";

const S_TO_MS = 1000;
const MS_TO_S = 1 / 1000;

const isWhitespace = (unit: string): boolean => unit.trim().length === 0;
const hasTrailingSpace = (unit: string): boolean => /\s$/u.test(unit);
const countLexical = (units: string[]): number => units.filter((unit) => !isWhitespace(unit)).length;

type RawSyllable = { text: string; startMs: number; endMs: number; isPartOfWord: boolean };

export type PseudoKaraokeResult = { lyrics: SyllableLyrics; averageConfidence: number };
type LineSynthesis = { lead: SyllableVocal; background?: SyllableVocal[]; confidence: number };

// Convert line lyrics → syllable lyrics. Returns null when synthesis is not possible.
export const buildPseudoKaraokeLyrics = (
	lyrics: LineLyrics,
	analysis: AudioAnalysisData | undefined,
	_durationMs?: number
): PseudoKaraokeResult | null => {
	const context = buildTrackVocalContext(analysis);
	if (context.scored.length === 0) {
		return null;
	}

	const content: Array<SyllableVocalSet | Interlude> = [];
	const confidences: number[] = [];
	let synthesizedAny = false;
	for (const item of lyrics.content) {
		if (item.type === "interlude") {
			content.push(item);
			continue;
		}
		const synthesis = buildPseudoKaraokeLine(item, analysis, context);
		if (!synthesis) {
			content.push(lineToSingleSyllableSet(item));
			continue;
		}
		synthesizedAny = true;
		confidences.push(synthesis.confidence);
		content.push({ type: "vocal", oppositeAligned: item.oppositeAligned, lead: synthesis.lead, background: synthesis.background });
	}

	if (!synthesizedAny) {
		return null;
	}

	const averageConfidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0;
	return {
		lyrics: { type: "syllable", startTime: lyrics.startTime, endTime: lyrics.endTime, content },
		averageConfidence,
	};
};

// Synthesize one line, splitting parenthetical "(...)" spans into background vocals.
export const buildPseudoKaraokeLine = (
	line: LineVocal,
	analysis: AudioAnalysisData | undefined,
	context: TrackVocalContext
): LineSynthesis | null => {
	const startMs = line.startTime * S_TO_MS;
	const endMs = Math.max(startMs + 1, line.endTime * S_TO_MS);
	const model = buildLineTimingModel(startMs, endMs, analysis, context);
	const lineConfidence = model.confidence;
	const { activeStart, activeEnd } = model;

	const segments = parseWordLevelParentheticals(line.text, false);
	const hasParenthetical = segments.some((segment) => segment.isParenthetical);

	if (!hasParenthetical) {
		const raw = buildSyllablesForSpan(line.text, activeStart, activeEnd, model, lineConfidence);
		const lead = rawToVocal(raw);
		return lead ? { lead, confidence: lineConfidence } : null;
	}

	// Allocate a time sub-window per segment, proportional to its sung weight.
	const segWeights = segments.map((segment) => spanWeight(segment.text, lineConfidence, activeEnd - activeStart));
	const totalSegWeight = segWeights.reduce((sum, value) => sum + value, 0) || 1;
	const leadSyllables: RawSyllable[] = [];
	const background: SyllableVocal[] = [];
	let spanStart = activeStart;
	let acc = 0;
	for (let index = 0; index < segments.length; index += 1) {
		acc += segWeights[index];
		const spanEnd = index === segments.length - 1 ? activeEnd : massWindowTime(model, acc / totalSegWeight, activeStart, activeEnd, spanStart);
		const raw = buildSyllablesForSpan(segments[index].text, spanStart, spanEnd, model, lineConfidence);
		if (segments[index].isParenthetical) {
			const vocal = rawToVocal(raw);
			if (vocal) {
				background.push(vocal);
			}
		} else {
			leadSyllables.push(...raw);
		}
		spanStart = spanEnd;
	}

	const lead = rawToVocal(leadSyllables);
	if (!lead) {
		// All-parenthetical or empty main: fall back to a single full-line lead.
		const fallback = rawToVocal(buildSyllablesForSpan(line.text, activeStart, activeEnd, model, lineConfidence));
		return fallback ? { lead: fallback, confidence: lineConfidence } : null;
	}
	return { lead, background: background.length ? background : undefined, confidence: lineConfidence };
};

// Build syllables for a text span constrained to [spanStart, spanEnd] (ms).
const buildSyllablesForSpan = (text: string, spanStart: number, spanEnd: number, model: LineTimingModel, lineConfidence: number): RawSyllable[] => {
	let units = tokenizeLine(text, { lineConfidence, lineDurationMs: Math.max(1, spanEnd - spanStart) });
	if (units.length === 0) {
		return [];
	}
	let weights = units.map(getUnitWeight);

	const spanCandidates = model.vocalCandidates.filter((candidate) => candidate.time >= spanStart - 1 && candidate.time <= spanEnd + 1);
	if (spanCandidates.length === 0 || model.confidence < LOW_CONFIDENCE_FLOOR) {
		return distributeByWeight(units, weights, spanStart, spanEnd);
	}

	// Onset-aware merge: avoid producing far more syllables than detected vocal onsets.
	const onsetCount = spanCandidates.filter((candidate) => candidate.score >= ONSET_STRONG).length;
	const target = model.conservativeMode ? Math.max(1, onsetCount) : Math.max(1, Math.round(onsetCount * ONSET_OVERSPLIT_RATIO));
	while (countLexical(units) > target) {
		const merged = mergeUnitsConservatively(units);
		if (merged.length === units.length) {
			break;
		}
		units = merged;
		weights = units.map(getUnitWeight);
	}

	return buildSpanBoundaries(units, weights, spanStart, spanEnd, model);
};

const buildSpanBoundaries = (units: string[], weights: number[], spanStart: number, spanEnd: number, model: LineTimingModel): RawSyllable[] => {
	const phrases = buildUnitPhrases(units, weights);
	if (phrases.length === 0) {
		return distributeByWeight(units, weights, spanStart, spanEnd);
	}

	const curve = model.vocalMassCurve;
	const massStart = getMassAtTime(curve, spanStart);
	const massSpan = Math.max(1e-6, getMassAtTime(curve, spanEnd) - massStart);
	const phraseWeightTotal = phrases.reduce((sum, phrase) => sum + phrase.weight, 0) || 1;

	const phraseBoundaries: number[] = [spanStart];
	let acc = 0;
	for (let index = 0; index < phrases.length - 1; index += 1) {
		acc += phrases[index].weight;
		const targetTime = getTimeByMassTarget(curve, massStart + (acc / phraseWeightTotal) * massSpan);
		const remaining = phrases.length - 1 - index;
		phraseBoundaries.push(pickPhraseBoundaryTime(targetTime, model, phraseBoundaries[phraseBoundaries.length - 1], remaining, spanEnd));
	}
	phraseBoundaries.push(spanEnd);

	const boundaries: number[] = [spanStart];
	for (let index = 0; index < phrases.length; index += 1) {
		const phrase = phrases[index];
		const phraseUnits = units.slice(phrase.startIndex, phrase.endIndex + 1);
		const phraseWeights = weights.slice(phrase.startIndex, phrase.endIndex + 1);
		const internal = alignPhraseUnitsWithDP(phraseUnits, phraseWeights, phraseBoundaries[index], phraseBoundaries[index + 1], model);
		for (let k = 1; k < internal.length; k += 1) {
			boundaries.push(internal[k]);
		}
	}
	return unitsToRawSyllables(units, boundaries);
};

const distributeByWeight = (units: string[], weights: number[], startMs: number, endMs: number): RawSyllable[] => {
	const total = weights.reduce((sum, value) => sum + value, 0) || 1;
	const boundaries: number[] = [startMs];
	let acc = 0;
	for (let index = 0; index < units.length; index += 1) {
		acc += weights[index];
		boundaries.push(startMs + (acc / total) * (endMs - startMs));
	}
	boundaries[units.length] = endMs;
	return unitsToRawSyllables(units, boundaries);
};

const unitsToRawSyllables = (units: string[], boundaries: number[]): RawSyllable[] => {
	const raw: RawSyllable[] = [];
	let prevEndedWithSpace = true;
	for (let index = 0; index < units.length; index += 1) {
		const unit = units[index];
		if (isWhitespace(unit)) {
			prevEndedWithSpace = true;
			continue;
		}
		raw.push({
			text: unit.trim(),
			startMs: boundaries[index],
			endMs: Math.max(boundaries[index] + 1, boundaries[index + 1]),
			isPartOfWord: !prevEndedWithSpace,
		});
		prevEndedWithSpace = hasTrailingSpace(unit);
	}
	return raw;
};

const rawToVocal = (raw: RawSyllable[]): SyllableVocal | null => {
	if (raw.length === 0) {
		return null;
	}
	const syllables: Syllable[] = raw.map((item) => {
		const startTime = item.startMs * MS_TO_S;
		return { text: item.text, startTime, endTime: Math.max(startTime + MS_TO_S, item.endMs * MS_TO_S), isPartOfWord: item.isPartOfWord };
	});
	return { startTime: syllables[0].startTime, endTime: syllables[syllables.length - 1].endTime, syllables };
};

// Map a mass ratio to a time within [windowStart, windowEnd] (ms), clamped above `floor`.
const massWindowTime = (model: LineTimingModel, ratio: number, windowStart: number, windowEnd: number, floor: number): number => {
	const curve = model.vocalMassCurve;
	const massStart = getMassAtTime(curve, windowStart);
	const massEnd = getMassAtTime(curve, windowEnd);
	const target = massStart + Math.max(0, Math.min(1, ratio)) * (massEnd - massStart);
	const time = getTimeByMassTarget(curve, target);
	return Math.max(floor + 1, Math.min(windowEnd, time));
};

const spanWeight = (text: string, lineConfidence: number, durationMs: number): number => {
	const units = tokenizeLine(text, { lineConfidence, lineDurationMs: Math.max(1, durationMs) });
	const weight = units.reduce((sum, unit) => sum + getUnitWeight(unit), 0);
	return weight > 0 ? weight : 1;
};

const lineToSingleSyllableSet = (line: LineVocal): SyllableVocalSet => ({
	type: "vocal",
	oppositeAligned: line.oppositeAligned,
	lead: {
		startTime: line.startTime,
		endTime: line.endTime,
		syllables: [{ text: line.text, startTime: line.startTime, endTime: line.endTime, isPartOfWord: false }],
	},
});

// Combine adjacent non-space units within a word to reduce over-splitting (one pass).
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
