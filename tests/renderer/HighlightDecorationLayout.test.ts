import { afterEach, describe, expect, test, vi } from "vitest";
import { buildHighlightDecorationLayout, type HighlightRect } from "../../src/renderer/highlight/HighlightDecorationGeometry";
import { HighlightDecorationLayoutController, HighlightDecorationTrack } from "../../src/renderer/highlight/HighlightDecorationLayout";

const rect = (left: number, top: number, width: number, height: number): HighlightRect => ({
	left,
	right: left + width,
	top,
	bottom: top + height,
	width,
	height,
});

const domRect = (left: number, top: number, width: number, height: number): DOMRect =>
	({
		...rect(left, top, width, height),
		x: left,
		y: top,
		toJSON: () => ({}),
	}) as DOMRect;

const mockClientRects = (element: Element, ...rects: DOMRect[]) =>
	vi.spyOn(element, "getClientRects").mockReturnValue(rects as unknown as DOMRectList);

afterEach(() => {
	vi.restoreAllMocks();
});

describe("highlight decoration geometry", () => {
	test("groups glyph boxes into visual rows and allocates actual rendered widths", () => {
		const layout = buildHighlightDecorationLayout(
			rect(0, 0, 60, 50),
			[
				{ index: 0, rects: [rect(0, 0, 10, 20)], fontSizePx: 20 },
				{ index: 1, rects: [rect(10, 0, 50, 20)], fontSizePx: 24 },
				{ index: 2, rects: [rect(0, 30, 40, 20)], fontSizePx: 18 },
			],
			"ltr"
		);

		expect(layout.fragments).toEqual([
			{
				left: 0,
				top: 0,
				width: 60,
				height: 20,
				fontSizePx: 24,
				advanceStartPx: 0,
				advanceEndPx: 60,
			},
			{
				left: 0,
				top: 30,
				width: 40,
				height: 20,
				fontSizePx: 18,
				advanceStartPx: 60,
				advanceEndPx: 100,
			},
		]);
		expect(layout.pieceWidthsPx).toEqual([10, 50, 40]);
		expect(layout.totalAdvancePx).toBe(100);
	});

	test("orders RTL boxes from the right edge and splits gaps at their midpoint", () => {
		const layout = buildHighlightDecorationLayout(
			rect(10, 0, 100, 20),
			[
				{ index: 0, rects: [rect(80, 0, 30, 20)], fontSizePx: 20 },
				{ index: 1, rects: [rect(20, 0, 40, 20)], fontSizePx: 20 },
			],
			"rtl"
		);

		expect(layout.fragments[0]).toMatchObject({ left: 10, width: 90 });
		expect(layout.pieceWidthsPx).toEqual([40, 50]);
		expect(layout.direction).toBe("rtl");
	});
});

describe("HighlightDecorationTrack", () => {
	test("uses measured pixel widths for syllable progress without layout reads during animation", () => {
		const host = document.createElement("span");
		const first = document.createElement("span");
		const second = document.createElement("span");
		first.textContent = "안";
		second.textContent = "녕!";
		host.append(first, second);
		document.body.append(host);
		let firstProgress = 1;
		let secondProgress = 0;
		const track = new HighlightDecorationTrack({
			host,
			pieces: [
				{ element: first, getProgress: () => firstProgress },
				{ element: second, getProgress: () => secondProgress },
			],
		});
		const hostRect = vi.spyOn(host, "getBoundingClientRect").mockReturnValue(domRect(0, 0, 40, 20));
		const firstRects = mockClientRects(first, domRect(0, 0, 10, 20));
		const secondRects = mockClientRects(second, domRect(10, 0, 30, 20));

		track.measureAndApply();
		track.updateProgressFromPieces();

		expect(track.getProgress()).toBe(0.25);
		expect(host.style.getPropertyValue("--highlight-track-progress-ratio")).toBe("0.25");
		expect(
			track.decorationLayer
				.querySelector<HTMLElement>(".highlight-decoration-fragment")
				?.style.getPropertyValue("--highlight-fragment-progress-ratio")
		).toBe("0.25");
		hostRect.mockClear();
		firstRects.mockClear();
		secondRects.mockClear();
		firstProgress = 0.5;
		secondProgress = 0.75;
		for (let frame = 0; frame < 300; frame += 1) {
			track.updateProgressFromPieces();
		}
		expect(hostRect).not.toHaveBeenCalled();
		expect(firstRects).not.toHaveBeenCalled();
		expect(secondRects).not.toHaveBeenCalled();
	});

	test("fills measured rows sequentially in reading order", () => {
		const host = document.createElement("span");
		const firstRow = document.createElement("span");
		const secondRow = document.createElement("span");
		firstRow.textContent = "first";
		secondRow.textContent = "second";
		host.append(firstRow, secondRow);
		document.body.append(host);
		const track = new HighlightDecorationTrack({ host, pieces: [{ element: firstRow }, { element: secondRow }] });
		vi.spyOn(host, "getBoundingClientRect").mockReturnValue(domRect(0, 0, 60, 50));
		mockClientRects(firstRow, domRect(0, 0, 60, 20));
		mockClientRects(secondRow, domRect(0, 30, 40, 20));

		track.measureAndApply();
		track.setProgress(0.75);

		const fragments = track.decorationLayer.querySelectorAll<HTMLElement>(".highlight-decoration-fragment");
		expect(fragments).toHaveLength(2);
		expect(fragments[0].style.getPropertyValue("--highlight-fragment-progress-ratio")).toBe("1");
		expect(Number(fragments[1].style.getPropertyValue("--highlight-fragment-progress-ratio"))).toBeCloseTo(0.375);
	});

	test("uses text range fragments when one line token wraps internally", () => {
		const host = document.createElement("span");
		const glyph = document.createElement("span");
		glyph.textContent = "긴가사가여러줄로접힙니다";
		host.append(glyph);
		document.body.append(host);
		const track = new HighlightDecorationTrack({ host, pieces: [{ element: glyph }] });
		vi.spyOn(host, "getBoundingClientRect").mockReturnValue(domRect(0, 0, 60, 50));
		mockClientRects(glyph, domRect(0, 0, 60, 50));
		vi.spyOn(document, "createRange").mockReturnValue({
			selectNodeContents: vi.fn(),
			getClientRects: () => [domRect(0, 0, 60, 20), domRect(0, 30, 40, 20)] as unknown as DOMRectList,
			detach: vi.fn(),
		} as unknown as Range);

		track.measureAndApply();

		expect(track.decorationLayer.querySelectorAll(".highlight-decoration-fragment")).toHaveLength(2);
		expect(track.getLayout()?.fragments.map((fragment) => fragment.width)).toEqual([60, 40]);
	});

	test("keeps the decoration layer non-interactive and anchors RTL fragments on the right", () => {
		const host = document.createElement("span");
		const glyph = document.createElement("span");
		host.dir = "rtl";
		glyph.textContent = "שלום";
		host.append(glyph);
		document.body.append(host);
		const track = new HighlightDecorationTrack({ host, pieces: [{ element: glyph }] });
		vi.spyOn(host, "getBoundingClientRect").mockReturnValue(domRect(0, 0, 40, 20));
		mockClientRects(glyph, domRect(0, 0, 40, 20));

		track.measureAndApply();

		const fragment = track.decorationLayer.querySelector<HTMLElement>(".highlight-decoration-fragment");
		expect(track.decorationLayer.getAttribute("aria-hidden")).toBe("true");
		expect(track.decorationLayer.style.pointerEvents).toBe("none");
		expect(fragment?.dataset.direction).toBe("rtl");
		expect(fragment?.style.transformOrigin).toBe("right center");
	});
});

describe("HighlightDecorationLayoutController", () => {
	test("coalesces invalidations into one frame and calls the layout hook after writes", () => {
		const root = document.createElement("div");
		const host = document.createElement("span");
		const glyph = document.createElement("span");
		glyph.textContent = "layout";
		host.append(glyph);
		root.append(host);
		document.body.append(root);
		const track = new HighlightDecorationTrack({ host, pieces: [{ element: glyph }] });
		vi.spyOn(host, "getBoundingClientRect").mockReturnValue(domRect(0, 0, 40, 20));
		mockClientRects(glyph, domRect(0, 0, 40, 20));
		let frameCallback: FrameRequestCallback | undefined;
		const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			frameCallback = callback;
			return 7;
		});
		const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
		const onLayout = vi.fn();
		const controller = new HighlightDecorationLayoutController(root, [track], { onLayout });

		controller.start();
		controller.invalidate();
		controller.invalidate();

		expect(requestFrame).toHaveBeenCalledOnce();
		frameCallback?.(0);
		expect(onLayout).toHaveBeenCalledOnce();
		expect(root.classList.contains("highlight-layout-measuring")).toBe(false);
		expect(host.dataset.highlightLayoutReady).toBe("true");

		controller.invalidate();
		expect(host.dataset.highlightLayoutReady).toBe("false");
		controller.destroy();
		expect(cancelFrame).toHaveBeenCalledWith(7);
	});

	test("isolates a failed track measurement and still runs the viewport layout hook", () => {
		const root = document.createElement("div");
		const failedHost = document.createElement("span");
		const healthyHost = document.createElement("span");
		const failed = new HighlightDecorationTrack({ host: failedHost, pieces: [] });
		const healthy = new HighlightDecorationTrack({ host: healthyHost, pieces: [] });
		root.append(failedHost, healthyHost);
		document.body.append(root);
		const failure = new Error("measurement failed");
		vi.spyOn(failed, "readLayout").mockImplementation(() => {
			throw failure;
		});
		const healthyLayout = vi.spyOn(healthy, "readLayout");
		const onLayout = vi.fn();
		const onError = vi.fn();
		const controller = new HighlightDecorationLayoutController(root, [failed, healthy], { onLayout, onError });

		controller.flush();

		expect(healthyLayout).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledWith(failure);
		expect(onLayout).toHaveBeenCalledOnce();
		expect(root.classList.contains("highlight-layout-measuring")).toBe(false);
		controller.destroy();
	});

	test("observes viewport and font changes and releases every listener on destroy", () => {
		const root = document.createElement("div");
		const originalResizeObserver = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
		const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
		const observe = vi.fn();
		const disconnect = vi.fn();
		let resizeCallback: ResizeObserverCallback | undefined;
		class TestResizeObserver {
			public constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback;
			}

			public observe = observe;
			public disconnect = disconnect;
		}
		const listeners = new Map<string, EventListener>();
		const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
			if (typeof listener === "function") listeners.set(type, listener);
		});
		const removeEventListener = vi.fn((type: string) => listeners.delete(type));
		const fontSet = {
			ready: new Promise<FontFaceSet>(() => {}),
			addEventListener,
			removeEventListener,
		} as unknown as FontFaceSet;
		Object.defineProperty(window, "ResizeObserver", {
			configurable: true,
			value: TestResizeObserver as unknown as typeof ResizeObserver,
		});
		Object.defineProperty(document, "fonts", { configurable: true, value: fontSet });
		let frameCallback: FrameRequestCallback | undefined;
		const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			frameCallback = callback;
			return requestFrame.mock.calls.length;
		});
		const controller = new HighlightDecorationLayoutController(root, []);
		try {
			controller.start();
			expect(observe).toHaveBeenCalledWith(root);
			expect(addEventListener).toHaveBeenCalledWith("loadingdone", expect.any(Function));
			expect(addEventListener).toHaveBeenCalledWith("loadingerror", expect.any(Function));
			resizeCallback?.([], {} as ResizeObserver);
			expect(requestFrame).toHaveBeenCalledOnce();
			frameCallback?.(0);
			listeners.get("loadingdone")?.(new Event("loadingdone"));
			expect(requestFrame).toHaveBeenCalledTimes(2);

			controller.destroy();

			expect(disconnect).toHaveBeenCalledOnce();
			expect(removeEventListener).toHaveBeenCalledWith("loadingdone", expect.any(Function));
			expect(removeEventListener).toHaveBeenCalledWith("loadingerror", expect.any(Function));
		} finally {
			controller.destroy();
			if (originalResizeObserver) Object.defineProperty(window, "ResizeObserver", originalResizeObserver);
			else Reflect.deleteProperty(window, "ResizeObserver");
			if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
			else Reflect.deleteProperty(document, "fonts");
		}
	});
});
