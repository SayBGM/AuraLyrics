import { describe, expect, test, vi } from "vitest";
import { InterludeView } from "../../src/renderer/components/Interlude";
import { InterludeFrameController, interludeFramePresentation } from "../../src/renderer/InterludeFrameController";
import type { InterludeStyle } from "../../src/settings/SettingsStore";

const activeInterlude = (style: InterludeStyle): InterludeView => {
	const interlude = new InterludeView({ type: "interlude", startTime: 0, endTime: 10 }, style, "en");
	interlude.animate(5);
	return interlude;
};

const frameHost = (): { pipRoot: HTMLElement; root: HTMLElement } => {
	const pipRoot = document.createElement("div");
	const root = document.createElement("main");
	pipRoot.append(root);
	Object.defineProperty(pipRoot, "clientWidth", { configurable: true, value: 300 });
	Object.defineProperty(pipRoot, "clientHeight", { configurable: true, value: 100 });
	Object.defineProperty(root, "clientWidth", { configurable: true, value: 300 });
	Object.defineProperty(root, "clientHeight", { configurable: true, value: 100 });
	return { pipRoot, root };
};

describe("interlude frame presentation model", () => {
	test("maps active frame progress to PiP frame CSS properties", () => {
		const presentation = interludeFramePresentation("frame", 0.5, { width: 300, height: 100, frameSize: 6 });

		expect(presentation.frameActive).toBe(true);
		expect(presentation.properties).toEqual({
			"--pip-interlude-progress": "0.5",
			"--pip-interlude-progress-percent": "50%",
			"--pip-frame-progress-top": "1",
			"--pip-frame-progress-right": "1",
			"--pip-frame-progress-bottom": "0",
			"--pip-frame-progress-left": "0",
		});
	});

	test("keeps non-frame interludes out of the PiP frame", () => {
		expect(interludeFramePresentation("wave", 0.5, { width: 300, height: 100, frameSize: 6 })).toEqual({
			frameActive: false,
			properties: {},
		});
	});
});

describe("InterludeFrameController", () => {
	test.each(["dots", "wave"] as const)("never measures or touches the hosts for the %s style", (style) => {
		const { pipRoot, root } = frameHost();
		const container = document.createElement("div");
		const measure = vi.spyOn(pipRoot, "getBoundingClientRect");
		const rootMeasure = vi.spyOn(root, "getBoundingClientRect");
		const controller = new InterludeFrameController(root, container, style, [activeInterlude(style)]);

		controller.update();
		controller.update();

		expect(measure).not.toHaveBeenCalled();
		expect(rootMeasure).not.toHaveBeenCalled();
		expect(pipRoot.classList.contains("interlude-active")).toBe(false);
		expect(container.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("");
	});

	test("measures each frame host once and no-ops while the progress is unchanged", () => {
		const { pipRoot, root } = frameHost();
		const container = document.createElement("div");
		const interlude = activeInterlude("frame");
		const measure = vi.spyOn(pipRoot, "getBoundingClientRect");
		const controller = new InterludeFrameController(root, container, "frame", [interlude]);

		controller.update();

		expect(measure).toHaveBeenCalledTimes(1);
		expect(pipRoot.classList.contains("interlude-frame-active")).toBe(true);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("0.5");

		const toggle = vi.spyOn(pipRoot.classList, "toggle");
		controller.update();

		expect(measure).toHaveBeenCalledTimes(1);
		expect(toggle).not.toHaveBeenCalled();

		interlude.animate(7.5);
		controller.update();

		expect(measure).toHaveBeenCalledTimes(1);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("0.75");
	});
});
