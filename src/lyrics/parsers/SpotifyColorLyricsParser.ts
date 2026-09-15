import type { LineLyrics } from "../types";

const FALLBACK_LINE_DURATION_SECONDS = 4;
// SYLLABLE_SYNCED payloads still carry per-line `words` and start times, so both render as line lyrics.
const TIMED_SYNC_TYPES = new Set(["LINE_SYNCED", "SYLLABLE_SYNCED"]);

type SpotifySyllable = {
	startTimeMs?: string | number;
};

type SpotifyLine = {
	startTimeMs?: string | number;
	words: string;
	syllables?: SpotifySyllable[];
};

type SpotifyColorLyrics = {
	lyrics?: {
		syncType?: string;
		lines?: SpotifyLine[];
	};
};

const lineStartMs = (line: SpotifyLine): number => {
	const startMs = Number(line.startTimeMs ?? Number.NaN);
	return Number.isFinite(startMs) ? startMs : Number(line.syllables?.[0]?.startTimeMs ?? Number.NaN);
};

export const parseSpotifyColorLyrics = (payload: SpotifyColorLyrics): LineLyrics | undefined => {
	const syncType = payload.lyrics?.syncType;
	if (!syncType || !TIMED_SYNC_TYPES.has(syncType)) {
		return undefined;
	}
	const lines = (payload.lyrics?.lines ?? [])
		.map((line) => ({ text: line.words || "♪", startTime: lineStartMs(line) / 1000 }))
		.filter((line) => Number.isFinite(line.startTime))
		.sort((a, b) => a.startTime - b.startTime);
	if (lines.length === 0) {
		return undefined;
	}
	const content = lines.map((line, index) => {
		// Lines sharing a timestamp end at the next distinct one: a zero-length line fails validation
		// and would discard the whole document.
		const next = lines.slice(index + 1).find((candidate) => candidate.startTime > line.startTime);
		return {
			type: "vocal" as const,
			text: line.text,
			startTime: line.startTime,
			endTime: next?.startTime ?? line.startTime + FALLBACK_LINE_DURATION_SECONDS,
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
