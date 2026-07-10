import { clamp } from "../../shared/math";

export { clamp };

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const median = (values: number[]): number => {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};
