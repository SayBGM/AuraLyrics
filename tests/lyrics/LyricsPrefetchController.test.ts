import { describe, expect, test } from "vitest";
import { LyricsPrefetchController } from "../../src/lyrics/LyricsPrefetchController";

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

describe("LyricsPrefetchController", () => {
	test("reuses one in-flight request for the same key", async () => {
		const controller = new LyricsPrefetchController<string>();
		const pending = deferred<string>();
		let calls = 0;
		const first = controller.prepare("same", async () => {
			calls += 1;
			return pending.promise;
		});
		const second = controller.prepare("same", async () => "unexpected");

		expect(calls).toBe(1);
		expect(second).toBe(first);
		pending.resolve("ready");
		await expect(first).resolves.toBe("ready");
	});

	test("cancels the replaced background request", () => {
		const controller = new LyricsPrefetchController<string>();
		let firstSignal: AbortSignal | undefined;
		controller.prepare("first", async (signal) => {
			firstSignal = signal;
			return "first";
		});
		controller.prepare("second", async () => "second");

		expect(firstSignal?.aborted).toBe(true);
	});

	test("expires completed results after its TTL", async () => {
		let now = 0;
		const controller = new LyricsPrefetchController<string>(() => now, 100);
		await controller.prepare("track", async () => "ready");
		expect(controller.get("track")).toBeDefined();
		now = 101;
		expect(controller.get("track")).toBeUndefined();
	});
});
