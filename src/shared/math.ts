export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

/**
 * Clamps a 0..1 progress value, treating a non-finite input as 0. Progress is derived from
 * divisions by durations, so a degenerate document must not leak NaN into CSS.
 */
export const clampProgress = (value: number): number => (Number.isFinite(value) ? clamp(value, 0, 1) : 0);

export const median = (values: number[]): number => {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};
