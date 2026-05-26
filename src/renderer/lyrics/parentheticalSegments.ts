import type { Syllable } from "../../lyrics/types";

export type ParentheticalSegment = {
	text: string;
	isParenthetical: boolean;
	continues: boolean;
};

export type TimedParentheticalSegment = ParentheticalSegment & {
	startTime: number;
	endTime: number;
};

export const parseWordLevelParentheticals = (text: string, isInsideParenthetical: boolean): ParentheticalSegment[] => {
	const segments: ParentheticalSegment[] = [];
	let buffer = "";
	let isParenthetical = isInsideParenthetical;
	for (const char of text) {
		if (char === "(" && !isParenthetical) {
			appendSegment(segments, buffer, false, false);
			buffer = "";
			isParenthetical = true;
			continue;
		}
		if (char === ")" && isParenthetical) {
			appendSegment(segments, buffer, true, false);
			buffer = "";
			isParenthetical = false;
			continue;
		}
		buffer += char;
	}
	appendSegment(segments, buffer, isParenthetical, isParenthetical);
	return segments.length > 0 ? segments : [{ text, isParenthetical: false, continues: false }];
};

export const withSegmentTiming = (syllable: Syllable, segments: ParentheticalSegment[]): TimedParentheticalSegment[] => {
	const duration = Math.max(syllable.endTime - syllable.startTime, 0.001);
	const segmentDuration = duration / Math.max(segments.length, 1);
	return segments.map((segment, index) => ({
		...segment,
		startTime: syllable.startTime + segmentDuration * index,
		endTime: index === segments.length - 1 ? syllable.endTime : syllable.startTime + segmentDuration * (index + 1),
	}));
};

const appendSegment = (segments: ParentheticalSegment[], text: string, isParenthetical: boolean, continues: boolean): void => {
	const normalizedText = text.trim();
	if (!normalizedText) {
		return;
	}
	segments.push({ text: normalizedText, isParenthetical, continues });
};
