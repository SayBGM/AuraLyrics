import { scanParentheticalText } from "../../lyrics/parentheticalScanner";
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

export type ParentheticalParseEvent =
	| {
			kind: "segment";
			segment: ParentheticalSegment;
			startUnit: number;
			endUnit: number;
	  }
	| {
			kind: "open" | "close";
			startUnit: number;
			endUnit: number;
	  };

export type ParentheticalParseResult = {
	events: ParentheticalParseEvent[];
	segments: ParentheticalSegment[];
	depthAfter: number;
	unitCount: number;
};

export type TimedParentheticalEvent =
	| {
			kind: "segment";
			segment: TimedParentheticalSegment;
	  }
	| {
			kind: "open" | "close";
			startTime: number;
			endTime: number;
	  };

export type TimedParentheticalText = {
	syllable: Syllable;
	segment: TimedParentheticalSegment;
};

export type ParentheticalVocalItem =
	| {
			kind: "main";
			text: TimedParentheticalText;
			trailingPunctuation?: TimedParentheticalText[];
	  }
	| {
			kind: "parenthetical";
			segments: TimedParentheticalText[];
			closed: boolean;
			tailEndTime: number;
			trailingPunctuation?: TimedParentheticalText[];
	  };

export const parseWordLevelParentheticals = (text: string, depthBefore: number): ParentheticalParseResult => {
	const scan = scanParentheticalText(text, depthBefore);
	const events: ParentheticalParseEvent[] = [];
	for (const [index, event] of scan.events.entries()) {
		if (event.kind !== "text") {
			events.push(event);
			continue;
		}
		const normalized = normalizedTextEvent(event.text, event.startUnit, event.endUnit);
		if (!normalized) {
			continue;
		}
		const isParenthetical = event.role === "parenthetical";
		const closesLaterInToken = scan.events.slice(index + 1).some((laterEvent) => laterEvent.kind === "close");
		events.push({
			kind: "segment",
			segment: {
				text: normalized.text,
				isParenthetical,
				continues: isParenthetical && scan.depthAfter > 0 && !closesLaterInToken,
			},
			startUnit: normalized.startUnit,
			endUnit: normalized.endUnit,
		});
	}
	return {
		events,
		segments: events.flatMap((event) => (event.kind === "segment" ? [event.segment] : [])),
		depthAfter: scan.depthAfter,
		unitCount: scan.unitCount,
	};
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

export const withParentheticalEventTiming = (
	syllable: Syllable,
	result: Pick<ParentheticalParseResult, "events" | "unitCount">
): TimedParentheticalEvent[] => {
	const segmentEvents = result.events.flatMap((event) => (event.kind === "segment" ? [event.segment] : []));
	const timedSegments = withSegmentTiming(syllable, segmentEvents);
	let segmentIndex = 0;
	return result.events.map((event) => {
		if (event.kind === "segment") {
			const segment = timedSegments[segmentIndex];
			segmentIndex += 1;
			return { kind: "segment", segment };
		}
		return {
			kind: event.kind,
			startTime: timeAtUnit(syllable, event.startUnit, result.unitCount),
			endTime: timeAtUnit(syllable, event.endUnit, result.unitCount),
		};
	});
};

/**
 * Parses a whole vocal before row assembly so provider token boundaries do not
 * change parenthetical grouping or punctuation cleanup behavior.
 */
export const tokenizeParentheticalSyllables = (syllables: readonly Syllable[]): ParentheticalVocalItem[] => {
	const items: ParentheticalVocalItem[] = [];
	let depth = 0;
	let activeGroup: Extract<ParentheticalVocalItem, { kind: "parenthetical" }> | undefined;

	for (const syllable of syllables) {
		const result = parseWordLevelParentheticals(syllable.text, depth);
		depth = result.depthAfter;
		for (const event of withParentheticalEventTiming(syllable, result)) {
			if (event.kind === "open") {
				activeGroup = { kind: "parenthetical", segments: [], closed: false, tailEndTime: event.endTime };
				continue;
			}
			if (event.kind === "segment") {
				const text = { syllable, segment: event.segment };
				if (event.segment.isParenthetical) {
					activeGroup ??= { kind: "parenthetical", segments: [], closed: false, tailEndTime: event.segment.startTime };
					activeGroup.segments.push(text);
					activeGroup.tailEndTime = Math.max(activeGroup.tailEndTime, event.segment.endTime);
				} else {
					items.push({ kind: "main", text });
				}
				continue;
			}
			if (activeGroup) {
				activeGroup.closed = true;
				activeGroup.tailEndTime = Math.max(activeGroup.tailEndTime, event.endTime);
				if (activeGroup.segments.length > 0) {
					items.push(activeGroup);
				}
				activeGroup = undefined;
			}
		}
	}

	if (activeGroup?.segments.length) {
		items.push(activeGroup);
	}
	return normalizeClosedParentheticalSuffixes(items);
};

const normalizedTextEvent = (text: string, startUnit: number, endUnit: number): { text: string; startUnit: number; endUnit: number } | undefined => {
	const normalized = text.trim();
	if (!normalized) {
		return undefined;
	}
	const leadingWhitespaceUnits = [...(text.match(/^\s*/u)?.[0] ?? "")].length;
	const trailingWhitespaceUnits = [...(text.match(/\s*$/u)?.[0] ?? "")].length;
	return {
		text: normalized,
		startUnit: startUnit + leadingWhitespaceUnits,
		endUnit: endUnit - trailingWhitespaceUnits,
	};
};

const timeAtUnit = (syllable: Syllable, unit: number, unitCount: number): number => {
	if (unitCount <= 0) {
		return syllable.startTime;
	}
	const progress = Math.min(Math.max(unit / unitCount, 0), 1);
	return syllable.startTime + (syllable.endTime - syllable.startTime) * progress;
};

const normalizeClosedParentheticalSuffixes = (items: ParentheticalVocalItem[]): ParentheticalVocalItem[] => {
	for (let index = 0; index < items.length; index += 1) {
		const group = items[index];
		if (group.kind !== "parenthetical" || !group.closed) {
			continue;
		}
		const next = items[index + 1];
		if (!next || next.kind !== "main") {
			continue;
		}

		const commaMatch = /^([,，、])\s*/u.exec(next.text.segment.text);
		if (commaMatch) {
			const split = removeTimedPrefix(next.text, commaMatch[0]);
			group.tailEndTime = Math.max(group.tailEndTime, split.prefixEndTime);
			if (split.remaining) {
				next.text = split.remaining;
			} else {
				items.splice(index + 1, 1);
			}
		}

		const suffix = items[index + 1];
		const previousMain = findPreviousMain(items, index);
		if (!suffix || suffix.kind !== "main") {
			continue;
		}
		const punctuationMatch = /^([,，、;:!?！？.。…]+)\s*/u.exec(suffix.text.segment.text);
		if (!punctuationMatch) {
			continue;
		}
		const split = removeTimedPrefix(suffix.text, punctuationMatch[0]);
		const target = previousMain ?? group;
		target.trailingPunctuation ??= [];
		target.trailingPunctuation.push({
			syllable: suffix.text.syllable,
			segment: {
				...suffix.text.segment,
				text: punctuationMatch[1],
				endTime: split.prefixEndTime,
			},
		});
		group.tailEndTime = Math.max(group.tailEndTime, split.prefixEndTime);
		if (split.remaining) {
			suffix.text = split.remaining;
		} else {
			items.splice(index + 1, 1);
		}
	}
	return items;
};

const removeTimedPrefix = (text: TimedParentheticalText, prefix: string): { remaining?: TimedParentheticalText; prefixEndTime: number } => {
	const chars = [...text.segment.text];
	const consumedUnits = Math.min([...prefix].length, chars.length);
	const progress = chars.length > 0 ? consumedUnits / chars.length : 1;
	const prefixEndTime = text.segment.startTime + (text.segment.endTime - text.segment.startTime) * progress;
	const remainingText = chars.slice(consumedUnits).join("");
	return {
		prefixEndTime,
		remaining: remainingText
			? {
					syllable: text.syllable,
					segment: { ...text.segment, text: remainingText, startTime: prefixEndTime },
				}
			: undefined,
	};
};

const findPreviousMain = (items: ParentheticalVocalItem[], beforeIndex: number): Extract<ParentheticalVocalItem, { kind: "main" }> | undefined => {
	for (let index = beforeIndex - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item.kind === "main") {
			return item;
		}
	}
	return undefined;
};
