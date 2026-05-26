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

export const buildSyllableRows = (vocal: SyllableVocal, rhythm?: RhythmProfile): SyllableRowsModel => {
	const rows: SyllableVisualRow[] = [];
	let row: SyllableVisualRow | undefined;
	let word: SyllableVisualWord | undefined;
	let wordIsParenthetical = false;
	let isInsideParenthetical = false;
	let hasParenthetical = false;

	for (const syllable of vocal.syllables) {
		const text = syllable.romanizedText ?? syllable.text;
		const segments: ParentheticalSegment[] = syllable.isPartOfWord
			? [{ text, isParenthetical: false, continues: false }]
			: parseWordLevelParentheticals(text, isInsideParenthetical);
		const stackParentheticals = shouldStackAdLibParentheticals(segments);
		const timedSegments = withSegmentTiming(syllable, stackParentheticals ? stripStandaloneSeparators(segments) : segments);

		for (const segment of timedSegments) {
			if (stackParentheticals && segment.isParenthetical && row && !isGroupTextEmpty(row.main)) {
				row = undefined;
				word = undefined;
			}
			if (!row) {
				row = createSyllableRow();
				rows.push(row);
			}
			markRowTiming(row, segment);
			if (!word || wordIsParenthetical !== segment.isParenthetical) {
				word = createWord(segment.isParenthetical);
				wordIsParenthetical = segment.isParenthetical;
				const group = segment.isParenthetical && !stackParentheticals ? row.echo : row.main;
				group.words.push(word);
			}
			if (segment.isParenthetical && (stackParentheticals || isGroupTextEmpty(row.main))) {
				addRowClass(row, "parenthetical-only");
			}
			if (segment.isParenthetical && !stackParentheticals) {
				addRowClass(row, "has-parenthetical-echo");
			}
			hasParenthetical = hasParenthetical || segment.isParenthetical;

			const koreanTail = segment.isParenthetical ? undefined : koreanTailSplitForSegment(segment, syllable, vocal.syllables, rhythm);
			if (koreanTail) {
				addWordClass(word, "korean-tail-word");
				if (koreanTail.melisma) {
					addWordClass(word, "korean-melisma-word");
				}
				word.tokens.push(
					createToken(koreanTail.baseText, { ...syllable, startTime: segment.startTime, endTime: koreanTail.tailStartTime }, false, [
						"korean-tail-base",
					]),
					createToken(
						koreanTail.tailText,
						{ ...syllable, startTime: koreanTail.tailStartTime, endTime: segment.endTime },
						false,
						koreanTail.melisma ? ["korean-tail-sustain", "korean-melisma-sustain"] : ["korean-tail-sustain"]
					)
				);
			} else {
				word.tokens.push(createToken(segment.text, { ...syllable, startTime: segment.startTime, endTime: segment.endTime }, segment.isParenthetical));
			}
			word = undefined;
			isInsideParenthetical = segment.continues;
			if (segment.isParenthetical && !segment.continues) {
				row = undefined;
				word = undefined;
			}
		}
	}
	applyRowHoldTiming(rows);
	return { hasParenthetical, rows };
};

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

const shouldStackAdLibParentheticals = (segments: ParentheticalSegment[]): boolean => {
	const hasShortAdLib = segments.some((segment) => segment.isParenthetical && isShortAdLib(segment.text));
	const hasTrailingLyricAfterFinalParenthetical = segments.at(-1)?.isParenthetical === false;
	if (!hasShortAdLib || !hasTrailingLyricAfterFinalParenthetical) {
		return false;
	}
	return true;
};

const stripStandaloneSeparators = (segments: ParentheticalSegment[]): ParentheticalSegment[] =>
	segments.map((segment) =>
		segment.isParenthetical
			? segment
			: {
					...segment,
					text: segment.text.replace(/[,，、]\s*$/u, "").trim(),
				}
	);

const isShortAdLib = (text: string): boolean => /^[a-z]{1,5}$/i.test(text.trim());
