import { describe, expect, test } from "vitest";
import { pipStyles } from "../../src/styles/pipStyles";

describe("pipStyles", () => {
	test("allows long lyric lines to wrap inside the PiP viewport", () => {
		expect(pipStyles).toContain("max-width: 80vw");
		expect(pipStyles).toContain("overflow-wrap: anywhere");
		expect(pipStyles).toContain("white-space: normal");
	});

	test("fills only interlude soundwave bars without filling the capsule background", () => {
		expect(pipStyles).toContain(".interlude-wave");
		expect(pipStyles).toContain(".interlude-wave-bar");
		expect(pipStyles).toContain("--bar-fill-ratio");
		expect(pipStyles).not.toContain(".interlude-wave::after");
		expect(pipStyles).not.toContain("width: var(--interlude-progress, 0%)");
	});
});
