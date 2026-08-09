import type { Syllable, SyllableVocal } from "../../lyrics/types";
import type { RhythmProfile } from "../AudioAnalysisWaveformService";
import { koreanTailSplitForSegment, melismaSustainClassesForFinalSyllable } from "./koreanTail";
import {
	type ParentheticalVocalItem,
	type TimedParentheticalSegment,
	type TimedParentheticalText,
	tokenizeParentheticalSyllables,
} from "./parentheticalSegments";

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

export type SyllableRowsOptions = {
	// false keeps "(...)" inline in the main text instead of splitting it into the echo group
	// (used when a translation sub-line occupies the echo's space below the line).
	splitParentheticals?: boolean;
};

export const buildSyllableRows = (vocal: SyllableVocal, rhythm?: RhythmProfile, options?: SyllableRowsOptions): SyllableRowsModel => {
	const rows: SyllableVisualRow[] = [];
	let row: SyllableVisualRow | undefined;
	let word: SyllableVisualWord | undefined;
	let wordIsParenthetical = false;
	let hasParenthetical = false;
	const items = parentheticalItemsFor(vocal, options?.splitParentheticals ?? true);

	const resetRow = (): void => {
		row = undefined;
		word = undefined;
	};
	const ensureRow = (): SyllableVisualRow => {
		if (!row) {
			row = createSyllableRow();
			rows.push(row);
			word = undefined;
		}
		return row;
	};
	const appendText = (item: TimedParentheticalText, isParenthetical: boolean): void => {
		const activeRow = ensureRow();
		const segment = item.segment;
		markRowTiming(activeRow, segment);
		// Group consecutive in-word syllables (isPartOfWord) into one .word so synthesized
		// karaoke keeps word spacing/wrapping. Real karaoke always has isPartOfWord=false,
		// so each token stays its own word (unchanged).
		const startsNewWord = !item.syllable.isPartOfWord;
		if (!word || wordIsParenthetical !== isParenthetical || startsNewWord) {
			word = createWord(isParenthetical);
			wordIsParenthetical = isParenthetical;
			const group = isParenthetical ? activeRow.echo : activeRow.main;
			group.words.push(word);
		}
		const activeWord = word;
		const koreanTail = isParenthetical ? undefined : koreanTailSplitForSegment(segment, item.syllable, vocal.syllables, rhythm);
		if (koreanTail) {
			addWordClass(activeWord, "korean-tail-word");
			if (koreanTail.melisma) {
				addWordClass(activeWord, "korean-melisma-word");
			}
			activeWord.tokens.push(
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
			return;
		}

		const melismaClasses = isParenthetical ? undefined : melismaSustainClassesForFinalSyllable(segment, item.syllable, vocal.syllables, rhythm);
		if (melismaClasses) {
			addWordClass(activeWord, "korean-tail-word");
			if (melismaClasses.includes("korean-melisma-sustain")) {
				addWordClass(activeWord, "korean-melisma-word");
			}
		}
		activeWord.tokens.push(
			createToken(segment.text, { ...item.syllable, startTime: segment.startTime, endTime: segment.endTime }, isParenthetical, melismaClasses)
		);
	};
	const appendTrailingPunctuation = (item: TimedParentheticalText, isParenthetical = false): void => {
		const activeRow = ensureRow();
		const targetGroup = isParenthetical ? activeRow.echo : activeRow.main;
		const targetWord = targetGroup.words.at(-1) ?? createWord(isParenthetical);
		if (targetGroup.words.length === 0) {
			targetGroup.words.push(targetWord);
		}
		targetWord.tokens.push(
			createToken(item.segment.text, { ...item.syllable, startTime: item.segment.startTime, endTime: item.segment.endTime }, isParenthetical)
		);
		word = targetWord;
		wordIsParenthetical = isParenthetical;
	};

	for (const [index, item] of items.entries()) {
		if (item.kind === "main") {
			appendText(item.text, false);
			for (const punctuation of item.trailingPunctuation ?? []) {
				appendTrailingPunctuation(punctuation);
			}
			continue;
		}

		const stacksWithNextMain = shouldStackWithNextMain(item, items, index);
		if (stacksWithNextMain && row && !isGroupTextEmpty(row.main)) {
			resetRow();
		}
		const activeRow = ensureRow();
		if (isGroupTextEmpty(activeRow.main)) {
			addRowClass(activeRow, "parenthetical-only");
			if (!stacksWithNextMain) {
				addRowClass(activeRow, "standalone-parenthetical");
			}
		}
		addRowClass(activeRow, "has-parenthetical-echo");
		hasParenthetical = true;
		for (const segment of item.segments) {
			appendText(segment, true);
		}
		for (const punctuation of item.trailingPunctuation ?? []) {
			appendTrailingPunctuation(punctuation, true);
		}
		markRowTailTiming(activeRow, item.tailEndTime);
		if (item.closed) {
			resetRow();
		}
	}

	applyRowHoldTiming(rows);
	return { hasParenthetical, rows };
};

const parentheticalItemsFor = (vocal: SyllableVocal, splitParentheticals: boolean): ParentheticalVocalItem[] => {
	if (splitParentheticals) {
		return tokenizeParentheticalSyllables(vocal.syllables);
	}
	return vocal.syllables.map((syllable) => ({
		kind: "main",
		text: {
			syllable,
			segment: {
				text: syllable.text,
				isParenthetical: false,
				continues: false,
				startTime: syllable.startTime,
				endTime: syllable.endTime,
			},
		},
	}));
};

const shouldStackWithNextMain = (
	group: Extract<ParentheticalVocalItem, { kind: "parenthetical" }>,
	items: ParentheticalVocalItem[],
	index: number
): boolean => {
	if (!group.closed || !isStackableAdLib(group.segments.map((item) => item.segment.text).join(" "))) {
		return false;
	}
	return items.slice(index + 1).some((item) => item.kind === "main" && /[\p{L}\p{N}]/u.test(item.text.segment.text));
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

const markRowTailTiming = (row: SyllableVisualRow, tailEndTime: number): void => {
	row.endTime = Math.max(row.endTime, tailEndTime);
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
