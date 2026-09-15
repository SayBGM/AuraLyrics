import type { LineLyrics, LineVocal, LyricsDocument, LyricsPerformer, Syllable, SyllableLyrics } from "../types";
import { parseLrc } from "./LrcParser";

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

export type MusixmatchPerformerSnippet = {
	text: string;
	performers: LyricsPerformer[];
};

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

const lyricText = (
	lyrics: LineLyrics | SyllableLyrics,
	item: LineLyrics["content"][number] | SyllableLyrics["content"][number]
): string | undefined => {
	if (item.type !== "vocal") {
		return undefined;
	}
	if (lyrics.type === "line") {
		return "text" in item ? item.text : undefined;
	}
	return "lead" in item ? item.lead.syllables.map((syllable) => syllable.text).join(" ") : undefined;
};

/** Applies a deferred translation map without changing timings, vocal metadata, or performers. */
export const mergeMusixmatchTranslations = (lyrics: LyricsDocument, translations: MusixmatchTranslationMap): LyricsDocument => {
	if (translations.size === 0 || lyrics.type === "static") {
		return lyrics;
	}
	if (lyrics.type === "line") {
		return {
			...lyrics,
			content: lyrics.content.map((item) => {
				if (item.type !== "vocal") {
					return item;
				}
				return { ...item, translatedText: lookupTranslation(translations, item.text) ?? item.translatedText };
			}),
		};
	}
	return {
		...lyrics,
		content: lyrics.content.map((item) => {
			if (item.type !== "vocal") {
				return item;
			}
			return { ...item, translatedText: lookupTranslation(translations, lyricText(lyrics, item)) ?? item.translatedText };
		}),
	};
};

const normalizedSnippet = (value: string): string => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const values = (value: unknown): unknown[] => (Array.isArray(value) ? value : asRecord(value) ? Object.values(asRecord(value) ?? {}) : []);

const performerId = (value: unknown): string | undefined => {
	if (typeof value !== "string" || value.trim() === "") {
		return undefined;
	}
	return value.split(":").at(-1)?.trim() || undefined;
};

/** Parses the undocumented performer tagging response into a stable, persistable line-snippet form. */
export const parseMusixmatchPerformerSnippets = (metadata: unknown): MusixmatchPerformerSnippet[] => {
	const metadataRecord = asRecord(metadata);
	const track = asRecord(metadataRecord?.track) ?? metadataRecord;
	const tagging = asRecord(track?.performer_tagging);
	if (!tagging) {
		return [];
	}
	const artists = values(asRecord(tagging.resources)?.artists);
	const miscTags = asRecord(track?.performer_tagging_misc_tags) ?? {};
	const snippets: MusixmatchPerformerSnippet[] = [];
	for (const content of values(tagging.content)) {
		const item = asRecord(content);
		if (!item || typeof item.snippet !== "string") {
			continue;
		}
		const performers: LyricsPerformer[] = [];
		for (const performer of values(item.performers)) {
			const performerRecord = asRecord(performer);
			if (!performerRecord || typeof performerRecord.type !== "string") {
				continue;
			}
			const id = performerId(performerRecord.fqid);
			let name: string | undefined;
			if (performerRecord.type === "artist") {
				const artist = artists.map(asRecord).find((candidate) => String(candidate?.artist_id ?? "") === id);
				name = typeof artist?.artist_name === "string" ? artist.artist_name.trim() : undefined;
			} else {
				const tag = miscTags[performerRecord.type];
				name = typeof tag === "string" ? tag.trim() : undefined;
			}
			if (name && !performers.some((candidate) => (id && candidate.id === id) || candidate.name === name)) {
				performers.push({ ...(id ? { id } : {}), name });
			}
		}
		if (performers.length === 0) {
			continue;
		}
		for (const rawLine of item.snippet.split(/\n+/)) {
			const text = normalizedSnippet(rawLine.trim());
			if (text && (text.length >= 2 || /^[\u3131-\uD79D]/u.test(text))) {
				snippets.push({ text, performers });
			}
		}
	}
	return snippets;
};

/** Matches upstream snippets in order, looking no more than five entries ahead per lyric line. */
export const applyMusixmatchPerformers = (lyrics: LyricsDocument, snippets: MusixmatchPerformerSnippet[]): LyricsDocument => {
	if (snippets.length === 0 || lyrics.type === "static") {
		return lyrics;
	}
	let cursor = 0;
	const match = (text: string): LyricsPerformer[] | undefined => {
		let remaining = normalizedSnippet(text);
		const matched: LyricsPerformer[] = [];
		while (cursor < snippets.length) {
			const offset = snippets.slice(cursor, cursor + 5).findIndex((snippet) => snippet.text && remaining.includes(snippet.text));
			if (offset < 0) {
				break;
			}
			const snippet = snippets[cursor + offset];
			cursor += offset + 1;
			remaining = remaining.replace(snippet.text, "");
			for (const performer of snippet.performers) {
				if (!matched.some((candidate) => (performer.id && candidate.id === performer.id) || candidate.name === performer.name)) {
					matched.push(performer);
				}
			}
		}
		return matched.length > 0 ? matched : undefined;
	};
	if (lyrics.type === "line") {
		return { ...lyrics, content: lyrics.content.map((item) => (item.type === "vocal" ? { ...item, performers: match(item.text) } : item)) };
	}
	return {
		...lyrics,
		content: lyrics.content.map((item) =>
			item.type === "vocal" ? { ...item, performers: match(item.lead.syllables.map((syllable) => syllable.text).join(" ")) } : item
		),
	};
};

const MAX_RICHSYNC_REPAIR_STEP_SECONDS = 0.001;

const collectTimedRichsyncTokens = (line: MusixmatchRichsyncLine): TimedMusixmatchRichsyncToken[] => {
	const tokens: TimedMusixmatchRichsyncToken[] = [];
	let separatorStartTime: number | undefined;
	for (const token of line.l ?? []) {
		const startTime = Number.isFinite(line.ts) && Number.isFinite(token.o) ? line.ts + token.o : Number.NaN;
		if (token.c.trim().length === 0) {
			separatorStartTime = Number.isFinite(startTime) ? startTime : undefined;
			// Richsync represents word spacing as separate tokens. Keep the space in
			// the preceding visual token; otherwise the renderer creates adjacent
			// inline-flex words and the displayed lyric text is concatenated.
			const previous = tokens.at(-1);
			if (previous) {
				previous.text += token.c;
			}
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

export const parseMusixmatchSubtitle = (subtitleBody: string, translations?: MusixmatchTranslationMap): LineLyrics | SyllableLyrics | undefined => {
	try {
		const lines = JSON.parse(subtitleBody) as MusixmatchSubtitleLine[];
		if (!Array.isArray(lines) || lines.length === 0) {
			return undefined;
		}
		const content: LineVocal[] = [];
		for (const [index, line] of lines.entries()) {
			const startTime = line.time?.total;
			if (!Number.isFinite(startTime)) {
				return undefined;
			}
			const nextStartTime = lines[index + 1]?.time?.total;
			content.push({
				type: "vocal" as const,
				text: line.text || "♪",
				translatedText: lookupTranslation(translations, line.text),
				startTime,
				endTime: Number.isFinite(nextStartTime) ? nextStartTime : startTime + 4,
				oppositeAligned: false,
			});
		}
		return {
			type: "line",
			startTime: content[0]?.startTime ?? 0,
			endTime: content.at(-1)?.endTime ?? 0,
			content,
		};
	} catch {
		// Some macro.subtitles responses ignore subtitle_format=mxm and return LRC instead.
		const lyrics = parseLrc(subtitleBody);
		const hasVocals =
			lyrics.type === "line"
				? lyrics.content.some((item) => item.type === "vocal" && item.text.trim().length > 0)
				: lyrics.content.some((item) => item.type === "vocal" && item.lead.syllables.some((syllable) => syllable.text.trim().length > 0));
		return hasVocals ? lyrics : undefined;
	}
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
