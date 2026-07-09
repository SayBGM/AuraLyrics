import type { LineLyrics, Syllable, SyllableLyrics } from "../types";

type MusixmatchSubtitleLine = {
	text?: string;
	time: {
		total: number;
	};
};

type MusixmatchRichsyncLine = {
	ts: number;
	te: number;
	l?: MusixmatchRichsyncToken[];
	x?: string;
};

type MusixmatchRichsyncToken = {
	c: string;
	o: number;
};

export type MusixmatchTranslationEntry = {
	translation?: {
		description?: string;
		snippet?: string;
		subtitle_matched_line?: string;
		matched_line?: string;
	};
};

export type MusixmatchTranslationMap = Map<string, string>;

const translationKey = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase();

export const buildMusixmatchTranslationMap = (entries: MusixmatchTranslationEntry[]): MusixmatchTranslationMap => {
	const map: MusixmatchTranslationMap = new Map();
	for (const entry of entries) {
		const translated = entry.translation?.description?.trim();
		if (!translated) {
			continue;
		}
		for (const original of [entry.translation?.matched_line, entry.translation?.subtitle_matched_line, entry.translation?.snippet]) {
			if (original?.trim()) {
				map.set(translationKey(original), translated);
			}
		}
	}
	return map;
};

const lookupTranslation = (translations: MusixmatchTranslationMap | undefined, text: string | undefined): string | undefined => {
	if (!translations || !text?.trim()) {
		return undefined;
	}
	const translated = translations.get(translationKey(text));
	// A translation identical to the original (e.g. a Korean track "translated" to Korean) adds nothing.
	return translated && translationKey(translated) !== translationKey(text) ? translated : undefined;
};

export const parseMusixmatchSubtitle = (subtitleBody: string, translations?: MusixmatchTranslationMap): LineLyrics | undefined => {
	const lines = JSON.parse(subtitleBody) as MusixmatchSubtitleLine[];
	if (!Array.isArray(lines) || lines.length === 0) {
		return undefined;
	}
	const content = lines.map((line, index) => {
		const startTime = line.time.total;
		return {
			type: "vocal" as const,
			text: line.text || "♪",
			translatedText: lookupTranslation(translations, line.text),
			startTime,
			endTime: lines[index + 1]?.time.total ?? startTime + 4,
			oppositeAligned: false,
		};
	});
	return {
		type: "line",
		startTime: content[0].startTime,
		endTime: content.at(-1)?.endTime ?? 0,
		content,
	};
};

export const parseMusixmatchRichsync = (richsyncBody: string, translations?: MusixmatchTranslationMap): SyllableLyrics | undefined => {
	const lines = JSON.parse(richsyncBody) as MusixmatchRichsyncLine[];
	if (!Array.isArray(lines) || lines.length === 0) {
		return undefined;
	}
	const content = lines
		.map((line) => {
			const tokens = (line.l ?? []).filter((token) => token.c.trim().length > 0);
			const syllables = tokens
				.map((token, index): Syllable | undefined => {
					const startTime = line.ts + token.o;
					const nextToken = tokens[index + 1];
					const endTime = nextToken ? line.ts + nextToken.o : line.te;
					if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
						return undefined;
					}
					return {
						text: token.c,
						startTime,
						endTime,
						isPartOfWord: false,
					};
				})
				.filter((syllable): syllable is Syllable => syllable !== undefined);
			if (syllables.length === 0) {
				return undefined;
			}
			return {
				type: "vocal" as const,
				oppositeAligned: false,
				lead: {
					startTime: line.ts,
					endTime: line.te,
					syllables,
				},
				translatedText: lookupTranslation(translations, line.x ?? tokens.map((token) => token.c).join("")),
			};
		})
		.filter((line): line is NonNullable<typeof line> => line !== undefined);
	if (content.length === 0) {
		return undefined;
	}
	return {
		type: "syllable",
		startTime: content[0].lead.startTime,
		endTime: content.at(-1)?.lead.endTime ?? 0,
		content,
	};
};
