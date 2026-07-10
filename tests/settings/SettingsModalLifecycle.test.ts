import { afterEach, describe, expect, test, vi } from "vitest";
import { SettingsModalLifecycle } from "../../src/settings/SettingsModalLifecycle";

class FakeMutationObserver {
	public readonly disconnect = vi.fn();
	public readonly observe = vi.fn();
	public constructor(private readonly callback: MutationCallback) {}
	public trigger(): void {
		this.callback([], this as unknown as MutationObserver);
	}
}

afterEach(() => {
	document.body.replaceChildren();
	document.body.className = "";
	vi.unstubAllGlobals();
});

describe("SettingsModalLifecycle", () => {
	test("traps Tab in the owned modal, closes on Escape, and restores the prior focus", () => {
		vi.stubGlobal("MutationObserver", FakeMutationObserver);
		const trigger = document.createElement("button");
		const modal = document.createElement("div");
		modal.className = "main-trackCreditsModal-container";
		const container = document.createElement("div");
		const first = document.createElement("button");
		const last = document.createElement("button");
		container.append(first, last);
		modal.append(container);
		document.body.append(trigger);
		trigger.focus();
		const requestClose = vi.fn();
		const lifecycle = new SettingsModalLifecycle(window, document);

		lifecycle.prepare(container, { onAttached: vi.fn(), onDetached: vi.fn(), onRequestClose: requestClose });
		document.body.append(modal);
		lifecycle.start();
		last.focus();
		modal.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
		expect(document.activeElement).toBe(first);

		modal.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
		expect(requestClose).toHaveBeenCalledOnce();

		lifecycle.destroy(() => modal.remove());
		expect(document.activeElement).toBe(trigger);
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);
	});

	test("captures and restores focused panel controls and text selection", () => {
		vi.stubGlobal("MutationObserver", FakeMutationObserver);
		const scroller = document.createElement("div");
		const input = document.createElement("input");
		input.dataset.controlId = "musixmatch-token";
		input.value = "abcdef";
		scroller.append(input);
		document.body.append(scroller);
		input.focus();
		input.setSelectionRange(2, 5);
		scroller.scrollTop = 48;
		const lifecycle = new SettingsModalLifecycle(window, document);

		const state = lifecycle.capturePanelState(scroller);
		const replacement = input.cloneNode(true) as HTMLInputElement;
		input.replaceWith(replacement);
		lifecycle.restorePanelState(scroller, state, vi.fn());

		expect(scroller.scrollTop).toBe(48);
		expect(document.activeElement).toBe(replacement);
		expect(replacement.selectionStart).toBe(2);
		expect(replacement.selectionEnd).toBe(5);
	});
});
