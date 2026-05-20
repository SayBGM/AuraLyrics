import type { Interlude, LineLyrics, LineVocal, LyricsDocument, SyllableLyrics } from "./types";

export const normalizeText = (value: string): string =>
	value
		.replace(/（/g, "(")
		.replace(/）/g, ")")
		.replace(/【/g, "[")
		.replace(/】/g, "]")
		.replace(/。/g, ". ")
		.replace(/；/g, "; ")
		.replace(/：/g, ": ")
		.replace(/？/g, "? ")
		.replace(/！/g, "! ")
		.replace(/、|，/g, ", ")
		.replace(/‘|’|′|＇/g, "'")
		.replace(/“|”/g, '"')
		.replace(/〜/g, "~")
		.replace(/·|・/g, "•")
		.replace(/\s+/g, " ")
		.trim();

const MUSIC_NOTE_ONLY = /^[\s♪♫♬♩♭♮♯]+$/;
const isMusicNoteOnly = (value: string): boolean => MUSIC_NOTE_ONLY.test(value);

const normalizeLineLyrics = (lyrics: LineLyrics): LineLyrics => ({
	...lyrics,
	content: lyrics.content.map((item) => {
		if (item.type === "interlude") {
			return item;
		}
		const text = normalizeText(item.text) || "♪";
		if (isMusicNoteOnly(text)) {
			return { type: "interlude", startTime: item.startTime, endTime: item.endTime } satisfies Interlude;
		}
		return { ...item, text } satisfies LineVocal;
	}),
});

const normalizeSyllableLyrics = (lyrics: SyllableLyrics): SyllableLyrics => ({
	...lyrics,
	content: lyrics.content.map((item) => {
		if (item.type === "interlude") {
			return item;
		}
		return {
			...item,
			lead: {
				...item.lead,
				syllables: item.lead.syllables.map((syllable) => ({ ...syllable, text: normalizeText(syllable.text) || "♪" })),
			},
			background: item.background?.map((vocal) => ({
				...vocal,
				syllables: vocal.syllables.map((syllable) => ({ ...syllable, text: normalizeText(syllable.text) || "♪" })),
			})),
		};
	}),
});

export const normalizeLyrics = (lyrics: LyricsDocument): LyricsDocument => {
	if (lyrics.type === "line") {
		return normalizeLineLyrics(lyrics);
	}
	if (lyrics.type === "syllable") {
		return normalizeSyllableLyrics(lyrics);
	}
	return {
		...lyrics,
		lines: lyrics.lines.map((line) => ({ ...line, text: normalizeText(line.text) })),
	};
};
