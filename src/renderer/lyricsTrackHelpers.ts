import type { LyricsPerformer, SyllableVocalSet } from "../lyrics/types";
import type { AnimatedGroup } from "./AnimatedGroup";

/**
 * Visits each item with the first later item that starts after it, in one backwards pass:
 * the "next later start" of an item is either its neighbour or, when the neighbour starts at
 * the same time or earlier, the neighbour's own next later start.
 */
export const forEachNextLaterStart = <T extends { startTime: number }>(items: readonly T[], apply: (item: T, next: T) => void): void => {
	const nextIndex = new Array<number>(items.length).fill(-1);
	for (let index = items.length - 2; index >= 0; index -= 1) {
		let candidate = index + 1;
		while (candidate >= 0 && candidate < items.length && items[candidate].startTime <= items[index].startTime) {
			candidate = nextIndex[candidate];
		}
		nextIndex[index] = candidate;
		if (candidate >= 0) {
			apply(items[index], items[candidate]);
		}
	}
};

export const applyHoldTiming = (groups: AnimatedGroup[]): void => {
	forEachNextLaterStart(groups, (group, next) => group.setHoldEndTime?.(next.startTime));
};

export const syllableToLine = (item: SyllableVocalSet) => ({
	type: "vocal" as const,
	text: item.lead.syllables.map((syllable, index) => `${index > 0 && !syllable.isPartOfWord ? " " : ""}${syllable.text}`).join(""),
	translatedText: item.translatedText,
	startTime: item.lead.startTime,
	endTime: item.lead.endTime,
	oppositeAligned: item.oppositeAligned,
	performers: item.performers,
});

/** Creates non-lyric attribution text separately from lyric/translation nodes. */
export const createPerformersElement = (
	performers: readonly LyricsPerformer[] | undefined,
	ownerDocument: Document = document
): HTMLSpanElement | undefined => {
	const names = [...new Set((performers ?? []).map((performer) => performer.name.trim()).filter(Boolean))];
	if (names.length === 0) {
		return undefined;
	}
	const element = ownerDocument.createElement("span");
	element.className = "lyric-performers";
	element.textContent = names.join(", ");
	return element;
};

// Translations render as one plain block of text — parentheses inside a translation are
// never split into segments; the translation style takes priority over parenthetical styling.
export const createTranslationElement = (text: string, ownerDocument: Document = document): HTMLSpanElement => {
	const translation = ownerDocument.createElement("span");
	translation.className = "lyric-translation";
	translation.textContent = text;
	return translation;
};
