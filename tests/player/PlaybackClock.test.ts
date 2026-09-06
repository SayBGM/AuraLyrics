import { describe, expect, test, vi } from "vitest";
import { PlaybackClock } from "../../src/player/PlaybackClock";

type FakeWindow = Window & {
	performance: { now: () => number };
	requestAnimationFrame: (callback: FrameRequestCallback) => number;
	cancelAnimationFrame: (handle: number) => void;
};

const createFakeWindow = () => {
	let now = 0;
	let nextHandle = 1;
	const pending = new Map<number, FrameRequestCallback>();
	const cancelled = new Set<number>();
	const ownerWindow = {
		performance: { now: () => now },
		requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
			const handle = nextHandle++;
			pending.set(handle, callback);
			return handle;
		}),
		cancelAnimationFrame: vi.fn((handle: number) => {
			pending.delete(handle);
			cancelled.add(handle);
		}),
	} as unknown as FakeWindow;
	return {
		ownerWindow,
		setNow: (value: number) => {
			now = value;
		},
		// Runs whichever rAF callback is currently pending (there should be at most one).
		flushFrame: (value: number) => {
			now = value;
			const [[handle, callback]] = pending;
			pending.delete(handle);
			callback(value);
		},
		pendingCount: () => pending.size,
		wasCancelled: (handle: number) => cancelled.has(handle),
	};
};

describe("PlaybackClock", () => {
	test("start schedules a frame and does nothing if already running", () => {
		const { ownerWindow, pendingCount } = createFakeWindow();
		const onTick = vi.fn();
		const clock = new PlaybackClock(ownerWindow, onTick);

		clock.start();
		clock.start();

		expect(ownerWindow.requestAnimationFrame).toHaveBeenCalledOnce();
		expect(pendingCount()).toBe(1);
	});

	test("calls onTick with the delta time in seconds between frames", () => {
		const { ownerWindow, setNow, flushFrame } = createFakeWindow();
		const onTick = vi.fn();
		const clock = new PlaybackClock(ownerWindow, onTick);

		setNow(1000);
		clock.start();
		flushFrame(1080);

		expect(onTick).toHaveBeenCalledWith(0.08);
	});

	test("clamps delta time to 0.1 seconds even after a long stall", () => {
		const { ownerWindow, setNow, flushFrame } = createFakeWindow();
		const onTick = vi.fn();
		const clock = new PlaybackClock(ownerWindow, onTick);

		setNow(0);
		clock.start();
		flushFrame(5000);

		expect(onTick).toHaveBeenCalledWith(0.1);
	});

	test("falls back to 1/60 when the delta time would be zero (e.g. two frames at the same timestamp)", () => {
		const { ownerWindow, setNow, flushFrame } = createFakeWindow();
		const onTick = vi.fn();
		const clock = new PlaybackClock(ownerWindow, onTick);

		setNow(1000);
		clock.start();
		flushFrame(1000);

		expect(onTick).toHaveBeenCalledWith(1 / 60);
	});

	test("clamps a negative delta time (clock skew) to zero rather than going negative, falling back to 1/60", () => {
		const { ownerWindow, setNow, flushFrame } = createFakeWindow();
		const onTick = vi.fn();
		const clock = new PlaybackClock(ownerWindow, onTick);

		setNow(1000);
		clock.start();
		flushFrame(900);

		expect(onTick).toHaveBeenCalledWith(1 / 60);
	});

	test("reschedules another frame after each tick while running", () => {
		const { ownerWindow, setNow, flushFrame } = createFakeWindow();
		const clock = new PlaybackClock(ownerWindow, vi.fn());

		setNow(0);
		clock.start();
		flushFrame(16);

		expect(ownerWindow.requestAnimationFrame).toHaveBeenCalledTimes(2);
	});

	test("stop cancels the pending animation frame and prevents further ticks", () => {
		const { ownerWindow, pendingCount } = createFakeWindow();
		const onTick = vi.fn();
		const clock = new PlaybackClock(ownerWindow, onTick);

		clock.start();
		clock.stop();

		expect(ownerWindow.cancelAnimationFrame).toHaveBeenCalledOnce();
		expect(pendingCount()).toBe(0);
	});

	test("stop before start is a no-op", () => {
		const { ownerWindow } = createFakeWindow();
		const clock = new PlaybackClock(ownerWindow, vi.fn());

		clock.stop();

		expect(ownerWindow.cancelAnimationFrame).not.toHaveBeenCalled();
	});

	test("a frame callback fired after stop() does not call onTick or reschedule", () => {
		const { ownerWindow, setNow } = createFakeWindow();
		const onTick = vi.fn();
		const clock = new PlaybackClock(ownerWindow, onTick);

		setNow(0);
		clock.start();
		const scheduledCallback = (ownerWindow.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls[0][0] as FrameRequestCallback;
		clock.stop();
		scheduledCallback(16);

		expect(onTick).not.toHaveBeenCalled();
		expect(ownerWindow.requestAnimationFrame).toHaveBeenCalledOnce();
	});
});
