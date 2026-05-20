import type { LineLyrics } from "../types";

type SpotifyLine = {
	startTimeMs: string | number;
	words: string;
};

type SpotifyColorLyrics = {
	lyrics?: {
		syncType?: string;
		lines?: SpotifyLine[];
	};
};

export const parseSpotifyColorLyrics = (payload: SpotifyColorLyrics): LineLyrics | undefined => {
	const lines = payload.lyrics?.lines;
	if (!lines?.length || payload.lyrics?.syncType !== "LINE_SYNCED") {
		return undefined;
	}
	const content = lines.map((line, index) => {
		const startTime = Number(line.startTimeMs) / 1000;
		const next = lines[index + 1];
		return {
			type: "vocal" as const,
			text: line.words || "♪",
			startTime,
			endTime: next ? Number(next.startTimeMs) / 1000 : startTime + 4,
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
