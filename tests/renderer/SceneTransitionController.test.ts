import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SCENE_TRANSITION_DURATION_MS, SceneTransitionController } from "../../src/renderer/SceneTransitionController";
import { THEME_CSS_PROPERTIES } from "../../src/shared/themeCssProperties";

const EXPECTED_THEME_CSS_PROPERTIES = [
	"--pip-accent-color",
	"--pip-accent-rgb",
	"--pip-background-color",
	"--pip-surface-tone",
	"--pip-foreground-color",
	"--pip-foreground-rgb",
	"--pip-synthetic-wake-color",
	"--pip-synthetic-wake-rgb",
	"--pip-muted-foreground-color",
	"--pip-muted-rgb",
	"--pip-glow-rgb",
	"--pip-scrim-rgb",
	"--pip-scrim-opacity",
] as const;

const scene = (name: string): HTMLElement => {
	const element = document.createElement("section");
	element.dataset.scene = name;
	element.textContent = name;
	return element;
};

const planes = (root: HTMLElement): { incoming: HTMLElement; outgoing: HTMLElement } => {
	const outgoing = root.querySelector<HTMLElement>('[data-scene-plane="outgoing"]');
	const incoming = root.querySelector<HTMLElement>('[data-scene-plane="incoming"]');
	if (!outgoing || !incoming) {
		throw new Error("Expected outgoing and incoming scene planes.");
	}
	return { incoming, outgoing };
};

describe("SceneTransitionController", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.body.replaceChildren();
	});

	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	test("presents the first scene, disabled animation, and missing direction immediately as one normal scene", async () => {
		const root = document.createElement("main");
		const controller = new SceneTransitionController(root);
		const first = scene("first");
		const second = scene("second");
		const third = scene("third");

		const firstHandle = controller.present(first, { animate: true, direction: "next" });
		expect(Array.from(root.children)).toEqual([first]);
		expect(await firstHandle.settled).toEqual({ generation: 1, completed: true });

		const secondHandle = controller.present(second, { animate: false, direction: "previous" });
		expect(Array.from(root.children)).toEqual([second]);
		expect(await secondHandle.settled).toEqual({ generation: 2, completed: true });

		const thirdHandle = controller.present(third, { animate: true });
		expect(Array.from(root.children)).toEqual([third]);
		expect(await thirdHandle.settled).toEqual({ generation: 3, completed: true });
		expect(root.querySelector("[data-scene-plane]")).toBeNull();
		expect(root.className).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each(["up", "next", "previous"] as const)("keeps outgoing and incoming planes together for a %s transition", (direction) => {
		const root = document.createElement("main");
		const controller = new SceneTransitionController(root);
		const first = scene("first");
		const second = scene("second");
		controller.present(first, { animate: false });

		controller.present(second, { animate: true, direction });

		const { incoming, outgoing } = planes(root);
		expect(Array.from(root.children)).toEqual([outgoing, incoming]);
		expect(Array.from(outgoing.children)).toEqual([first]);
		expect(Array.from(incoming.children)).toEqual([second]);
		expect(root.classList.contains(`scene-transition-${direction}`)).toBe(true);
		expect(root.classList.length).toBe(1);
		controller.destroy();
	});

	test("makes only the incoming plane interactive during an animated replacement", () => {
		const root = document.createElement("main");
		const controller = new SceneTransitionController(root);
		controller.present(scene("first"), { animate: false });

		controller.present(scene("second"), { animate: true, direction: "next" });

		const { incoming, outgoing } = planes(root);
		expect(outgoing.getAttribute("aria-hidden")).toBe("true");
		expect(outgoing.style.pointerEvents).toBe("none");
		expect(incoming.hasAttribute("aria-hidden")).toBe(false);
		expect(incoming.style.pointerEvents).not.toBe("none");
	});

	test("promotes the incoming scene exactly after the 720ms transition contract", async () => {
		const root = document.createElement("main");
		const controller = new SceneTransitionController(root);
		const first = scene("first");
		const second = scene("second");
		controller.present(first, { animate: false });
		const handle = controller.present(second, { animate: true, direction: "up" });
		let settlement: { generation: number; completed: boolean } | undefined;
		handle.settled.then((result) => {
			settlement = result;
		});

		await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS - 1);
		expect(settlement).toBeUndefined();
		expect(root.children).toHaveLength(2);

		await vi.advanceTimersByTimeAsync(1);
		expect(settlement).toEqual({ generation: 2, completed: true });
		expect(Array.from(root.children)).toEqual([second]);
		expect(root.querySelector("[data-scene-plane]")).toBeNull();
		expect(root.className).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	test("settles an interrupted generation false and prevents its stale cleanup from deleting the latest scene", async () => {
		const root = document.createElement("main");
		const controller = new SceneTransitionController(root);
		const first = scene("first");
		const second = scene("second");
		const third = scene("third");
		controller.present(first, { animate: false });
		const interrupted = controller.present(second, { animate: true, direction: "next" });

		await vi.advanceTimersByTimeAsync(300);
		const latest = controller.present(third, { animate: true, direction: "previous" });

		expect(await interrupted.settled).toEqual({ generation: 2, completed: false });
		let currentPlanes = planes(root);
		expect(Array.from(currentPlanes.outgoing.children)).toEqual([second]);
		expect(Array.from(currentPlanes.incoming.children)).toEqual([third]);
		expect(root.children).toHaveLength(2);

		await vi.advanceTimersByTimeAsync(420);
		currentPlanes = planes(root);
		expect(Array.from(currentPlanes.incoming.children)).toEqual([third]);
		expect(root.children).toHaveLength(2);

		await vi.advanceTimersByTimeAsync(300);
		expect(await latest.settled).toEqual({ generation: 3, completed: true });
		expect(Array.from(root.children)).toEqual([third]);
	});

	test("cancel settles the pending transition false and promotes its incoming scene without temporary state", async () => {
		const root = document.createElement("main");
		const controller = new SceneTransitionController(root);
		const first = scene("first");
		const second = scene("second");
		controller.present(first, { animate: false });
		const handle = controller.present(second, { animate: true, direction: "next" });

		controller.cancel();

		expect(await handle.settled).toEqual({ generation: 2, completed: false });
		expect(Array.from(root.children)).toEqual([second]);
		expect(root.querySelector("[data-scene-plane]")).toBeNull();
		expect(root.className).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	test("destroy settles the pending transition false, clears timers, and removes all scene DOM", async () => {
		const root = document.createElement("main");
		const controller = new SceneTransitionController(root);
		controller.present(scene("first"), { animate: false });
		const handle = controller.present(scene("second"), { animate: true, direction: "next" });

		controller.destroy();

		expect(await handle.settled).toEqual({ generation: 2, completed: false });
		expect(root.children).toHaveLength(0);
		expect(root.className).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	test("freezes all shared theme properties and surface tone on the outgoing plane until cleanup", async () => {
		expect(THEME_CSS_PROPERTIES).toEqual(EXPECTED_THEME_CSS_PROPERTIES);
		const host = document.createElement("div");
		const root = document.createElement("main");
		host.append(root);
		document.body.append(host);
		for (const [index, property] of THEME_CSS_PROPERTIES.entries()) {
			host.style.setProperty(property, `initial-${index}`);
		}
		host.dataset.surfaceTone = "light";
		const controller = new SceneTransitionController(root);
		controller.present(scene("first"), { animate: false });

		controller.present(scene("second"), { animate: true, direction: "up" });
		const { outgoing } = planes(root);
		for (const [index, property] of THEME_CSS_PROPERTIES.entries()) {
			expect(outgoing.style.getPropertyValue(property)).toBe(`initial-${index}`);
			host.style.setProperty(property, `updated-${index}`);
		}
		host.dataset.surfaceTone = "dark";

		for (const [index, property] of THEME_CSS_PROPERTIES.entries()) {
			expect(outgoing.style.getPropertyValue(property)).toBe(`initial-${index}`);
		}
		expect(outgoing.dataset.surfaceTone).toBe("light");

		await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);
		expect(outgoing.isConnected).toBe(false);
		expect(root.querySelector("[data-scene-plane]")).toBeNull();
	});
});
