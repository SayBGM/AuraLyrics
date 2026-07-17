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

type TimedMusixmatchRichsyncToken = {
	text: string;
	startTime: number;
	separatorStartTime?: number;
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

const MAX_RICHSYNC_REPAIR_STEP_SECONDS = 0.001;

const collectTimedRichsyncTokens = (line: MusixmatchRichsyncLine): TimedMusixmatchRichsyncToken[] => {
	const tokens: TimedMusixmatchRichsyncToken[] = [];
	let separatorStartTime: number | undefined;
	for (const token of line.l ?? []) {
		const startTime = Number.isFinite(line.ts) && Number.isFinite(token.o) ? line.ts + token.o : Number.NaN;
		if (token.c.trim().length === 0) {
			separatorStartTime = Number.isFinite(startTime) ? startTime : undefined;
			continue;
		}
		if (Number.isFinite(startTime)) {
			tokens.push({ text: token.c, startTime, separatorStartTime });
		}
		separatorStartTime = undefined;
	}
	return tokens;
};

const buildRichsyncSyllables = (line: MusixmatchRichsyncLine): Syllable[] => {
	if (!Number.isFinite(line.ts) || !Number.isFinite(line.te) || line.te <= line.ts) {
		return [];
	}
	const tokens = collectTimedRichsyncTokens(line);
	if (tokens.length === 0) {
		return [];
	}
	const repairStep = Math.min(MAX_RICHSYNC_REPAIR_STEP_SECONDS, (line.te - line.ts) / (tokens.length + 1));
	const syllables = new Array<Syllable>(tokens.length);
	let endTime = line.te;
	for (let index = tokens.length - 1; index >= 0; index -= 1) {
		const token = tokens[index];
		const earliestStartTime = line.ts + repairStep * index;
		const isUsableStartTime = (value: number | undefined): value is number =>
			value !== undefined && Number.isFinite(value) && value >= earliestStartTime && value < endTime;
		let startTime: number;
		if (isUsableStartTime(token.startTime)) {
			startTime = token.startTime;
		} else if (isUsableStartTime(token.separatorStartTime)) {
			startTime = token.separatorStartTime;
		} else if (token.startTime < earliestStartTime) {
			startTime = earliestStartTime;
		} else {
			startTime = Math.max(earliestStartTime, endTime - repairStep);
		}
		syllables[index] = {
			text: token.text,
			startTime,
			endTime,
			isPartOfWord: false,
		};
		endTime = startTime;
	}
	return syllables;
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
			const syllables = buildRichsyncSyllables(line);
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
