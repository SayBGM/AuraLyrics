import type { Interlude } from "../lyrics/types";

export type FrameProgress = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

export const interludeKey = (interlude: Interlude): string => `${roundTime(interlude.startTime)}:${roundTime(interlude.endTime)}`;

export const progressPercent = (progress: number): string => `${Math.round(clampProgress(progress) * 10000) / 100}%`;

export const splitFrameProgress = (progress: number): FrameProgress => {
	const scaled = clampProgress(progress) * 4;
	return {
		top: clampProgress(scaled),
		right: clampProgress(scaled - 1),
		bottom: clampProgress(scaled - 2),
		left: clampProgress(scaled - 3),
	};
};

const roundTime = (value: number): number => Math.round(value * 1000) / 1000;

const clampProgress = (value: number): number => Math.min(1, Math.max(0, value));
