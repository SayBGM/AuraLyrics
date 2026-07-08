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
		expect(css).toContain(".main-trackCreditsModal-container");
	});

	test("marks the body while the settings modal is open", () => {
		const store = new SettingsStore(new MemoryStorage());
		window.Spicetify = {
			PopupModal: {
				display: vi.fn(),
			},
		} as unknown as typeof window.Spicetify;

		new SettingsView(store, providers, {
			onRefreshLyrics: vi.fn(),
			onClearCache: vi.fn(),
			onRefreshMusixmatchToken: vi.fn(),
		}).open();

		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(true);
		document.body.classList.remove("aura-lyrics-settings-open");
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

	test("updates the interlude style from the settings UI", () => {
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

		const select = Array.from(content?.querySelectorAll("select") ?? []).find((item) =>
			Array.from(item.options).some((option) => option.value === "wave")
		);
		if (!select) {
			throw new Error("Interlude style select was not rendered.");
		}
		select.value = "wave";
		select.dispatchEvent(new Event("change", { bubbles: true }));

		expect(store.get().interludeStyle).toBe("wave");
	});

	test("removes the album background toggle from settings", () => {
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

		expect(content?.textContent).not.toContain("Album background");
		expect(content?.textContent).toContain("Blur");
	});

	test("removes the lyrics vertical position control from settings", () => {
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

		expect(content?.textContent).not.toContain("Vertical position");
		expect(content?.textContent).toContain("Context lines");
	});

	test("renders settings menus in Korean and Japanese", () => {
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

		const languageSelect = Array.from(content?.querySelectorAll("select") ?? []).find((item) =>
			Array.from(item.options).some((option) => option.value === "ko")
		);
		if (!languageSelect) {
			throw new Error("Language select was not rendered.");
		}
		languageSelect.value = "ko";
		languageSelect.dispatchEvent(new Event("change", { bubbles: true }));

		expect(store.get().language).toBe("ko");
		expect(content?.textContent).toContain("일반");
		expect(content?.textContent).toContain("배경");
		expect(content?.textContent).toContain("현재 가사 새로고침");
		expect(content?.textContent).not.toContain("Album background");

		const japaneseSelect = Array.from(content?.querySelectorAll("select") ?? []).find((item) =>
			Array.from(item.options).some((option) => option.value === "ja")
		);
		if (!japaneseSelect) {
			throw new Error("Japanese language option was not rendered.");
		}
		japaneseSelect.value = "ja";
		japaneseSelect.dispatchEvent(new Event("change", { bubbles: true }));

		expect(store.get().language).toBe("ja");
		expect(content?.textContent).toContain("一般");
		expect(content?.textContent).toContain("背景");
		expect(content?.textContent).toContain("現在の歌詞を更新");
	});

	test("only shows the Musixmatch proxy URL input when custom mode is selected", () => {
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

		const findProxyInput = () =>
			Array.from(content?.querySelectorAll<HTMLInputElement>("input[type='text']") ?? []).find((item) =>
				item.closest("label")?.textContent?.includes("Proxy server URL")
			);

		expect(findProxyInput()).toBeUndefined();

		const proxyModeSelect = Array.from(content?.querySelectorAll("select") ?? []).find((item) =>
			Array.from(item.options)
				.map((option) => option.value)
				.every((value) => value === "default" || value === "custom")
		);
		if (!proxyModeSelect) {
			throw new Error("Musixmatch proxy mode select was not rendered.");
		}
		proxyModeSelect.value = "custom";
		proxyModeSelect.dispatchEvent(new Event("change", { bubbles: true }));

		expect(store.get().providers.musixmatchProxyMode).toBe("custom");
		const proxyInput = findProxyInput();
		if (!proxyInput) {
			throw new Error("Musixmatch proxy URL input was not rendered.");
		}
		proxyInput.value = "https://my-proxy.example.com";
		proxyInput.dispatchEvent(new Event("change", { bubbles: true }));

		expect(store.get().providers.musixmatchProxyBaseUrl).toBe("https://my-proxy.example.com");
	});
});
