import type { HighlightMotion } from "../../settings/settingsSchema";
import { glowCurve, scaleCurve, yOffsetCurve } from "./curves";
import { clamp } from "./Spline";

export type HighlightMotionSample = {
	scale: number;
	scaleX: number;
	scaleY: number;
	yOffset: number;
	rotationDeg: number;
	glow: number;
	ripple: number;
};

const STILL_SAMPLE: HighlightMotionSample = {
	scale: 1,
	scaleX: 1,
	scaleY: 1,
	yOffset: 0,
	rotationDeg: 0,
	glow: 0,
	ripple: 0,
};

export const sampleHighlightMotion = (
	motion: HighlightMotion,
	progressValue: number,
	index: number,
	intensityValue: number,
	reducedMotion = false
): HighlightMotionSample => {
	const progress = clamp(progressValue, 0, 1);
	const intensity = Math.max(0, intensityValue);
	if (reducedMotion || intensity === 0 || progress <= 0 || progress >= 1) {
		return { ...STILL_SAMPLE };
	}
	const sample = baseSample(motion, progress, index);
	return {
		scale: 1 + (sample.scale - 1) * intensity,
		scaleX: 1 + (sample.scaleX - 1) * intensity,
		scaleY: 1 + (sample.scaleY - 1) * intensity,
		yOffset: sample.yOffset * intensity,
		rotationDeg: sample.rotationDeg * intensity,
		glow: sample.glow * intensity,
		ripple: sample.ripple * intensity,
	};
};

const baseSample = (motion: HighlightMotion, progress: number, index: number): HighlightMotionSample => {
	const envelope = Math.sin(Math.PI * progress);
	switch (motion) {
		case "pulse":
			return sample({ scale: 1 + envelope * 0.065, yOffset: -envelope * 0.015, glow: envelope * 0.72 });
		case "bounce": {
			const rebound = Math.sin(progress * Math.PI * 3) * (1 - progress);
			return sample({ scale: 1 + envelope * 0.035, yOffset: -envelope * 0.14 + rebound * 0.026, glow: envelope * 0.78 });
		}
		case "elastic": {
			const stretch = Math.sin(progress * Math.PI * 3.5) * (1 - progress);
			return sample({
				scale: 1 + envelope * 0.025,
				scaleX: 1 + stretch * 0.14,
				scaleY: 1 - stretch * 0.09,
				yOffset: -envelope * 0.025,
				glow: envelope * 0.62,
			});
		}
		case "wave": {
			const wave = Math.sin((progress + index * 0.14) * Math.PI * 2) * envelope;
			return sample({
				scale: 1 + envelope * 0.025,
				yOffset: -wave * 0.075,
				rotationDeg: wave * 2.6,
				glow: envelope * 0.66,
			});
		}
		case "ripple":
			return sample({
				scale: 1 + envelope * 0.03,
				yOffset: -envelope * 0.02,
				glow: envelope * 0.82,
				ripple: envelope,
			});
		case "spring":
			return sample({ scale: scaleCurve.at(progress), yOffset: yOffsetCurve.at(progress), glow: glowCurve.at(progress) });
	}
};

const sample = (values: Partial<HighlightMotionSample>): HighlightMotionSample => ({ ...STILL_SAMPLE, ...values });
