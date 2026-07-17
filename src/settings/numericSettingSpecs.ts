export type NumericSettingKey =
	| "backgroundBlurPx"
	| "backgroundDim"
	| "backgroundSaturation"
	| "fontScale"
	| "glowStrength"
	| "inactiveBlurPx"
	| "lyricsDelayMs"
	| "motionIntensity"
	| "vignetteStrength"
	| "visibleContextLines";

export type NumericSettingUnit = "lines" | "ms" | "percent" | "px";

export type NumericSettingSpec = {
	max: number;
	min: number;
	step: number;
	unit: NumericSettingUnit;
};

export const NUMERIC_SETTING_SPECS: Record<NumericSettingKey, NumericSettingSpec> = {
	fontScale: { min: 0.6, max: 2.4, step: 0.01, unit: "percent" },
	backgroundBlurPx: { min: 0, max: 80, step: 1, unit: "px" },
	backgroundDim: { min: 0, max: 1, step: 0.05, unit: "percent" },
	backgroundSaturation: { min: 0, max: 2, step: 0.05, unit: "percent" },
	vignetteStrength: { min: 0, max: 1, step: 0.05, unit: "percent" },
	inactiveBlurPx: { min: 0, max: 4, step: 0.05, unit: "px" },
	motionIntensity: { min: 0, max: 2, step: 0.05, unit: "percent" },
	glowStrength: { min: 0, max: 1.5, step: 0.05, unit: "percent" },
	lyricsDelayMs: { min: -5000, max: 5000, step: 50, unit: "ms" },
	visibleContextLines: { min: 0, max: 2, step: 1, unit: "lines" },
};

export const clampNumericSetting = (key: NumericSettingKey, value: unknown, fallback: number): number => {
	const spec = NUMERIC_SETTING_SPECS[key];
	const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
	const clamped = Math.min(spec.max, Math.max(spec.min, next));
	return spec.step >= 1 ? Math.round(clamped) : clamped;
};
