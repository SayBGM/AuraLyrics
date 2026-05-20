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

export const parseMusixmatchSubtitle = (subtitleBody: string): LineLyrics | undefined => {
	const lines = JSON.parse(subtitleBody) as MusixmatchSubtitleLine[];
	if (!Array.isArray(lines) || lines.length === 0) {
		return undefined;
	}
	const content = lines.map((line, index) => {
		const startTime = line.time.total;
		return {
			type: "vocal" as const,
			text: line.text || "♪",
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

export const parseMusixmatchRichsync = (richsyncBody: string): SyllableLyrics | undefined => {
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
