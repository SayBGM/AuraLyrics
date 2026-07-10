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

	test("runtime tuning preserves the current position and target", () => {
		const spring = new Spring(0, 0.6, 1);
		spring.setTarget(2);
		spring.update(1 / 60);
		const position = spring.position;
		const target = spring.target;

		spring.configure(0.6, 0.5);

		expect(spring.position).toBe(position);
		expect(spring.target).toBe(target);
		expect(Number.isFinite(spring.update(1 / 60))).toBe(true);
	});

	test("rejects invalid runtime tuning without corrupting the spring", () => {
		const spring = new Spring(0, 0.6, 1);

		expect(() => spring.configure(Number.NaN, 1)).toThrow("Spring tuning requires a finite non-negative damping ratio and positive frequency.");
		expect(() => spring.configure(0.6, -1)).toThrow("Spring tuning requires a finite non-negative damping ratio and positive frequency.");
		spring.setTarget(1);
		expect(Number.isFinite(spring.update(1 / 60))).toBe(true);
	});
});
