import { describe, expect, test } from "vitest";
import { clamp } from "../../src/shared/math";

describe("clamp", () => {
	test("bounds a value to the inclusive range", () => {
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(11, 0, 10)).toBe(10);
	});
});
