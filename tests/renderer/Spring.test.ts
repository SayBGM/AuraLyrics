import { describe, expect, test } from "vitest";
import { Spring } from "../../src/renderer/animation/Spring";

describe("Spring", () => {
	test("converges toward the target and goes to sleep", () => {
		const spring = new Spring(0, 0.6, 1);
		spring.setTarget(1);

		let value = 0;
		for (let i = 0; i < 180; i += 1) {
			value = spring.update(1 / 60);
		}

		expect(value).toBeCloseTo(1, 1);
		expect(spring.isSleeping()).toBe(true);
	});

	test("set immediately resets position, target, and velocity", () => {
		const spring = new Spring(0, 0.5, 1);
		spring.setTarget(2);
		spring.update(1 / 60);
		spring.set(0.4);

		expect(spring.position).toBe(0.4);
		expect(spring.target).toBe(0.4);
		expect(spring.update(1 / 60)).toBe(0.4);
		expect(spring.isSleeping()).toBe(true);
	});
});
