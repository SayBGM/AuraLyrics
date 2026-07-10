import { describe, expect, test, vi } from "vitest";
import { createStatusScene } from "../../src/renderer/components/StatusScene";

describe("createStatusScene", () => {
	test("creates the complete status card in the provided document", () => {
		const ownerDocument = document.implementation.createHTMLDocument("status");
		const onAction = vi.fn();

		const scene = createStatusScene(ownerDocument, {
			title: "Unable to load lyrics",
			detail: "Try again",
			tone: "danger",
			actionLabel: "Retry",
			onAction,
		});

		expect(scene.ownerDocument).toBe(ownerDocument);
		expect(scene.className).toBe("aura-lyrics status danger");
		expect(scene.querySelector("strong")?.textContent).toBe("Unable to load lyrics");
		expect(scene.querySelector("span")?.textContent).toBe("Try again");
		const button = scene.querySelector<HTMLButtonElement>("button");
		expect(button?.ownerDocument).toBe(ownerDocument);
		expect(button?.textContent).toBe("Retry");
		button?.click();
		expect(onAction).toHaveBeenCalledOnce();
	});
});
