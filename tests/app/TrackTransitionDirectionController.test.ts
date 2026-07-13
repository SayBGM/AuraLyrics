import { describe, expect, test } from "vitest";
import { NAVIGATION_INTENT_TIMEOUT_MS, TrackTransitionDirectionController } from "../../src/app/TrackTransitionDirectionController";

describe("TrackTransitionDirectionController", () => {
	test("consumes next then previous intents in FIFO order", () => {
		const controller = new TrackTransitionDirectionController(() => 0);
		controller.enqueue("next");
		controller.enqueue("previous");

		expect(controller.consume()).toBe("next");
		expect(controller.consume()).toBe("previous");
		expect(controller.consume()).toBe("unknown");
	});

	test("matches two quick next intents to two track changes", () => {
		let nowMs = 1_000;
		const controller = new TrackTransitionDirectionController(() => nowMs);
		controller.enqueue("next");
		nowMs += 10;
		controller.enqueue("next");

		expect(controller.consume()).toBe("next");
		expect(controller.consume()).toBe("next");
		expect(controller.consume()).toBe("unknown");
	});

	test("keeps an intent at exactly 5000 ms and expires it at 5001 ms", () => {
		let nowMs = 0;
		const controller = new TrackTransitionDirectionController(() => nowMs);
		controller.enqueue("next");

		nowMs = NAVIGATION_INTENT_TIMEOUT_MS;
		expect(controller.consume()).toBe("next");

		controller.enqueue("previous");
		nowMs += NAVIGATION_INTENT_TIMEOUT_MS + 1;
		expect(controller.consume()).toBe("unknown");
	});

	test("prunes expired intents from the FIFO head before enqueueing", () => {
		let nowMs = 0;
		const controller = new TrackTransitionDirectionController(() => nowMs);
		controller.enqueue("next");

		nowMs = NAVIGATION_INTENT_TIMEOUT_MS + 1;
		controller.enqueue("previous");

		expect(controller.consume()).toBe("previous");
		expect(controller.consume()).toBe("unknown");
	});

	test("prefers an explicit previous intent over natural-end inference", () => {
		const controller = new TrackTransitionDirectionController(() => 0);
		controller.enqueue("previous");

		expect(controller.consume({ previousProgressSec: 98, previousDurationSec: 100 })).toBe("previous");
	});

	test("infers next only at the natural-end tolerance boundary", () => {
		const controller = new TrackTransitionDirectionController(() => 0);

		expect(controller.consume({ previousProgressSec: 98, previousDurationSec: 100 })).toBe("next");
		expect(controller.consume({ previousProgressSec: 97.999, previousDurationSec: 100 })).toBe("unknown");
	});

	test("returns unknown for undefined or empty previous progress", () => {
		const controller = new TrackTransitionDirectionController(() => 0);

		expect(controller.consume()).toBe("unknown");
		expect(controller.consume({})).toBe("unknown");
	});

	test("clear removes every pending intent", () => {
		const controller = new TrackTransitionDirectionController(() => 0);
		controller.enqueue("next");
		controller.enqueue("previous");

		controller.clear();

		expect(controller.consume()).toBe("unknown");
	});
});

test("exports the navigation intent timeout", () => {
	expect(NAVIGATION_INTENT_TIMEOUT_MS).toBe(5_000);
});
