// Word-level syllable providers (Musixmatch richsync) sync a whole Hangul word as one
// token, so the gradient text-fill sweeps the entire word at once instead of letter by
// letter. Split those tokens into per-character syllables, distributing the word's real
// start/end proportionally by linguistic weight (reusing pseudoKaraoke's getUnitWeight).

import { scanParentheticalText } from "./parentheticalScanner";
import { getUnitWeight } from "./pseudoKaraoke/unitWeights";
import type { Syllable, SyllableLyrics, SyllableVocal, SyllableVocalSet } from "./types";

// Split only around a pure-Hangul core. Parens/brackets are deliberately excluded,
// and splitVocal preserves unmarked middle tokens when a parenthetical spans multiple
// provider tokens. The renderer needs those tokens whole to carry its parenthetical state.
const HANGUL_WORD = /^([,.!?~…'";:-]*)([가-힣]{2,})([,.!?~…'";:-]*)$/;
const MIN_MS_PER_CHAR = 55;
const MAX_NON_FINAL_CHAR_MS = 900;

export const splitHangulSyllables = (lyrics: SyllableLyrics): SyllableLyrics => ({
	...lyrics,
	content: lyrics.content.map((item) => {
		if (item.type === "interlude") {
			return item;
		}
		return { ...item, lead: splitVocal(item.lead), background: item.background?.map(splitVocal) } satisfies SyllableVocalSet;
	}),
});

const splitVocal = (vocal: SyllableVocal): SyllableVocal => {
	let parentheticalDepth = 0;
	const syllables = vocal.syllables.flatMap((syllable) => {
		const depthBefore = parentheticalDepth;
		const scan = scanParentheticalText(syllable.text, depthBefore);
		parentheticalDepth = scan.depthAfter;
		const isParentheticalToken =
			depthBefore > 0 || scan.containsDelimiter || scan.events.some((event) => event.kind === "text" && event.role === "parenthetical");
		return isParentheticalToken ? [syllable] : splitSyllable(syllable);
	});
	return { ...vocal, syllables };
};

const splitSyllable = (syllable: Syllable): Syllable[] => {
	const match = HANGUL_WORD.exec(syllable.text);
	if (!match) {
		return [syllable];
	}
	const [, leadingPunctuation, core, trailingPunctuation] = match;
	const chars = [...core];
	const startMs = syllable.startTime * 1000;
	const endMs = syllable.endTime * 1000;
	const totalMs = endMs - startMs;
	if (totalMs / chars.length < MIN_MS_PER_CHAR) {
		return [syllable];
	}

	const weights = chars.map((char) => getUnitWeight(char));
	const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
	const rawDurations = weights.map((weight) => (weight / weightTotal) * totalMs);
	const durations = capMelismaDurations(rawDurations);

	const syllables: Syllable[] = [];
	let cursor = startMs;
	for (let index = 0; index < chars.length; index += 1) {
		const isFirst = index === 0;
		const isLast = index === chars.length - 1;
		const nextCursor = isLast ? endMs : cursor + durations[index];
		const text = `${isFirst ? leadingPunctuation : ""}${chars[index]}${isLast ? trailingPunctuation : ""}`;
		syllables.push({
			text,
			startTime: cursor / 1000,
			endTime: nextCursor / 1000,
			isPartOfWord: isFirst ? syllable.isPartOfWord : true,
		});
		cursor = nextCursor;
	}
	return syllables;
};

// Cap each non-final char's share at MAX_NON_FINAL_CHAR_MS and let the surplus flow to the
// final char, since a long word duration usually means the singer holds the last syllable.
const capMelismaDurations = (durations: number[]): number[] => {
	if (durations.length <= 1) {
		return durations;
	}
	const capped = [...durations];
	let surplus = 0;
	for (let index = 0; index < capped.length - 1; index += 1) {
		if (capped[index] > MAX_NON_FINAL_CHAR_MS) {
			surplus += capped[index] - MAX_NON_FINAL_CHAR_MS;
			capped[index] = MAX_NON_FINAL_CHAR_MS;
		}
	}
	capped[capped.length - 1] += surplus;
	return capped;
};
