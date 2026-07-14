import { afterEach, describe, expect, test, vi } from "vitest";
import { COVER_CROSSFADE_DURATION_MS, PipCoverTransitionController } from "../../src/pip/PipCoverTransitionController";

const createHarness = () => {
	const layer = document.createElement("div");
	layer.className = "pip-cover-layer";
	document.body.append(layer);
	const availability: boolean[] = [];
	const controller = new PipCoverTransitionController(layer, (hasCover) => availability.push(hasCover));
	const covers = () => Array.from(layer.querySelectorAll<HTMLImageElement>("img.pip-cover"));
	return { availability, controller, covers, layer };
};

describe("PipCoverTransitionController", () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	test("keeps fallback visible until the first cover loads, then promotes one accessible-hidden plane immediately", () => {
		const { availability, controller, covers } = createHarness();

		controller.setCover("https://example.com/a.jpg");
		const [pending] = covers();

		expect(availability).toEqual([false]);
		expect(covers()).toHaveLength(1);
		expect(pending.dataset.coverState).toBe("pending");
		expect(pending.getAttribute("aria-hidden")).toBe("true");
		expect(pending.alt).toBe("");
		expect(pending.draggable).toBe(false);

		pending.dispatchEvent(new Event("load"));

		expect(covers()).toEqual([pending]);
		expect(pending.dataset.coverState).toBe("active");
		expect(pending.style.transition).toBe("none");
		expect(availability).toEqual([false, true]);
		expect(COVER_CROSSFADE_DURATION_MS).toBe(360);
	});

	test("keeps the active cover while loading a replacement and removes the outgoing plane after 360ms", () => {
		vi.useFakeTimers();
		const { controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		covers()[0].dispatchEvent(new Event("load"));

		controller.setCover("https://example.com/b.jpg");
		const [active, pending] = covers();

		expect(covers()).toHaveLength(2);
		expect(active.dataset.coverState).toBe("active");
		expect(pending.dataset.coverState).toBe("pending");

		pending.dispatchEvent(new Event("load"));

		expect(covers()).toHaveLength(2);
		expect(active.dataset.coverState).toBe("outgoing");
		expect(pending.dataset.coverState).toBe("incoming");
		vi.advanceTimersByTime(COVER_CROSSFADE_DURATION_MS - 1);
		expect(covers()).toHaveLength(2);
		vi.advanceTimersByTime(1);
		expect(covers()).toEqual([pending]);
		expect(pending.dataset.coverState).toBe("active");
	});

	test("replaces the active cover immediately on load when animation is disabled", () => {
		vi.useFakeTimers();
		const { controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		covers()[0].dispatchEvent(new Event("load"));

		controller.setCover("https://example.com/b.jpg", { animate: false });
		const replacement = covers()[1];
		replacement.dispatchEvent(new Event("load"));

		expect(covers()).toEqual([replacement]);
		expect(replacement.dataset.coverState).toBe("active");
		expect(replacement.style.transition).toBe("none");
		expect(vi.getTimerCount()).toBe(0);
	});

	test("finishes an in-flight crossfade by immediately promoting only the incoming cover", () => {
		vi.useFakeTimers();
		const { controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		const a = covers()[0];
		a.dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		const b = covers()[1];
		b.dispatchEvent(new Event("load"));
		expect(covers()).toEqual([a, b]);

		controller.finish();

		expect(covers()).toEqual([b]);
		expect(b.dataset.coverState).toBe("active");
		expect(b.style.transition).toBe("none");
		expect(vi.getTimerCount()).toBe(0);
	});

	test("removes active and pending covers when the next track has no URL", () => {
		const { availability, controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		covers()[0].dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");

		controller.setCover(undefined);

		expect(covers()).toEqual([]);
		expect(availability).toEqual([false, true, false]);
	});

	test("falls back and drops the previous cover when the pending image fails", () => {
		const { availability, controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		covers()[0].dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		const failed = covers()[1];

		failed.dispatchEvent(new Event("error"));

		expect(covers()).toEqual([]);
		expect(availability).toEqual([false, true, false]);
	});

	test("does not create or reload a plane for the same pending or active URL", () => {
		const { controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		const pending = covers()[0];

		controller.setCover("https://example.com/a.jpg");
		expect(covers()).toEqual([pending]);

		pending.dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/a.jpg");
		expect(covers()).toEqual([pending]);
	});

	test("ignores stale load and error events during rapid A to B to C changes and never exceeds two planes", () => {
		const { availability, controller, covers, layer } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		const a = covers()[0];
		a.dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		const b = covers()[1];

		controller.setCover("https://example.com/c.jpg");
		const c = covers()[1];

		expect(covers()).toEqual([a, c]);
		expect(layer.querySelectorAll(".pip-cover")).toHaveLength(2);
		expect(b.isConnected).toBe(false);

		b.dispatchEvent(new Event("load"));
		b.dispatchEvent(new Event("error"));
		expect(covers()).toEqual([a, c]);
		expect(availability).toEqual([false, true]);

		c.dispatchEvent(new Event("load"));
		expect(covers()).toHaveLength(2);
		expect(c.dataset.coverState).toBe("incoming");
	});

	test("promotes the loaded incoming cover before starting a new request during a crossfade", () => {
		vi.useFakeTimers();
		const { controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		const a = covers()[0];
		a.dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		const b = covers()[1];
		b.dispatchEvent(new Event("load"));

		controller.setCover("https://example.com/c.jpg");
		const [active, c] = covers();

		expect(a.isConnected).toBe(false);
		expect(active).toBe(b);
		expect(b.dataset.coverState).toBe("active");
		expect(c.dataset.coverState).toBe("pending");
		expect(covers()).toHaveLength(2);

		vi.advanceTimersByTime(COVER_CROSSFADE_DURATION_MS);
		expect(covers()).toEqual([b, c]);
		c.dispatchEvent(new Event("load"));
		expect(b.dataset.coverState).toBe("outgoing");
		expect(c.dataset.coverState).toBe("incoming");
	});

	test("returns to the same active URL by cancelling a different pending request without reloading", () => {
		const { controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		const a = covers()[0];
		a.dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		const b = covers()[1];

		controller.setCover("https://example.com/a.jpg");

		expect(covers()).toEqual([a]);
		expect(a.dataset.coverState).toBe("active");
		expect(b.isConnected).toBe(false);
	});

	test("uses the cover document window for the crossfade timer and rejects a cleared stale callback", () => {
		const iframe = document.createElement("iframe");
		document.body.append(iframe);
		const ownerWindow = iframe.contentWindow as Window;
		const layer = ownerWindow.document.createElement("div");
		ownerWindow.document.body.append(layer);
		let staleTimer: TimerHandler = () => undefined;
		const setTimeoutSpy = vi.spyOn(ownerWindow, "setTimeout").mockImplementation((handler) => {
			staleTimer = handler;
			return 77;
		});
		const clearTimeoutSpy = vi.spyOn(ownerWindow, "clearTimeout");
		const controller = new PipCoverTransitionController(layer);
		controller.setCover("https://example.com/a.jpg");
		const a = layer.querySelector<HTMLImageElement>(".pip-cover") as HTMLImageElement;
		a.dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		const b = layer.querySelectorAll<HTMLImageElement>(".pip-cover")[1];
		b.dispatchEvent(new Event("load"));

		expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), COVER_CROSSFADE_DURATION_MS);

		controller.setCover("https://example.com/c.jpg");
		const c = layer.querySelectorAll<HTMLImageElement>(".pip-cover")[1];
		expect(clearTimeoutSpy).toHaveBeenCalledWith(77);
		if (typeof staleTimer === "function") staleTimer();

		expect(Array.from(layer.querySelectorAll(".pip-cover"))).toEqual([b, c]);
		expect(b.dataset.coverState).toBe("active");
		expect(c.dataset.coverState).toBe("pending");
	});

	test("destroy removes listeners, timers, and planes and makes stale callbacks harmless", () => {
		const { availability, controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		const a = covers()[0];
		a.dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		const b = covers()[1];
		const removeListener = vi.spyOn(b, "removeEventListener");

		controller.destroy();

		expect(removeListener).toHaveBeenCalledWith("load", expect.any(Function));
		expect(removeListener).toHaveBeenCalledWith("error", expect.any(Function));
		expect(covers()).toEqual([]);
		expect(availability).toEqual([false, true, false]);

		b.dispatchEvent(new Event("load"));
		b.dispatchEvent(new Event("error"));
		controller.setCover("https://example.com/c.jpg");
		expect(covers()).toEqual([]);
		expect(availability).toEqual([false, true, false]);
	});

	test("destroy clears an in-flight crossfade timer", () => {
		vi.useFakeTimers();
		const { controller, covers } = createHarness();
		controller.setCover("https://example.com/a.jpg");
		covers()[0].dispatchEvent(new Event("load"));
		controller.setCover("https://example.com/b.jpg");
		covers()[1].dispatchEvent(new Event("load"));
		expect(vi.getTimerCount()).toBe(1);

		controller.destroy();

		expect(vi.getTimerCount()).toBe(0);
		expect(covers()).toEqual([]);
	});
});
