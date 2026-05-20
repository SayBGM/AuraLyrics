import type { LineLyrics, LineVocal, Syllable, SyllableLyrics, SyllableVocalSet } from "../types";

type RawLine = {
	startTime: number;
	text: string;
};

const LINE_TIMESTAMP = /\[([0-9:.]+)\]/g;
const WORD_TIMESTAMP = /<([0-9:.]+)>/g;

const parseTimestamp = (value: string): number => {
	const [minutes = "0", seconds = "0"] = value.split(":");
	return Number(minutes) * 60 + Number(seconds);
};

const parseRawLines = (source: string): RawLine[] => {
	const lines: RawLine[] = [];
	for (const rawLine of source.split(/\r?\n/)) {
		const timestamps = [...rawLine.matchAll(LINE_TIMESTAMP)];
		if (timestamps.length === 0) {
			continue;
		}
		const text = rawLine.replace(LINE_TIMESTAMP, "").trim();
		for (const timestamp of timestamps) {
			lines.push({ startTime: parseTimestamp(timestamp[1]), text });
		}
	}
	return lines.sort((a, b) => a.startTime - b.startTime);
};

const inferEndTime = (lines: RawLine[], index: number): number => lines[index + 1]?.startTime ?? lines[index].startTime + 4;

const createInterlude = (startTime: number, endTime: number) => ({
	type: "interlude" as const,
	startTime,
	endTime,
});

const parseLineLyrics = (lines: RawLine[]): LineLyrics => {
	const content = lines.map((line, index) => {
		const endTime = inferEndTime(lines, index);
		if (!line.text) {
			return createInterlude(line.startTime, endTime);
		}
		return {
			type: "vocal",
			text: line.text.replace(WORD_TIMESTAMP, "").trim() || "♪",
			startTime: line.startTime,
			endTime,
			oppositeAligned: false,
		} satisfies LineVocal;
	});

	return {
		type: "line",
		startTime: lines[0]?.startTime ?? 0,
		endTime: content.at(-1)?.endTime ?? 0,
		content,
	};
};

const parseWordTimedSyllables = (line: RawLine, fallbackEndTime: number): Syllable[] => {
	const matches = [...line.text.matchAll(WORD_TIMESTAMP)];
	if (matches.length === 0) {
		return [
			{
				text: line.text.trim() || "♪",
				startTime: line.startTime,
				endTime: fallbackEndTime,
				isPartOfWord: false,
			},
		];
	}

	const syllables: Syllable[] = [];
	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		const nextMatch = matches[index + 1];
		const textStart = (match.index ?? 0) + match[0].length;
		const textEnd = nextMatch?.index ?? line.text.length;
		const text = line.text.slice(textStart, textEnd).replace(WORD_TIMESTAMP, "").trim();
		if (!text) {
			continue;
		}
		syllables.push({
			text,
			startTime: parseTimestamp(match[1]),
			endTime: nextMatch ? parseTimestamp(nextMatch[1]) : fallbackEndTime,
			isPartOfWord: false,
		});
	}
	return syllables;
};

const parseSyllableLyrics = (lines: RawLine[]): SyllableLyrics => {
	const content = lines.map((line, index) => {
		const endTime = inferEndTime(lines, index);
		if (!line.text) {
			return createInterlude(line.startTime, endTime);
		}
		const syllables = parseWordTimedSyllables(line, endTime);
		const vocal = {
			type: "vocal",
			oppositeAligned: false,
			lead: {
				startTime: syllables[0]?.startTime ?? line.startTime,
				endTime: syllables.at(-1)?.endTime ?? endTime,
				syllables,
			},
		} satisfies SyllableVocalSet;
		return vocal;
	});

	return {
		type: "syllable",
		startTime: lines[0]?.startTime ?? 0,
		endTime: Math.max(...content.map((item) => (item.type === "vocal" ? item.lead.endTime : item.endTime)), 0),
		content,
	};
};

export const parseLrc = (source: string): LineLyrics | SyllableLyrics => {
	const lines = parseRawLines(source);
	if (lines.some((line) => WORD_TIMESTAMP.test(line.text))) {
		WORD_TIMESTAMP.lastIndex = 0;
		return parseSyllableLyrics(lines);
	}
	return parseLineLyrics(lines);
};
