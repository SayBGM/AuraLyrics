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

	test("treats one successful range commit as committing every previewed range", () => {
		const commit = vi.fn(() => true);
		const controls = new SettingsControlFactory(document, commit);
		const first = controls.range("dim", "Dim", 0.4, 0, 1, 0.05, vi.fn()).querySelector<HTMLInputElement>("input");
		const second = controls.range("saturation", "Saturation", 1, 0, 2, 0.05, vi.fn()).querySelector<HTMLInputElement>("input");
		if (!first || !second) {
			throw new Error("Range inputs were not rendered.");
		}

		first.value = "0.5";
		first.dispatchEvent(new Event("input", { bubbles: true }));
		second.value = "1.5";
		second.dispatchEvent(new Event("input", { bubbles: true }));
		second.dispatchEvent(new Event("change", { bubbles: true }));
		first.dispatchEvent(new Event("pointerup", { bubbles: true }));

		expect(commit).toHaveBeenCalledOnce();
	});

	test("clears preview revisions when a non-range control persists the same settings state", () => {
		const commit = vi.fn(() => true);
		const persistedToggle = vi.fn(() => true);
		const controls = new SettingsControlFactory(document, commit);
		const range = controls.range("dim", "Dim", 0.4, 0, 1, 0.05, vi.fn()).querySelector<HTMLInputElement>("input");
		const toggle = controls.toggle("motion", "Motion", true, persistedToggle).querySelector<HTMLInputElement>("input");
		if (!range || !toggle) {
			throw new Error("Settings controls were not rendered.");
		}

		range.value = "0.5";
		range.dispatchEvent(new Event("input", { bubbles: true }));
		toggle.checked = false;
		toggle.dispatchEvent(new Event("change", { bubbles: true }));
		range.dispatchEvent(new Event("pointerup", { bubbles: true }));

		expect(persistedToggle).toHaveBeenCalledOnce();
		expect(commit).not.toHaveBeenCalled();
	});

	test("keeps range previews dirty when a non-range persistence attempt fails", () => {
		const commit = vi.fn(() => true);
		const controls = new SettingsControlFactory(document, commit);
		const range = controls.range("dim", "Dim", 0.4, 0, 1, 0.05, vi.fn()).querySelector<HTMLInputElement>("input");
		const toggle = controls.toggle("motion", "Motion", true, () => false).querySelector<HTMLInputElement>("input");
		if (!range || !toggle) {
			throw new Error("Settings controls were not rendered.");
		}

		range.value = "0.5";
		range.dispatchEvent(new Event("input", { bubbles: true }));
		toggle.checked = false;
		toggle.dispatchEvent(new Event("change", { bubbles: true }));
		range.dispatchEvent(new Event("pointerup", { bubbles: true }));

		expect(commit).toHaveBeenCalledOnce();
	});
});
