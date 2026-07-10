import { describe, expect, test, vi } from "vitest";
import { SettingsModalShell } from "../../src/settings/SettingsModalShell";

describe("SettingsModalShell", () => {
	test("builds the stable tab shell in its owner document and delegates keyboard activation", () => {
		const ownerDocument = document.implementation.createHTMLDocument("settings");
		const container = ownerDocument.createElement("div");
		const activate = vi.fn();
		const shell = new SettingsModalShell(ownerDocument, {
			language: () => "en",
			onActivate: activate,
		});

		shell.mount(container, "general");
		const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		expect(tabs.map((tab) => tab.dataset.section)).toEqual(["general", "lyrics", "appearance", "motion", "providers", "advanced"]);
		expect(tabs[0].ownerDocument).toBe(ownerDocument);
		expect(tabs[0].querySelector("svg")?.ownerDocument).toBe(ownerDocument);

		tabs[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
		expect(activate).toHaveBeenCalledWith("lyrics", true);

		shell.setCompact(true);
		expect(shell.navigation.getAttribute("aria-orientation")).toBe("horizontal");
		tabs[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
		expect(activate).toHaveBeenLastCalledWith("lyrics", true);
	});

	test("syncs active tab aria state and translated navigation text without rebuilding tabs", () => {
		const container = document.createElement("div");
		let language: "en" | "ko" = "en";
		const shell = new SettingsModalShell(document, { language: () => language, onActivate: vi.fn() });
		shell.mount(container, "general");
		const general = container.querySelector<HTMLButtonElement>('[data-section="general"]');
		const lyrics = container.querySelector<HTMLButtonElement>('[data-section="lyrics"]');

		shell.syncActiveSection("lyrics");
		expect(general?.getAttribute("aria-selected")).toBe("false");
		expect(lyrics?.getAttribute("aria-selected")).toBe("true");
		expect(lyrics?.getAttribute("aria-controls")).toBe("aura-settings-panel-lyrics");

		language = "ko";
		shell.refreshText();
		expect(shell.navigation.getAttribute("aria-label")).toBe("설정 탐색");
		expect(container.querySelector('[data-section="appearance"]')?.textContent).toContain("화면");
		expect(container.querySelector('[data-section="general"]')).toBe(general);
	});
});
