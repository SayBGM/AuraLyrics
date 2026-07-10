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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const validateInterlude = (item: Record<string, unknown>): void => {
	finiteRange(item.startTime as number, item.endTime as number, "interlude");
	if (item.generated !== undefined && typeof item.generated !== "boolean") throw new Error("Invalid generated interlude flag");
};

const validateSyllableVocal = (value: unknown, label: string): void => {
	if (!isRecord(value)) throw new Error(`Invalid syllable vocal: ${label}`);
	finiteRange(value.startTime as number, value.endTime as number, label);
	if (!Array.isArray(value.syllables)) throw new Error(`Invalid syllable array: ${label}`);
	for (const syllable of value.syllables) {
		validateTextMetadata(syllable, "syllable");
		if (!isRecord(syllable)) throw new Error("Invalid syllable");
		finiteRange(syllable.startTime as number, syllable.endTime as number, "syllable");
		if (typeof syllable.isPartOfWord !== "boolean") throw new Error("Invalid syllable word flag");
	}
};

export const validateLyrics = <T extends LyricsDocument>(lyrics: T): T => {
	if (lyrics.type === "static") {
		if (!Array.isArray(lyrics.lines)) throw new Error("Invalid static lyric lines");
		for (const line of lyrics.lines) validateTextMetadata(line, "static line");
		return lyrics;
	}
	if (lyrics.type !== "line" && lyrics.type !== "syllable") throw new Error("Invalid lyric document type");
	finiteRange(lyrics.startTime, lyrics.endTime, "document");
	if (!Array.isArray(lyrics.content)) throw new Error("Invalid timed lyric content");
	for (const item of lyrics.content as unknown[]) {
		if (!isRecord(item)) throw new Error("Invalid timed lyric item");
		if (item.type === "interlude") {
			validateInterlude(item);
			continue;
		}
		if (item.type !== "vocal") throw new Error("Invalid timed lyric item type");
		if (typeof item.oppositeAligned !== "boolean") throw new Error("Invalid vocal alignment flag");
		if (lyrics.type === "line") {
			validateTextMetadata(item, "line vocal");
			finiteRange(item.startTime as number, item.endTime as number, "vocal");
			continue;
		}
		if (item.translatedText !== undefined && typeof item.translatedText !== "string") throw new Error("Invalid vocal translation");
		validateSyllableVocal(item.lead, "lead");
		if (item.background !== undefined) {
			if (!Array.isArray(item.background)) throw new Error("Invalid background vocals");
			for (const vocal of item.background) validateSyllableVocal(vocal, "background");
		}
	}
	const startOf = (item: (typeof lyrics.content)[number]) => (item.type === "vocal" && "lead" in item ? item.lead.startTime : item.startTime);
	const content = [...lyrics.content].sort((a, b) => {
		const aStart = startOf(a);
		const bStart = startOf(b);
		return aStart - bStart;
	});
	return { ...lyrics, content } as T;
};
