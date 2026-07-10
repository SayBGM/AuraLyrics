import { describe, expect, test, vi } from "vitest";
import { SettingsControlFactory } from "../../src/settings/SettingsControlFactory";

describe("SettingsControlFactory", () => {
	test("creates controls in the supplied document and preserves range preview and commit semantics", () => {
		const ownerDocument = document.implementation.createHTMLDocument("settings");
		const commit = vi.fn(() => true);
		const preview = vi.fn();
		const controls = new SettingsControlFactory(ownerDocument, commit);
		const row = controls.range("font-scale", "Font scale", 1, 0.72, 1.5, 0.01, preview);
		ownerDocument.body.append(row);
		const input = row.querySelector<HTMLInputElement>('[data-control-id="font-scale"]');

		expect(row.ownerDocument).toBe(ownerDocument);
		expect(input?.ownerDocument).toBe(ownerDocument);
		if (!input) {
			throw new Error("Range input was not rendered.");
		}

		input.value = "1.2";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(preview).toHaveBeenCalledWith(1.2);
		expect(commit).not.toHaveBeenCalled();

		input.dispatchEvent(new Event("change", { bubbles: true }));
		expect(preview).toHaveBeenCalledOnce();
		expect(commit).toHaveBeenCalledOnce();
	});

	test("does not persist an untouched range and retains dirty state after a failed commit", () => {
		const commit = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
		const controls = new SettingsControlFactory(document, commit);
		const row = controls.range("dim", "Dim", 0.4, 0, 1, 0.05, vi.fn());
		const input = row.querySelector<HTMLInputElement>("input");
		if (!input) {
			throw new Error("Range input was not rendered.");
		}

		input.dispatchEvent(new Event("pointerup", { bubbles: true }));
		expect(commit).not.toHaveBeenCalled();
		input.value = "0.5";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
		input.dispatchEvent(new Event("pointerup", { bubbles: true }));

		expect(commit).toHaveBeenCalledTimes(2);
	});
});
