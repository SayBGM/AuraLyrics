import type { Interlude, LineLyrics, LyricsDocument, SyllableLyrics } from "./types";

const MINIMUM_INTERLUDE_DURATION = 6;
const END_INTERLUDE_EARLY_BY = 0.25;

export const buildInterlude = (startTime: number, endTime: number): Interlude => ({
	type: "interlude",
	startTime,
	endTime: Math.max(startTime, endTime),
	generated: true,
});

export const stripInterludes = (lyrics: LyricsDocument): LyricsDocument => {
	if (lyrics.type === "line") {
		return { ...lyrics, content: lyrics.content.filter((item) => item.type !== "interlude") };
	}
	if (lyrics.type === "syllable") {
		return { ...lyrics, content: lyrics.content.filter((item) => item.type !== "interlude") };
	}
	return lyrics;
};

export const rebuildInterludes = (lyrics: LyricsDocument): LyricsDocument => addInterludes(stripInterludes(lyrics));

const removeTrailingInterludes = <T extends { type: string }>(content: T[]): T[] => {
	const next = [...content];
	while (next.at(-1)?.type === "interlude") {
		next.pop();
	}
	return next;
};

const addLineInterludes = (lyrics: LineLyrics): LineLyrics => {
	const content = removeTrailingInterludes(lyrics.content);
	for (let index = content.length - 1; index > 0; index -= 1) {
		const current = content[index];
		const previous = content[index - 1];
		const currentStart = current.startTime;
		const previousEnd = previous.endTime;
		if (currentStart - previousEnd >= MINIMUM_INTERLUDE_DURATION) {
			content.splice(index, 0, buildInterlude(previousEnd, currentStart - END_INTERLUDE_EARLY_BY));
		}
	}

	const first = content[0];
	const firstStart = first?.startTime;
	if (firstStart !== undefined && firstStart >= MINIMUM_INTERLUDE_DURATION) {
		content.unshift(buildInterlude(0, firstStart - END_INTERLUDE_EARLY_BY));
	}

	return { ...lyrics, content };
};

const addSyllableInterludes = (lyrics: SyllableLyrics): SyllableLyrics => {
	const content = removeTrailingInterludes(lyrics.content);
	for (let index = content.length - 1; index > 0; index -= 1) {
		const current = content[index];
		const previous = content[index - 1];
		const currentStart = current.type === "vocal" ? current.lead.startTime : current.startTime;
		const previousEnd = previous.type === "vocal" ? previous.lead.endTime : previous.endTime;
		if (currentStart - previousEnd >= MINIMUM_INTERLUDE_DURATION) {
			content.splice(index, 0, buildInterlude(previousEnd, currentStart - END_INTERLUDE_EARLY_BY));
		}
	}

	const first = content[0];
	const firstStart = first?.type === "vocal" ? first.lead.startTime : first?.startTime;
	if (firstStart !== undefined && firstStart >= MINIMUM_INTERLUDE_DURATION) {
		content.unshift(buildInterlude(0, firstStart - END_INTERLUDE_EARLY_BY));
	}

	return { ...lyrics, content };
};

export const addInterludes = (lyrics: LyricsDocument): LyricsDocument => {
	if (lyrics.type === "line") {
		return addLineInterludes(lyrics);
	}
	if (lyrics.type === "syllable") {
		return addSyllableInterludes(lyrics);
	}
	return lyrics;
};
