import type { SyllableVocalSet } from "../lyrics/types";
import type { AnimatedGroup } from "./AnimatedGroup";

export const applyHoldTiming = (groups: AnimatedGroup[]): void => {
	for (let index = 0; index < groups.length; index += 1) {
		const group = groups[index];
		const next = groups.slice(index + 1).find((item) => item.startTime > group.startTime);
		if (next) {
			group.setHoldEndTime?.(next.startTime);
		}
	}
};

export const syllableToLine = (item: SyllableVocalSet) => ({
	type: "vocal" as const,
	text: item.lead.syllables.map((syllable, index) => `${index > 0 && !syllable.isPartOfWord ? " " : ""}${syllable.text}`).join(""),
	translatedText: item.translatedText,
	startTime: item.lead.startTime,
	endTime: item.lead.endTime,
	oppositeAligned: item.oppositeAligned,
});

// Translations render as one plain block of text — parentheses inside a translation are
// never split into segments; the translation style takes priority over parenthetical styling.
export const createTranslationElement = (text: string, ownerDocument: Document = document): HTMLSpanElement => {
	const translation = ownerDocument.createElement("span");
	translation.className = "lyric-translation";
	translation.textContent = text;
	return translation;
};
