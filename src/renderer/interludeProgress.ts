import type { Interlude } from "../lyrics/types";
import { clamp } from "../shared/math";

export type FrameProgress = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

export type FrameProgressDimensions = {
	width: number;
	height: number;
	frameSize?: number;
};

export const interludeKey = (interlude: Interlude): string => `${roundTime(interlude.startTime)}:${roundTime(interlude.endTime)}`;

export const progressPercent = (progress: number): string => `${Math.round(clampProgress(progress) * 10000) / 100}%`;

export const interludeProgressAt = (timestamp: number, startTime: number, endTime: number): number =>
	clampProgress((timestamp - startTime) / Math.max(0.001, endTime - startTime));

export const frameSizeForViewport = (dimensions: Pick<FrameProgressDimensions, "width" | "height">): number =>
	clamp(Math.min(dimensions.width, dimensions.height) * 0.034, 12, 18);

export const splitFrameProgress = (progress: number, dimensions?: FrameProgressDimensions): FrameProgress => {
	const sideLengths = getFrameSideLengths(dimensions);
	if (sideLengths === undefined) {
		const scaled = clampProgress(progress) * 4;
		return {
			top: clampProgress(scaled),
			right: clampProgress(scaled - 1),
			bottom: clampProgress(scaled - 2),
			left: clampProgress(scaled - 3),
		};
	}

	const totalLength = sideLengths.top + sideLengths.right + sideLengths.bottom + sideLengths.left;
	let remainingLength = clampProgress(progress) * totalLength;
	return {
		top: consumeSideProgress(sideLengths.top),
		right: consumeSideProgress(sideLengths.right),
		bottom: consumeSideProgress(sideLengths.bottom),
		left: consumeSideProgress(sideLengths.left),
	};

	function consumeSideProgress(sideLength: number): number {
		if (sideLength <= 0) {
			return 1;
		}
		const sideProgress = clampProgress(remainingLength / sideLength);
		remainingLength -= sideLength;
		return sideProgress;
	}
};

const roundTime = (value: number): number => Math.round(value * 1000) / 1000;

// Deliberately not `shared/math.clampProgress`: frame progress is fed straight into CSS
// lengths, where a non-finite input has to stay visible as such rather than read as 0%.
const clampProgress = (value: number): number => clamp(value, 0, 1);

const getFrameSideLengths = (dimensions: FrameProgressDimensions | undefined): FrameProgress | undefined => {
	if (dimensions === undefined || dimensions.width <= 0 || dimensions.height <= 0) {
		return undefined;
	}
	const frameSize = Math.max(0, dimensions.frameSize ?? 0);
	const verticalLength = Math.max(0, dimensions.height - frameSize * 2);
	const lengths = {
		top: dimensions.width,
		right: verticalLength,
		bottom: dimensions.width,
		left: verticalLength,
	};
	const totalLength = lengths.top + lengths.right + lengths.bottom + lengths.left;
	return totalLength > 0 ? lengths : undefined;
};
