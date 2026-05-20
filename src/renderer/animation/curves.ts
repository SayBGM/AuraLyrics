import { LinearSpline } from "./Spline";

export const scaleCurve = new LinearSpline([
	{ time: 0, value: 0.95 },
	{ time: 0.7, value: 1.025 },
	{ time: 1, value: 1 },
]);

export const yOffsetCurve = new LinearSpline([
	{ time: 0, value: 0.01 },
	{ time: 0.9, value: -0.0167 },
	{ time: 1, value: 0 },
]);

export const glowCurve = new LinearSpline([
	{ time: 0, value: 0 },
	{ time: 0.15, value: 1 },
	{ time: 0.6, value: 1 },
	{ time: 1, value: 0 },
]);
