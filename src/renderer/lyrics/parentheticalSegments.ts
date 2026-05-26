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
	const normalizedSegments = attachLeadingPunctuationToPreviousMain(segments);
	return normalizedSegments.length > 0 ? normalizedSegments : [{ text, isParenthetical: false, continues: false }];
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

const attachLeadingPunctuationToPreviousMain = (segments: ParentheticalSegment[]): ParentheticalSegment[] => {
	const normalizedSegments = segments.map((segment) => ({ ...segment }));
	for (let index = 1; index < normalizedSegments.length; index += 1) {
		const segment = normalizedSegments[index];
		const previousSegment = normalizedSegments[index - 1];
		if (segment.isParenthetical || !previousSegment.isParenthetical) {
			continue;
		}
		const match = segment.text.match(/^([,，、;:!?！？.。]+)\s*(.*)$/);
		if (!match) {
			continue;
		}
		const previousMain = findPreviousMainSegment(normalizedSegments, index - 1);
		if (!previousMain) {
			continue;
		}
		previousMain.text = `${previousMain.text}${match[1]}`;
		segment.text = match[2].trim();
	}
	return normalizedSegments.filter((segment) => segment.text.length > 0);
};

const findPreviousMainSegment = (segments: ParentheticalSegment[], beforeIndex: number): ParentheticalSegment | undefined => {
	for (let index = beforeIndex; index >= 0; index -= 1) {
		const segment = segments[index];
		if (!segment.isParenthetical) {
			return segment;
		}
	}
	return undefined;
};
