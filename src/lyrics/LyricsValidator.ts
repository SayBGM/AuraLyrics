import type { LyricsDocument } from "./types";

const finiteRange = (startTime: number, endTime: number, label: string): void => {
	if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) throw new Error(`Invalid lyric timing: ${label}`);
};

const validateTextMetadata = (value: unknown, label: string): void => {
	if (typeof value !== "object" || value === null) throw new Error(`Invalid lyric text: ${label}`);
	const text = value as { text?: unknown; romanizedText?: unknown; translatedText?: unknown };
	if (typeof text.text !== "string") throw new Error(`Invalid lyric text: ${label}`);
	if (text.romanizedText !== undefined && typeof text.romanizedText !== "string") throw new Error(`Invalid romanized lyric text: ${label}`);
	if (text.translatedText !== undefined && typeof text.translatedText !== "string") throw new Error(`Invalid translated lyric text: ${label}`);
};

export const validateLyrics = <T extends LyricsDocument>(lyrics: T): T => {
	if (lyrics.type === "static") {
		if (!Array.isArray(lyrics.lines)) throw new Error("Invalid static lyric lines");
		for (const line of lyrics.lines) validateTextMetadata(line, "static line");
		return lyrics;
	}
	finiteRange(lyrics.startTime, lyrics.endTime, "document");
	const startOf = (item: (typeof lyrics.content)[number]) => (item.type === "vocal" && "lead" in item ? item.lead.startTime : item.startTime);
	const content = [...lyrics.content].sort((a, b) => {
		const aStart = startOf(a);
		const bStart = startOf(b);
		return aStart - bStart;
	});
	for (const item of content) {
		if (item.type === "vocal" && "lead" in item) finiteRange(item.lead.startTime, item.lead.endTime, "lead");
		else finiteRange(item.startTime, item.endTime, item.type);
		if (item.type === "vocal" && "lead" in item) {
			for (const syllable of item.lead.syllables) finiteRange(syllable.startTime, syllable.endTime, "syllable");
			for (const vocal of item.background ?? []) {
				finiteRange(vocal.startTime, vocal.endTime, "background");
				for (const syllable of vocal.syllables) finiteRange(syllable.startTime, syllable.endTime, "syllable");
			}
		}
	}
	return { ...lyrics, content } as T;
};
