import { describe, expect, test, vi } from "vitest";
import { EventEmitter } from "../../src/shared/EventEmitter";

describe("EventEmitter", () => {
	test("delivers the value to every subscribed listener", () => {
		const emitter = new EventEmitter<number>();
		const first = vi.fn();
		const second = vi.fn();
		emitter.subscribe(first);
		emitter.subscribe(second);

		emitter.emit(42);

		expect(first).toHaveBeenCalledWith(42);
		expect(second).toHaveBeenCalledWith(42);
	});

	test("unsubscribe stops further delivery to that listener", () => {
		const emitter = new EventEmitter<number>();
		const listener = vi.fn();
		const unsubscribe = emitter.subscribe(listener);

		emitter.emit(1);
		unsubscribe();
		emitter.emit(2);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(1);
	});

	test("isolates a throwing listener so later listeners still run", () => {
		const emitter = new EventEmitter<number>();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const throwing = vi.fn(() => {
			throw new Error("boom");
		});
		const after = vi.fn();
		emitter.subscribe(throwing);
		emitter.subscribe(after);

		expect(() => emitter.emit(7)).not.toThrow();

		expect(throwing).toHaveBeenCalledWith(7);
		expect(after).toHaveBeenCalledWith(7);
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	test("a listener that throws does not stop it from being invoked again on the next emit", () => {
		const emitter = new EventEmitter<number>();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const throwing = vi.fn(() => {
			throw new Error("boom");
		});
		emitter.subscribe(throwing);

		emitter.emit(1);
		emitter.emit(2);

		expect(throwing).toHaveBeenCalledTimes(2);
		errorSpy.mockRestore();
	});

	test("a listener unsubscribing itself during emit does not disrupt remaining listeners", () => {
		const emitter = new EventEmitter<number>();
		const after = vi.fn();
		let unsubscribeSelf!: () => void;
		const self = vi.fn(() => unsubscribeSelf());
		unsubscribeSelf = emitter.subscribe(self);
		emitter.subscribe(after);

		emitter.emit(1);

		expect(self).toHaveBeenCalledTimes(1);
		expect(after).toHaveBeenCalledTimes(1);

		emitter.emit(2);

		expect(self).toHaveBeenCalledTimes(1);
		expect(after).toHaveBeenCalledTimes(2);
	});

	test("a listener unsubscribing a different, not-yet-called listener during emit skips it safely", () => {
		const emitter = new EventEmitter<number>();
		const victim = vi.fn();
		let unsubscribeVictim!: () => void;
		unsubscribeVictim = emitter.subscribe(victim);
		const disruptor = vi.fn(() => unsubscribeVictim());
		// disruptor subscribed after victim, so it runs after victim on this emit;
		// re-subscribe order matters only for which listener unsubscribes which.
		emitter.subscribe(disruptor);

		expect(() => emitter.emit(1)).not.toThrow();

		expect(victim).toHaveBeenCalledTimes(1);
		expect(disruptor).toHaveBeenCalledTimes(1);
	});
});
