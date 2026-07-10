import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

class FakeMutationObserver {
	public static instances: FakeMutationObserver[] = [];
	public readonly observe = vi.fn();
	public readonly disconnect = vi.fn();

	public constructor(private readonly callback: MutationCallback) {
		FakeMutationObserver.instances.push(this);
	}

	public trigger(): void {
		this.callback([], this as unknown as MutationObserver);
	}
}

type FakeMediaQueryList = MediaQueryList & {
	dispatch(matches: boolean): void;
	removeListenerSpy: ReturnType<typeof vi.fn>;
};

const createMediaQueryList = (initialMatches = false): FakeMediaQueryList => {
	let matches = initialMatches;
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	const removeListenerSpy = vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener));
	return {
		media: "(max-width: 680px)",
		get matches() {
			return matches;
		},
		onchange: null,
		addEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
		removeEventListener: removeListenerSpy,
		removeListenerSpy,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(() => true),
		dispatch(nextMatches: boolean) {
			matches = nextMatches;
			const event = { matches, media: this.media } as MediaQueryListEvent;
			for (const listener of listeners) {
				listener(event);
			}
		},
	} as FakeMediaQueryList;
};

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

const callbacks = (onRefreshMusixmatchToken: () => Promise<string | undefined> = vi.fn()) => ({
	onRefreshLyrics: vi.fn(),
	onClearCache: vi.fn(),
	onRefreshMusixmatchToken,
});

const openView = (options: { media?: FakeMediaQueryList; onRefreshMusixmatchToken?: () => Promise<string | undefined> } = {}) => {
	const store = new SettingsStore(new MemoryStorage());
	let content: HTMLElement | undefined;
	const media = options.media ?? createMediaQueryList();
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => media)
	);
	window.Spicetify = {
		PopupModal: {
			display: (modalOptions) => {
				content = modalOptions.content;
				document.body.replaceChildren(content);
			},
		},
	} as typeof window.Spicetify;
	const view = new SettingsView(store, providers, callbacks(options.onRefreshMusixmatchToken));
	view.open();
	if (!content) {
		throw new Error("Settings content was not displayed.");
	}
	return { content, media, store, view };
};

const tab = (content: HTMLElement, section: string): HTMLButtonElement => {
	const result = content.querySelector<HTMLButtonElement>(`[role="tab"][data-section="${section}"]`);
	if (!result) {
		throw new Error(`${section} tab was not rendered.`);
	}
	return result;
};

const control = <T extends HTMLElement>(content: HTMLElement, id: string): T => {
	const result = content.querySelector<T>(`[data-control-id="${id}"]`);
	if (!result) {
		throw new Error(`${id} control was not rendered.`);
	}
	return result;
};

const flushTimers = async (): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
	FakeMutationObserver.instances = [];
	vi.stubGlobal("MutationObserver", FakeMutationObserver);
});

afterEach(() => {
	document.body.replaceChildren();
	document.body.className = "";
	window.Spicetify = undefined;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("SettingsView", () => {
	test("renders six accessible tabs and only the active panel", () => {
		const { content } = openView();
		const tabs = Array.from(content.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

		expect(tabs).toHaveLength(6);
		expect(tabs.map((item) => item.dataset.section)).toEqual(["general", "lyrics", "appearance", "motion", "providers", "advanced"]);
		expect(content.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Settings navigation");
		expect(content.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("vertical");
		expect(content.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
		expect(content.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe("aura-settings-tab-general");
		expect(content.querySelector('[role="tabpanel"]')?.textContent).toContain("Language");
		expect(content.querySelector('[role="tabpanel"]')?.textContent).not.toContain("Lyrics delay");
		expect(tab(content, "general").getAttribute("aria-selected")).toBe("true");
		expect(tab(content, "general").tabIndex).toBe(0);
		expect(tab(content, "lyrics").tabIndex).toBe(-1);
	});

	test("switches panels by click and remembers the active section when reopened", () => {
		const { content, view } = openView();
		tab(content, "lyrics").click();

		expect(content.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
		expect(content.querySelector('[role="tabpanel"]')?.textContent).toContain("Lyrics delay");
		expect(content.querySelector('[role="tabpanel"]')?.textContent).not.toContain("Language");
		expect(tab(content, "lyrics").getAttribute("aria-selected")).toBe("true");

		view.open();
		const reopened = document.querySelector<HTMLElement>(".aura-lyrics-settings");
		expect(reopened?.querySelector('[role="tabpanel"]')?.textContent).toContain("Lyrics delay");
		expect(reopened?.querySelector('[data-section="lyrics"]')?.getAttribute("aria-selected")).toBe("true");
	});

	test("supports roving keyboard navigation for vertical and compact tab lists", () => {
		const media = createMediaQueryList();
		const { content } = openView({ media });
		const general = tab(content, "general");
		general.focus();
		general.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));

		expect(document.activeElement).toBe(tab(content, "lyrics"));
		expect(tab(content, "lyrics").getAttribute("aria-selected")).toBe("true");

		tab(content, "lyrics").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
		expect(document.activeElement).toBe(tab(content, "advanced"));

		media.dispatch(true);
		expect(content.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("horizontal");
		tab(content, "advanced").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
		tab(content, "general").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
		expect(document.activeElement).toBe(tab(content, "lyrics"));
	});

	test("keeps a range input node and focus while updating its value", () => {
		const { content, store } = openView();
		tab(content, "lyrics").click();
		const range = control<HTMLInputElement>(content, "font-scale");
		range.focus();
		range.value = "1.2";
		range.dispatchEvent(new Event("input", { bubbles: true }));

		expect(store.get().fontScale).toBe(1.2);
		expect(control(content, "font-scale")).toBe(range);
		expect(document.activeElement).toBe(range);
	});

	test("keeps the current section through language and preset refreshes", async () => {
		const { content, store } = openView();
		const scroller = content.querySelector<HTMLElement>(".settings-panel-scroll");
		if (!scroller) {
			throw new Error("Panel scroller was not rendered.");
		}
		scroller.scrollTop = 48;
		const language = control<HTMLSelectElement>(content, "language");
		language.focus();
		language.value = "ko";
		language.dispatchEvent(new Event("change", { bubbles: true }));
		await flushTimers();

		expect(store.get().language).toBe("ko");
		expect(tab(content, "general").getAttribute("aria-selected")).toBe("true");
		expect(content.querySelector(".settings-title")?.textContent).toBe("AuraLyrics 설정");
		expect(tab(content, "appearance").textContent).toContain("화면");
		expect(scroller.scrollTop).toBe(48);
		expect(document.activeElement).toBe(control(content, "language"));

		const preset = control<HTMLSelectElement>(content, "preset");
		preset.focus();
		preset.value = "clean";
		preset.dispatchEvent(new Event("change", { bubbles: true }));
		await flushTimers();
		expect(store.get().preset).toBe("clean");
		expect(tab(content, "general").getAttribute("aria-selected")).toBe("true");
		expect(document.activeElement).toBe(control(content, "preset"));
	});

	test("keeps providers active through enabled, order, proxy, and token updates", async () => {
		let resolveToken: (value: string | undefined) => void = () => undefined;
		const tokenPromise = new Promise<string | undefined>((resolve) => {
			resolveToken = resolve;
		});
		const { content, store } = openView({ onRefreshMusixmatchToken: () => tokenPromise });
		tab(content, "providers").click();

		const enabled = control<HTMLInputElement>(content, "provider-enabled-lrclib");
		enabled.click();
		expect(store.get().providers.enabled.lrclib).toBe(false);
		expect(tab(content, "providers").getAttribute("aria-selected")).toBe("true");

		control<HTMLButtonElement>(content, "provider-lrclib-up").click();
		await flushTimers();
		expect(store.get().providers.order.slice(0, 2)).toEqual(["lrclib", "spotify"]);
		expect(tab(content, "providers").getAttribute("aria-selected")).toBe("true");

		const proxyMode = control<HTMLSelectElement>(content, "proxy-mode");
		proxyMode.value = "custom";
		proxyMode.dispatchEvent(new Event("change", { bubbles: true }));
		await flushTimers();
		expect(control(content, "proxy-url")).toBeInstanceOf(HTMLInputElement);
		expect(tab(content, "providers").getAttribute("aria-selected")).toBe("true");

		const tokenInput = control<HTMLInputElement>(content, "musixmatch-token");
		tokenInput.value = "abcdef";
		tokenInput.dispatchEvent(new Event("change", { bubbles: true }));
		tokenInput.focus();
		tokenInput.setSelectionRange(2, 5);
		control<HTMLButtonElement>(content, "generate-musixmatch-token").click();
		await flushTimers();
		expect(content.querySelector('[role="status"]')?.textContent).toContain("Requesting");
		resolveToken("generated-token");
		await tokenPromise;
		await flushTimers();

		const refreshedTokenInput = control<HTMLInputElement>(content, "musixmatch-token");
		expect(store.get().providers.musixmatchToken).toBe("generated-token");
		expect(content.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
		expect(content.querySelector('[role="status"]')?.textContent).toContain("updated");
		expect(tab(content, "providers").getAttribute("aria-selected")).toBe("true");
		expect(document.activeElement).toBe(refreshedTokenInput);
		expect(refreshedTokenInput.selectionStart).toBe(2);
		expect(refreshedTokenInput.selectionEnd).toBe(5);
	});

	test("translates provider enabled labels and appearance navigation", async () => {
		const { content } = openView();
		tab(content, "providers").click();
		expect(control(content, "provider-enabled-spotify").getAttribute("aria-label")).toBe("spotify enabled");

		tab(content, "general").click();
		const language = control<HTMLSelectElement>(content, "language");
		language.value = "ja";
		language.dispatchEvent(new Event("change", { bubbles: true }));
		await flushTimers();
		expect(tab(content, "appearance").textContent).toContain("表示");

		tab(content, "providers").click();
		expect(control(content, "provider-enabled-spotify").getAttribute("aria-label")).toBe("spotify を有効化");
	});

	test("uses 17px accessible inline SVG icons for sections and provider ordering", () => {
		const { content } = openView();
		for (const icon of Array.from(content.querySelectorAll<SVGElement>('[role="tab"] svg'))) {
			expect(icon.getAttribute("width")).toBe("17");
			expect(icon.getAttribute("height")).toBe("17");
			expect(icon.getAttribute("viewBox")).toBe("0 0 24 24");
			expect(icon.getAttribute("fill")).toBe("none");
			expect(icon.getAttribute("stroke")).toBe("currentColor");
			expect(icon.getAttribute("aria-hidden")).toBe("true");
			expect(icon.getAttribute("focusable")).toBe("false");
		}

		tab(content, "providers").click();
		expect(content.querySelectorAll(".icon-button svg")).toHaveLength(6);
	});

	test("uses a bounded dark modal with only the panel body scrolling", () => {
		const { content } = openView();
		const css = content.querySelector("style")?.textContent ?? "";

		expect(css).toContain("max-height: min(760px, calc(100vh - 32px))");
		expect(css).toContain("grid-template-columns: 200px minmax(0, 1fr)");
		expect(css).toContain(".settings-panel-scroll");
		expect(css).toContain("overflow-y: auto");
		expect(css).toContain("@media (max-width: 680px)");
		expect(css).toContain("#0d0d0f");
		expect(css).toContain("#141417");
		expect(css).toContain("#1a1a1f");
		expect(css).toContain("#f5f5f7");
		expect(css).toContain("#ff7457");
		expect(css).toContain(":focus-visible");
		expect(css).not.toContain("settings-hero");
	});

	test("cleans up observers and media listeners across detach, reopen, and destroy", () => {
		const firstMedia = createMediaQueryList();
		const { content, view } = openView({ media: firstMedia });
		const firstObserver = FakeMutationObserver.instances[0];
		expect(firstObserver.observe).toHaveBeenCalledOnce();

		content.remove();
		firstObserver.trigger();
		expect(firstObserver.disconnect).toHaveBeenCalledOnce();
		expect(firstMedia.removeListenerSpy).toHaveBeenCalledOnce();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);

		view.open();
		const secondObserver = FakeMutationObserver.instances[1];
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(true);
		firstObserver.trigger();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(true);

		view.destroy();
		expect(secondObserver.disconnect).toHaveBeenCalledOnce();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);
	});

	test("does not clean up before a locally captured container has connected", () => {
		const store = new SettingsStore(new MemoryStorage());
		const media = createMediaQueryList();
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => media)
		);
		let content: HTMLElement | undefined;
		window.Spicetify = {
			PopupModal: {
				display: (options) => {
					content = options.content;
				},
			},
		} as typeof window.Spicetify;
		const view = new SettingsView(store, providers, callbacks());
		view.open();
		const observer = FakeMutationObserver.instances[0];

		observer.trigger();
		expect(observer.disconnect).not.toHaveBeenCalled();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(true);

		document.body.append(content as HTMLElement);
		observer.trigger();
		(content as HTMLElement).remove();
		observer.trigger();
		expect(observer.disconnect).toHaveBeenCalledOnce();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);
	});
});
