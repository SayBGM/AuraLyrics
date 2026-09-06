import type { HighlightMotion } from "../../settings/settingsSchema";
import { clamp } from "../../shared/math";
import { glowCurve, scaleCurve, yOffsetCurve } from "./curves";

export type HighlightMotionSample = {
	scale: number;
	scaleX: number;
	scaleY: number;
	yOffset: number;
	rotationDeg: number;
	glow: number;
	ripple: number;
};

const STILL_SAMPLE: Readonly<HighlightMotionSample> = Object.freeze({
	scale: 1,
	scaleX: 1,
	scaleY: 1,
	yOffset: 0,
	rotationDeg: 0,
	glow: 0,
	ripple: 0,
});

export const createHighlightMotionSample = (): HighlightMotionSample => ({ ...STILL_SAMPLE });

/**
 * Fills a caller-owned sample so the per-frame hot path allocates nothing. The values are
 * identical to `sampleHighlightMotion`, which is now a thin allocating wrapper around it.
 */
export const sampleHighlightMotionInto = (
	out: HighlightMotionSample,
	motion: HighlightMotion,
	progressValue: number,
	index: number,
	intensityValue: number,
	reducedMotion = false
): HighlightMotionSample => {
	const progress = clamp(progressValue, 0, 1);
	const intensity = Math.max(0, intensityValue);
	resetSample(out);
	if (reducedMotion || intensity === 0 || progress <= 0 || progress >= 1) {
		return out;
	}
	baseSampleInto(out, motion, progress, index);
	out.scale = 1 + (out.scale - 1) * intensity;
	out.scaleX = 1 + (out.scaleX - 1) * intensity;
	out.scaleY = 1 + (out.scaleY - 1) * intensity;
	out.yOffset = out.yOffset * intensity;
	out.rotationDeg = out.rotationDeg * intensity;
	out.glow = out.glow * intensity;
	out.ripple = out.ripple * intensity;
	return out;
};

export const sampleHighlightMotion = (
	motion: HighlightMotion,
	progressValue: number,
	index: number,
	intensityValue: number,
	reducedMotion = false
): HighlightMotionSample => sampleHighlightMotionInto(createHighlightMotionSample(), motion, progressValue, index, intensityValue, reducedMotion);

const resetSample = (out: HighlightMotionSample): void => {
	out.scale = 1;
	out.scaleX = 1;
	out.scaleY = 1;
	out.yOffset = 0;
	out.rotationDeg = 0;
	out.glow = 0;
	out.ripple = 0;
};

const baseSampleInto = (out: HighlightMotionSample, motion: HighlightMotion, progress: number, index: number): void => {
	const envelope = Math.sin(Math.PI * progress);
	switch (motion) {
		case "pulse": {
			out.scale = 1 + envelope * 0.065;
			out.yOffset = -envelope * 0.015;
			out.glow = envelope * 0.72;
			return;
		}
		case "bounce": {
			const rebound = Math.sin(progress * Math.PI * 3) * (1 - progress);
			out.scale = 1 + envelope * 0.035;
			out.yOffset = -envelope * 0.14 + rebound * 0.026;
			out.glow = envelope * 0.78;
			return;
		}
		case "elastic": {
			const stretch = Math.sin(progress * Math.PI * 3.5) * (1 - progress);
			out.scale = 1 + envelope * 0.025;
			out.scaleX = 1 + stretch * 0.14;
			out.scaleY = 1 - stretch * 0.09;
			out.yOffset = -envelope * 0.025;
			out.glow = envelope * 0.62;
			return;
		}
		case "wave": {
			const wave = Math.sin((progress + index * 0.14) * Math.PI * 2) * envelope;
			out.scale = 1 + envelope * 0.025;
			out.yOffset = -wave * 0.075;
			out.rotationDeg = wave * 2.6;
			out.glow = envelope * 0.66;
			return;
		}
		case "ripple": {
			out.scale = 1 + envelope * 0.03;
			out.yOffset = -envelope * 0.02;
			out.glow = envelope * 0.82;
			out.ripple = envelope;
			return;
		}
		case "spring": {
			out.scale = scaleCurve.at(progress);
			out.yOffset = yOffsetCurve.at(progress);
			out.glow = glowCurve.at(progress);
			return;
		}
	}
};
