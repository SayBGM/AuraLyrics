import { describe, expect, test } from "vitest";
import { clamp, clampProgress, median } from "../../src/shared/math";

describe("clamp", () => {
	test("bounds a value to the inclusive range", () => {
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(11, 0, 10)).toBe(10);
	});
});

describe("clampProgress", () => {
	test("bounds progress to 0..1", () => {
		expect(clampProgress(-0.5)).toBe(0);
		expect(clampProgress(0.25)).toBe(0.25);
		expect(clampProgress(1.5)).toBe(1);
	});

	test("treats non-finite progress as 0 so it never reaches CSS", () => {
		expect(clampProgress(Number.NaN)).toBe(0);
		expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(0);
		expect(clampProgress(Number.NEGATIVE_INFINITY)).toBe(0);
	});
});

describe("median", () => {
	test("averages the middle pair for even counts and picks the middle for odd ones", () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	test("does not mutate the input and returns 0 for an empty list", () => {
		const values = [3, 1, 2];
		expect(median(values)).toBe(2);
		expect(values).toEqual([3, 1, 2]);
		expect(median([])).toBe(0);
	});
});
