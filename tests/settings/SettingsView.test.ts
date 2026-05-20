import { describe, expect, test, vi } from "vitest";
import type { LyricsProvider } from "../../src/lyrics/types";
import { SettingsStore } from "../../src/settings/SettingsStore";
import { SettingsView } from "../../src/settings/SettingsView";

class MemoryStorage {
	private readonly values = new Map<string, string>();

	public get(key: string) {
		return this.values.get(key) ?? null;
	}

	public set(key: string, value: string) {
		this.values.set(key, value);
	}
}

const providers: LyricsProvider[] = [
	{
		id: "spotify",
		supports: () => true,
		fetch: async () => ({ ok: false, reason: "no-lyrics" }),
	},
	{
		id: "lrclib",
		supports: () => true,
		fetch: async () => ({ ok: false, reason: "no-lyrics" }),
	},
	{
		id: "musixmatch",
		supports: () => true,
		fetch: async () => ({ ok: false, reason: "no-lyrics" }),
	},
	{
		id: "netease",
		supports: () => true,
		fetch: async () => ({ ok: false, reason: "no-lyrics" }),
	},
];

describe("SettingsView", () => {
	test("uses responsive modal styles without fixed horizontal overflow", () => {
		const store = new SettingsStore(new MemoryStorage());
		let content: HTMLElement | undefined;
		window.Spicetify = {
			PopupModal: {
				display: (options) => {
					content = options.content;
				},
			},
		} as typeof window.Spicetify;

		new SettingsView(store, providers, {
			onRefreshLyrics: vi.fn(),
			onClearCache: vi.fn(),
			onRefreshMusixmatchToken: vi.fn(),
		}).open();

		const css = content?.querySelector("style")?.textContent ?? "";
		expect(css).not.toContain("min-width: 520px");
		expect(css).toContain("overflow-x: hidden");
	});

	test("updates Musixmatch token from the generated Spicetify token", async () => {
		const store = new SettingsStore(new MemoryStorage());
		let content: HTMLElement | undefined;
		window.Spicetify = {
			PopupModal: {
				display: (options) => {
					content = options.content;
				},
			},
		} as typeof window.Spicetify;
		const view = new SettingsView(store, providers, {
			onRefreshLyrics: vi.fn(),
			onClearCache: vi.fn(),
			onRefreshMusixmatchToken: vi.fn(async () => "generated-token"),
		});
		view.open();

		const button = Array.from(content?.querySelectorAll("button") ?? []).find((item) => item.textContent === "Generate Musixmatch token");
		button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(store.get().providers.musixmatchToken).toBe("generated-token");
		expect(content?.textContent).toContain("Musixmatch token updated.");
	});

	test("moves provider order from the settings UI", async () => {
		const store = new SettingsStore(new MemoryStorage());
		let content: HTMLElement | undefined;
		window.Spicetify = {
			PopupModal: {
				display: (options) => {
					content = options.content;
				},
			},
		} as typeof window.Spicetify;
		new SettingsView(store, providers, {
			onRefreshLyrics: vi.fn(),
			onClearCache: vi.fn(),
			onRefreshMusixmatchToken: vi.fn(),
		}).open();
		const bubbled = vi.fn();
		content?.addEventListener("click", bubbled);

		content?.querySelector<HTMLButtonElement>('[data-provider-id="lrclib"][data-provider-direction="up"]')?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(store.get().providers.order.slice(0, 2)).toEqual(["lrclib", "spotify"]);
		expect(content?.textContent).toContain("lrclib");
		expect(bubbled).not.toHaveBeenCalled();
	});
});
