import type { Syllable, SyllableVocal } from "../../lyrics/types";
import type { RhythmProfile } from "../AudioAnalysisWaveformService";
import { koreanTailSplitForSegment } from "./koreanTail";
import { type ParentheticalSegment, parseWordLevelParentheticals, type TimedParentheticalSegment, withSegmentTiming } from "./parentheticalSegments";

export type SyllableVisualToken = {
	text: string;
	metadata: Syllable;
	isParenthetical: boolean;
	extraClasses: string[];
};

export type SyllableVisualWord = {
	isParenthetical: boolean;
	extraClasses: string[];
	tokens: SyllableVisualToken[];
};

export type SyllableVisualGroup = {
	words: SyllableVisualWord[];
};

export type SyllableVisualRow = {
	startTime: number;
	endTime: number;
	holdEndTime: number;
	rowClasses: string[];
	main: SyllableVisualGroup;
	echo: SyllableVisualGroup;
};

export type SyllableRowsModel = {
	hasParenthetical: boolean;
	rows: SyllableVisualRow[];
};

type ParsedTimedSegment = {
	syllable: Syllable;
	segment: TimedParentheticalSegment;
};

export const buildSyllableRows = (vocal: SyllableVocal, rhythm?: RhythmProfile): SyllableRowsModel => {
	const rows: SyllableVisualRow[] = [];
	let row: SyllableVisualRow | undefined;
	let word: SyllableVisualWord | undefined;
	let wordIsParenthetical = false;
	let hasParenthetical = false;
	let stripNextMainPrefix = false;
	const timedSegments = parseTimedSegments(vocal);

	for (const [index, item] of timedSegments.entries()) {
		const stacksWithNextMain = shouldStackWithNextMain(item.segment, timedSegments, index);
		const segment = normalizeMainSegment(item.segment, stripNextMainPrefix);
		if (stacksWithNextMain && row && !isGroupTextEmpty(row.main)) {
			stripTrailingSeparatorFromGroup(row.main);
			row = undefined;
			word = undefined;
		}
		if (!segment) {
			continue;
		}
		if (!segment.isParenthetical) {
			stripNextMainPrefix = false;
		}
		if (!row) {
			row = createSyllableRow();
			rows.push(row);
		}
		markRowTiming(row, segment);
		// Group consecutive in-word syllables (isPartOfWord) into one .word so synthesized
		// karaoke keeps word spacing/wrapping. Real karaoke always has isPartOfWord=false,
		// so each token stays its own word (unchanged).
		const startsNewWord = !item.syllable.isPartOfWord;
		if (!word || wordIsParenthetical !== segment.isParenthetical || startsNewWord) {
			word = createWord(segment.isParenthetical);
			wordIsParenthetical = segment.isParenthetical;
			const group = segment.isParenthetical ? row.echo : row.main;
			group.words.push(word);
		}
		if (segment.isParenthetical && isGroupTextEmpty(row.main)) {
			addRowClass(row, "parenthetical-only");
			if (!stacksWithNextMain) {
				addRowClass(row, "standalone-parenthetical");
			}
		}
		if (segment.isParenthetical) {
			addRowClass(row, "has-parenthetical-echo");
		}
		hasParenthetical = hasParenthetical || segment.isParenthetical;

		const koreanTail = segment.isParenthetical ? undefined : koreanTailSplitForSegment(segment, item.syllable, vocal.syllables, rhythm);
		if (koreanTail) {
			addWordClass(word, "korean-tail-word");
			if (koreanTail.melisma) {
				addWordClass(word, "korean-melisma-word");
			}
			word.tokens.push(
				createToken(koreanTail.baseText, { ...item.syllable, startTime: segment.startTime, endTime: koreanTail.tailStartTime }, false, [
					"korean-tail-base",
				]),
				createToken(
					koreanTail.tailText,
					{ ...item.syllable, startTime: koreanTail.tailStartTime, endTime: segment.endTime },
					false,
					koreanTail.melisma ? ["korean-tail-sustain", "korean-melisma-sustain"] : ["korean-tail-sustain"]
				)
			);
		} else {
			word.tokens.push(
				createToken(segment.text, { ...item.syllable, startTime: segment.startTime, endTime: segment.endTime }, segment.isParenthetical)
			);
		}
		if (segment.isParenthetical && !segment.continues) {
			row = undefined;
			word = undefined;
			if (stacksWithNextMain) {
				stripNextMainPrefix = true;
			}
		}
	}
	// Extend the row active window to the vocal envelope. Synthesized lyrics anchor the envelope to the
	// original line bounds, so the row activates / scrolls in step with line-synced lyrics.
	if (rows.length > 0) {
		rows[0].startTime = Math.min(rows[0].startTime, vocal.startTime);
		const lastRow = rows[rows.length - 1];
		lastRow.endTime = Math.max(lastRow.endTime, vocal.endTime);
		lastRow.holdEndTime = lastRow.endTime;
	}
	applyRowHoldTiming(rows);
	return { hasParenthetical, rows };
};

const parseTimedSegments = (vocal: SyllableVocal): ParsedTimedSegment[] => {
	const parsed: ParsedTimedSegment[] = [];
	let isInsideParenthetical = false;
	for (const syllable of vocal.syllables) {
		const text = syllable.romanizedText ?? syllable.text;
		const segments: ParentheticalSegment[] = syllable.isPartOfWord
			? [{ text, isParenthetical: false, continues: false }]
			: parseWordLevelParentheticals(text, isInsideParenthetical);
		isInsideParenthetical = segments.at(-1)?.continues ?? false;
		for (const segment of withSegmentTiming(syllable, segments)) {
			parsed.push({ syllable, segment });
		}
	}
	return parsed;
};

const normalizeMainSegment = (segment: TimedParentheticalSegment, stripPrefix: boolean): TimedParentheticalSegment | undefined => {
	if (segment.isParenthetical || !stripPrefix) {
		return segment;
	}
	const text = stripLeadingSeparator(segment.text);
	return text ? { ...segment, text } : undefined;
};

const shouldStackWithNextMain = (segment: TimedParentheticalSegment, segments: ParsedTimedSegment[], index: number): boolean => {
	if (!segment.isParenthetical || segment.continues || !isStackableAdLib(segment.text)) {
		return false;
	}
	return segments.slice(index + 1).some(({ segment: nextSegment }) => {
		if (nextSegment.isParenthetical) {
			return false;
		}
		return stripLeadingSeparator(nextSegment.text).length > 0;
	});
};

const stripLeadingSeparator = (text: string): string => text.replace(/^[,，、;:!?！？.。]+\s*/u, "").trim();

const stripTrailingSeparatorFromGroup = (group: SyllableVisualGroup): void => {
	for (let wordIndex = group.words.length - 1; wordIndex >= 0; wordIndex -= 1) {
		const word = group.words[wordIndex];
		for (let tokenIndex = word.tokens.length - 1; tokenIndex >= 0; tokenIndex -= 1) {
			const token = word.tokens[tokenIndex];
			if (token.text.trim().length > 0) {
				token.text = token.text.replace(/[,，、;:!?！？.。]+\s*$/u, "").trimEnd();
				return;
			}
		}
	}
};

const isStackableAdLib = (text: string): boolean => /^[A-Za-z][A-Za-z'’ -]{0,15}$/.test(text.trim());

const createSyllableRow = (): SyllableVisualRow => ({
	startTime: Number.POSITIVE_INFINITY,
	endTime: Number.NEGATIVE_INFINITY,
	holdEndTime: Number.NEGATIVE_INFINITY,
	rowClasses: [],
	main: { words: [] },
	echo: { words: [] },
});

const createWord = (isParenthetical: boolean): SyllableVisualWord => ({
	isParenthetical,
	extraClasses: [],
	tokens: [],
});

const createToken = (text: string, metadata: Syllable, isParenthetical: boolean, extraClasses: string[] = []): SyllableVisualToken => ({
	text,
	metadata,
	isParenthetical,
	extraClasses,
});

const markRowTiming = (row: SyllableVisualRow, segment: TimedParentheticalSegment): void => {
	row.startTime = Math.min(row.startTime, segment.startTime);
	row.endTime = Math.max(row.endTime, segment.endTime);
	row.holdEndTime = row.endTime;
};

const applyRowHoldTiming = (rows: SyllableVisualRow[]): void => {
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		const next = rows.slice(index + 1).find((item) => item.startTime > row.startTime);
		if (next) {
			row.holdEndTime = Math.max(row.endTime, next.startTime);
		}
	}
};

const addRowClass = (row: SyllableVisualRow, className: string): void => {
	if (!row.rowClasses.includes(className)) {
		row.rowClasses.push(className);
	}
};

const addWordClass = (word: SyllableVisualWord, className: string): void => {
	if (!word.extraClasses.includes(className)) {
		word.extraClasses.push(className);
	}
};

const isGroupTextEmpty = (group: SyllableVisualGroup): boolean =>
	group.words.flatMap((item) => item.tokens).every((token) => token.text.trim().length === 0);
