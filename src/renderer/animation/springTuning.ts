import { clamp } from "../../shared/math";

export type SpringTuning = {
	dampingRatio: number;
	frequency: number;
};

export const DEFAULT_SPRING_SOFTNESS = 0.65;

export const SPRING_PROFILES = {
	scale: { dampingRatio: 0.6, frequency: 0.7 },
	yOffset: { dampingRatio: 0.4, frequency: 1.25 },
	glow: { dampingRatio: 0.5, frequency: 1 },
} as const satisfies Record<"glow" | "scale" | "yOffset", SpringTuning>;

const FREQUENCY_RESPONSE = 0.8;

export const springTuningForSoftness = (profile: SpringTuning, softness: number): SpringTuning => {
	const normalizedSoftness = Number.isFinite(softness) ? clamp(softness, 0, 1) : DEFAULT_SPRING_SOFTNESS;
	const frequencyMultiplier = 1 + (DEFAULT_SPRING_SOFTNESS - normalizedSoftness) * FREQUENCY_RESPONSE;
	return {
		dampingRatio: profile.dampingRatio,
		frequency: Number((profile.frequency * frequencyMultiplier).toFixed(12)),
	};
};
