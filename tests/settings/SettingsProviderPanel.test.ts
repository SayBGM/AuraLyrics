import { describe, expect, test, vi } from "vitest";
import type { LyricsProvider } from "../../src/lyrics/types";
import { SettingsControlFactory } from "../../src/settings/SettingsControlFactory";
import { SettingsProviderPanel } from "../../src/settings/SettingsProviderPanel";
import { SettingsStore } from "../../src/settings/SettingsStore";

class MemoryStorage {
	private readonly values = new Map<string, string>();
	public get(key: string) {
		return this.values.get(key) ?? null;
	}
	public set(key: string, value: string) {
		this.values.set(key, value);
		return true;
	}
}

const providers: LyricsProvider[] = ["spotify", "lrclib", "musixmatch"].map((id) => ({
	id: id as LyricsProvider["id"],
	supports: () => true,
	fetch: async () => ({ ok: false as const, reason: "no-lyrics" as const }),
}));

describe("SettingsProviderPanel", () => {
	test("keeps token status and input nodes live while an async token request resolves", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const controls = new SettingsControlFactory(document, () => store.commit());
		let resolveToken: (value: string | undefined) => void = () => undefined;
		const token = new Promise<string | undefined>((resolve) => {
			resolveToken = resolve;
		});
		const panel = new SettingsProviderPanel(document, store, providers, controls, {
			onRefreshMusixmatchToken: () => token,
			onScheduleRefresh: vi.fn(),
		});
		const root = document.createElement("div");
		root.append(...panel.render(store.get()));
		document.body.append(root);
		const input = root.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');
		const status = root.querySelector<HTMLElement>('[role="status"]');
		if (!input || !status) {
			throw new Error("Provider token controls were not rendered.");
		}
		input.value = "abcdef";
		input.dispatchEvent(new Event("change", { bubbles: true }));
		input.focus();
		input.setSelectionRange(2, 4);

		root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();
		expect(status.textContent).toContain("Requesting");
		resolveToken("generated-token");
		await token;
		await Promise.resolve();

		expect(store.get().providers.musixmatchToken).toBe("generated-token");
		expect(root.querySelector('[role="status"]')).toBe(status);
		expect(root.querySelector('[data-control-id="musixmatch-token"]')).toBe(input);
		expect(input.value).toBe("generated-token");
		expect(input.selectionStart).toBe(2);
		expect(input.selectionEnd).toBe(4);
		expect(status.textContent).toContain("updated");
	});
});
