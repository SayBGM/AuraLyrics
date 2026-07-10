import { describe, expect, test } from "vitest";
import { interludeFramePresentation } from "../../src/renderer/InterludeFrameController";

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
