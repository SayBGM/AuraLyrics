import { describe, expect, test } from "vitest";
import { interludeKey, progressPercent, splitFrameProgress } from "../../src/renderer/interludeProgress";

describe("interludeProgress", () => {
	test("creates stable rounded keys for interlude waveform maps", () => {
		expect(interludeKey({ type: "interlude", startTime: 4.12345, endTime: 5.98765 })).toBe("4.123:5.988");
	});

	test("splits frame progress across top, right, bottom, and left sides", () => {
		expect(splitFrameProgress(0)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
		expect(splitFrameProgress(0.5)).toEqual({ top: 1, right: 1, bottom: 0, left: 0 });
		expect(splitFrameProgress(1)).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
	});

	test("formats CSS percent values with two decimal precision when needed", () => {
		expect(progressPercent(0.5)).toBe("50%");
		expect(progressPercent(0.12345)).toBe("12.35%");
	});
});
