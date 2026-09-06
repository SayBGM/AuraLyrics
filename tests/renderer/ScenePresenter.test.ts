import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AnimatedGroup } from "../../src/renderer/AnimatedGroup";
import type { HighlightDecorationLayoutController } from "../../src/renderer/highlight/HighlightDecorationLayout";
import type { InterludeFrameController } from "../../src/renderer/InterludeFrameController";
import type { LyricsViewportController } from "../../src/renderer/LyricsViewportController";
import { ScenePresenter, type SceneResources } from "../../src/renderer/ScenePresenter";
import { SCENE_TRANSITION_DURATION_MS } from "../../src/renderer/SceneTransitionController";

type SceneSpies = {
	resources: SceneResources;
	element: HTMLDivElement;
	pause: ReturnType<typeof vi.fn>;
	destroyViewport: ReturnType<typeof vi.fn>;
	updateViewport: ReturnType<typeof vi.fn>;
	destroyInterludeFrame: ReturnType<typeof vi.fn>;
	updateInterludeFrame: ReturnType<typeof vi.fn>;
	destroyHighlightLayout: ReturnType<typeof vi.fn>;
	group: AnimatedGroup;
};

const makeScene = (name: string): SceneSpies => {
	const element = document.createElement("div");
	element.dataset.scene = name;
	const pause = vi.fn();
	const destroyViewport = vi.fn();
	const updateViewport = vi.fn();
	const destroyInterludeFrame = vi.fn();
	const updateInterludeFrame = vi.fn();
	const destroyHighlightLayout = vi.fn();
	const group = { startTime: 0, endTime: 1, animate: vi.fn() } as unknown as AnimatedGroup;
	const resources: SceneResources = {
		scene: element,
		container: element,
		groups: [group],
		viewportController: { pause, destroy: destroyViewport, update: updateViewport } as unknown as LyricsViewportController,
		interludeFrameController: { destroy: destroyInterludeFrame, update: updateInterludeFrame } as unknown as InterludeFrameController,
		highlightLayoutController: { destroy: destroyHighlightLayout } as unknown as HighlightDecorationLayoutController,
		cleaned: false,
	};
	return {
		resources,
		element,
		pause,
		destroyViewport,
		updateViewport,
		destroyInterludeFrame,
		updateInterludeFrame,
		destroyHighlightLayout,
		group,
	};
};

describe("ScenePresenter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.body.replaceChildren();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		document.body.replaceChildren();
	});

	test("tracks the presented scene and clears it on destroy", () => {
		const root = document.createElement("div");
		document.body.append(root);
		const presenter = new ScenePresenter();
		const first = makeScene("first");

		presenter.present(root, first.resources, undefined, false, false);

		expect(presenter.current).toBe(first.resources);
		expect(Array.from(root.children)).toEqual([first.element]);

		presenter.destroy();

		expect(presenter.current).toBeUndefined();
		expect(first.resources.cleaned).toBe(true);
	});

	test("retires the previous scene before releasing it once the transition settles", async () => {
		const root = document.createElement("div");
		document.body.append(root);
		const presenter = new ScenePresenter();
		const first = makeScene("first");
		const second = makeScene("second");

		presenter.present(root, first.resources, undefined, false, false);
		const handle = presenter.present(root, second.resources, { direction: "next", animate: true }, true, false);

		// Retired, not released: controllers are already detached but the DOM survives the fade.
		expect(first.resources.cleaned).toBe(false);
		expect(first.pause).toHaveBeenCalledTimes(1);
		expect(first.destroyInterludeFrame).toHaveBeenCalledTimes(1);
		expect(first.destroyHighlightLayout).toHaveBeenCalledTimes(1);
		expect(first.resources.interludeFrameController).toBeUndefined();
		expect(first.resources.highlightLayoutController).toBeUndefined();
		expect(first.destroyViewport).not.toHaveBeenCalled();
		expect(first.element.isConnected).toBe(true);
		// The incoming scene's interlude frame is re-applied as soon as the old one lets go.
		expect(second.updateInterludeFrame).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(SCENE_TRANSITION_DURATION_MS);
		await handle.settled;
		await Promise.resolve();

		expect(first.resources.cleaned).toBe(true);
		expect(first.destroyViewport).toHaveBeenCalledTimes(1);
		expect(first.element.isConnected).toBe(false);
		expect(second.updateInterludeFrame).toHaveBeenCalledTimes(2);
		expect(presenter.current).toBe(second.resources);
	});

	test("cleans up an un-animated replacement immediately", () => {
		const root = document.createElement("div");
		document.body.append(root);
		const presenter = new ScenePresenter();
		const first = makeScene("first");
		const second = makeScene("second");

		presenter.present(root, first.resources, undefined, false, false);
		presenter.present(root, second.resources, { direction: "next", animate: false }, false, false);

		expect(first.pause).toHaveBeenCalledTimes(1);
		expect(first.resources.cleaned).toBe(true);
		expect(first.destroyViewport).toHaveBeenCalledTimes(1);
	});

	test("cleanup is idempotent across settle, a later present, and destroy", async () => {
		const root = document.createElement("div");
		document.body.append(root);
		const presenter = new ScenePresenter();
		const first = makeScene("first");
		const second = makeScene("second");

		presenter.present(root, first.resources, undefined, false, false);
		const handle = presenter.present(root, second.resources, { direction: "next", animate: true }, true, false);
		vi.advanceTimersByTime(SCENE_TRANSITION_DURATION_MS);
		await handle.settled;
		await Promise.resolve();

		presenter.destroy();
		presenter.destroy();

		expect(first.destroyViewport).toHaveBeenCalledTimes(1);
		expect(first.destroyInterludeFrame).toHaveBeenCalledTimes(1);
		expect(first.destroyHighlightLayout).toHaveBeenCalledTimes(1);
		expect(second.destroyViewport).toHaveBeenCalledTimes(1);
		expect(second.resources.cleaned).toBe(true);
	});

	test("destroy while a transition is pending releases both scenes and resets the root", () => {
		const root = document.createElement("div");
		const host = document.createElement("div");
		host.append(root);
		document.body.append(host);
		root.classList.add("interlude-active", "interlude-style-frame");
		host.classList.add("interlude-frame-active");
		const presenter = new ScenePresenter();
		const first = makeScene("first");
		const second = makeScene("second");

		presenter.present(root, first.resources, undefined, false, false);
		presenter.present(root, second.resources, { direction: "next", animate: true }, true, false);
		presenter.destroy();

		expect(first.resources.cleaned).toBe(true);
		expect(second.resources.cleaned).toBe(true);
		expect(first.destroyViewport).toHaveBeenCalledTimes(1);
		expect(second.destroyViewport).toHaveBeenCalledTimes(1);
		expect(root.children.length).toBe(0);
		expect(root.className).toBe("");
		expect(host.className).toBe("");
		expect(presenter.current).toBeUndefined();
	});

	test("presenting into a different root tears the previous host down first", () => {
		const rootA = document.createElement("div");
		const rootB = document.createElement("div");
		document.body.append(rootA, rootB);
		const presenter = new ScenePresenter();
		const first = makeScene("first");
		const second = makeScene("second");

		presenter.present(rootA, first.resources, undefined, false, false);
		presenter.present(rootB, second.resources, undefined, false, false);

		expect(first.resources.cleaned).toBe(true);
		expect(rootA.children.length).toBe(0);
		expect(Array.from(rootB.children)).toEqual([second.element]);
	});

	test("toggles album-art-mode on the root and its parent, and clears it on destroy", () => {
		const host = document.createElement("div");
		const root = document.createElement("div");
		host.append(root);
		document.body.append(host);
		const presenter = new ScenePresenter();
		const art = makeScene("album-art");

		presenter.present(root, art.resources, undefined, false, true);

		expect(root.classList.contains("album-art-mode")).toBe(true);
		expect(host.classList.contains("album-art-mode")).toBe(true);

		presenter.destroy();

		expect(root.classList.contains("album-art-mode")).toBe(false);
		expect(host.classList.contains("album-art-mode")).toBe(false);
	});

	test("scheduleLayoutUpdate runs one deferred viewport pass and finishLayoutUpdate takes it over", () => {
		const root = document.createElement("div");
		document.body.append(root);
		const presenter = new ScenePresenter();
		const first = makeScene("first");
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

		presenter.present(root, first.resources, undefined, false, false);
		presenter.scheduleLayoutUpdate(first.resources);
		expect(first.updateViewport).not.toHaveBeenCalled();

		presenter.finishLayoutUpdate(first.resources);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(first.updateViewport).toHaveBeenCalledTimes(1);
		expect(first.resources.layoutFrame).toBeUndefined();

		// A second call with nothing pending is a no-op.
		presenter.finishLayoutUpdate(first.resources);
		expect(first.updateViewport).toHaveBeenCalledTimes(1);
	});

	test("a deferred layout pass is dropped when its scene is no longer current", () => {
		const root = document.createElement("div");
		document.body.append(root);
		const presenter = new ScenePresenter();
		const first = makeScene("first");
		const second = makeScene("second");
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

		presenter.present(root, first.resources, undefined, false, false);
		presenter.scheduleLayoutUpdate(first.resources);
		presenter.present(root, second.resources, undefined, false, false);
		for (const frame of frames) {
			frame(0);
		}

		expect(first.updateViewport).not.toHaveBeenCalled();
	});
});
