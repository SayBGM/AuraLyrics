import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LyricsProvider } from "../../src/lyrics/types";
import { SettingsStore } from "../../src/settings/SettingsStore";
import { SettingsView } from "../../src/settings/SettingsView";

class MemoryStorage {
	private readonly values = new Map<string, string>();
	public setCalls = 0;

	public get(key: string) {
		return this.values.get(key) ?? null;
	}

	public set(key: string, value: string) {
		this.setCalls += 1;
		this.values.set(key, value);
		return true;
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
	onMusixmatchTokenAccepted: vi.fn(),
	onRefreshMusixmatchToken,
});

const openView = (
	options: { media?: FakeMediaQueryList; onRefreshMusixmatchToken?: () => Promise<string | undefined>; withTrigger?: boolean } = {}
) => {
	const storage = new MemoryStorage();
	const store = new SettingsStore(storage);
	let content: HTMLElement | undefined;
	let modal: HTMLElement | undefined;
	const trigger = options.withTrigger ? document.createElement("button") : undefined;
	if (trigger) {
		trigger.textContent = "Open settings";
		document.body.append(trigger);
		trigger.focus();
	}
	const media = options.media ?? createMediaQueryList();
	const hide = vi.fn(() => {
		modal?.remove();
	});
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => media)
	);
	window.Spicetify = {
		PopupModal: {
			display: (modalOptions: { content: HTMLElement; title: string }) => {
				content = modalOptions.content;
				modal = document.createElement("div");
				modal.className = "test-popup-modal main-trackCreditsModal-container";
				const title = document.createElement("h1");
				title.dataset.modalTitle = "true";
				title.textContent = modalOptions.title;
				const mainSection = document.createElement("div");
				mainSection.className = "main-trackCreditsModal-mainSection";
				const originalCredits = document.createElement("div");
				originalCredits.className = "main-trackCreditsModal-originalCredits";
				originalCredits.append(modalOptions.content);
				mainSection.append(originalCredits);
				modal.append(title, mainSection);
				document.querySelector(".test-popup-modal")?.remove();
				document.body.append(modal);
			},
			hide,
		},
	} as unknown as typeof window.Spicetify;
	const view = new SettingsView(store, providers, callbacks(options.onRefreshMusixmatchToken));
	view.open();
	if (!content) {
		throw new Error("Settings content was not displayed.");
	}
	if (!modal) {
		throw new Error("Settings modal was not displayed.");
	}
	return { content, hide, media, modal, storage, store, trigger, view };
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

const cssRule = (css: string, selector: string): string => {
	const start = css.indexOf(`${selector} {`);
	if (start < 0) {
		return "";
	}
	const end = css.indexOf("}", start);
	return end < 0 ? "" : css.slice(start, end + 1);
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
	test("uses one stable popup title without a duplicate internal title", async () => {
		const { content, modal } = openView();
		const modalTitle = modal.querySelector<HTMLElement>("[data-modal-title]");

		expect(modalTitle?.textContent).toBe("AuraLyrics");
		expect(content.querySelector(".settings-title")).toBeNull();
		expect(content.textContent).not.toContain("AuraLyrics");

		const language = control<HTMLSelectElement>(content, "language");
		language.value = "ko";
		language.dispatchEvent(new Event("change", { bubbles: true }));
		await flushTimers();

		expect(modalTitle?.textContent).toBe("AuraLyrics");
		expect(content.textContent).not.toContain("AuraLyrics");
	});

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
		expect(tab(content, "general").getAttribute("aria-controls")).toBe("aura-settings-panel-general");
		expect(tab(content, "general").tabIndex).toBe(0);
		expect(tab(content, "lyrics").hasAttribute("aria-controls")).toBe(false);
		expect(tab(content, "lyrics").tabIndex).toBe(-1);
	});

	test("switches panels by click and remembers the active section when reopened", () => {
		const { content, view } = openView();
		tab(content, "lyrics").click();

		expect(content.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
		expect(content.querySelector('[role="tabpanel"]')?.textContent).toContain("Lyrics delay");
		expect(content.querySelector('[role="tabpanel"]')?.textContent).not.toContain("Language");
		expect(tab(content, "lyrics").getAttribute("aria-selected")).toBe("true");
		expect(tab(content, "general").hasAttribute("aria-controls")).toBe(false);
		expect(tab(content, "lyrics").getAttribute("aria-controls")).toBe("aura-settings-panel-lyrics");

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
		const { content, storage, store } = openView();
		tab(content, "lyrics").click();
		const range = control<HTMLInputElement>(content, "font-scale");
		storage.setCalls = 0;
		range.focus();
		range.value = "1.2";
		range.dispatchEvent(new Event("input", { bubbles: true }));

		expect(store.get().fontScale).toBe(1.2);
		expect(storage.setCalls).toBe(0);
		expect(control(content, "font-scale")).toBe(range);
		expect(document.activeElement).toBe(range);
	});

	test("previews multiple range inputs without writes and commits the latest value once", () => {
		const { content, storage, store } = openView();
		tab(content, "appearance").click();
		const dim = control<HTMLInputElement>(content, "background-dim");
		const saturation = control<HTMLInputElement>(content, "background-saturation");
		const vignette = control<HTMLInputElement>(content, "vignette");
		storage.setCalls = 0;
		vignette.dispatchEvent(new Event("pointerup", { bubbles: true }));
		expect(storage.setCalls).toBe(0);
		expect(store.get().preset).toBe("immersive");

		dim.value = "0.5";
		dim.dispatchEvent(new Event("input", { bubbles: true }));
		saturation.focus();
		saturation.value = "1.5";
		saturation.dispatchEvent(new Event("input", { bubbles: true }));

		expect(store.get().backgroundDim).toBe(0.5);
		expect(store.get().backgroundSaturation).toBe(1.5);
		expect(storage.setCalls).toBe(0);
		expect(control(content, "background-dim")).toBe(dim);
		expect(control(content, "background-saturation")).toBe(saturation);
		expect(document.activeElement).toBe(saturation);

		saturation.dispatchEvent(new Event("change", { bubbles: true }));

		expect(storage.setCalls).toBe(1);
		expect(document.activeElement).toBe(saturation);
		dim.dispatchEvent(new Event("pointerup", { bubbles: true }));
		expect(storage.setCalls).toBe(1);

		vignette.value = "0.65";
		vignette.dispatchEvent(new Event("change", { bubbles: true }));

		expect(store.get().vignetteStrength).toBe(0.65);
		expect(storage.setCalls).toBe(2);
	});

	test("patches normalized number values into the same focused input", () => {
		const { content, store } = openView();
		tab(content, "appearance").click();
		const blur = control<HTMLInputElement>(content, "background-blur");
		blur.focus();
		blur.value = "999";
		blur.dispatchEvent(new Event("change", { bubbles: true }));

		expect(store.get().backgroundBlurPx).toBe(80);
		expect(blur.value).toBe("80");
		expect(control(content, "background-blur")).toBe(blur);
		expect(document.activeElement).toBe(blur);

		tab(content, "lyrics").click();
		const context = control<HTMLInputElement>(content, "context-lines");
		context.focus();
		context.value = "1.8";
		context.dispatchEvent(new Event("change", { bubbles: true }));
		expect(store.get().visibleContextLines).toBe(2);
		expect(context.value).toBe("2");
		expect(document.activeElement).toBe(context);

		const delay = control<HTMLInputElement>(content, "lyrics-delay");
		delay.focus();
		delay.value = "99999";
		delay.dispatchEvent(new Event("change", { bubbles: true }));
		expect(store.get().lyricsDelayMs).toBe(5000);
		expect(delay.value).toBe("5000");
		expect(document.activeElement).toBe(delay);
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

		control<HTMLButtonElement>(content, "provider-lrclib-up").focus();
		control<HTMLButtonElement>(content, "provider-lrclib-up").click();
		await flushTimers();
		expect(store.get().providers.order.slice(0, 2)).toEqual(["lrclib", "spotify"]);
		expect((document.activeElement as HTMLElement).dataset.controlId).toBe("provider-lrclib-down");
		expect(tab(content, "providers").getAttribute("aria-selected")).toBe("true");

		const proxyMode = control<HTMLSelectElement>(content, "proxy-mode");
		proxyMode.value = "custom";
		proxyMode.dispatchEvent(new Event("change", { bubbles: true }));
		await flushTimers();
		expect(control(content, "proxy-url")).toBeInstanceOf(HTMLInputElement);
		expect(tab(content, "providers").getAttribute("aria-selected")).toBe("true");

		const tokenInput = control<HTMLInputElement>(content, "musixmatch-token");
		const liveRegion = content.querySelector<HTMLElement>('[role="status"]');
		expect(liveRegion?.getAttribute("aria-live")).toBe("polite");
		expect(liveRegion?.textContent).toBe("");
		tokenInput.value = "abcdef";
		tokenInput.dispatchEvent(new Event("change", { bubbles: true }));
		tokenInput.focus();
		tokenInput.setSelectionRange(2, 5);
		control<HTMLButtonElement>(content, "generate-musixmatch-token").click();
		expect(content.querySelector('[role="status"]')).toBe(liveRegion);
		expect(liveRegion?.textContent).toContain("Requesting");
		resolveToken("generated-token");
		await tokenPromise;
		await flushTimers();

		const refreshedTokenInput = control<HTMLInputElement>(content, "musixmatch-token");
		expect(store.get().providers.musixmatchToken).toBe("generated-token");
		expect(content.querySelector('[role="status"]')).toBe(liveRegion);
		expect(liveRegion?.textContent).toContain("updated");
		expect(refreshedTokenInput).toBe(tokenInput);
		expect(tab(content, "providers").getAttribute("aria-selected")).toBe("true");
		expect(document.activeElement).toBe(refreshedTokenInput);
		expect(refreshedTokenInput.selectionStart).toBe(2);
		expect(refreshedTokenInput.selectionEnd).toBe(5);
	});

	test("invalidates pending token requests on panel detach and modal close, then reopens cleanly", async () => {
		let resolvePanelRequest: (value: string | undefined) => void = () => undefined;
		let resolveModalRequest: (value: string | undefined) => void = () => undefined;
		const panelRequest = new Promise<string | undefined>((resolve) => {
			resolvePanelRequest = resolve;
		});
		const modalRequest = new Promise<string | undefined>((resolve) => {
			resolveModalRequest = resolve;
		});
		const requests = [panelRequest, modalRequest, Promise.resolve("fresh-token")];
		const { content, store, view } = openView({ onRefreshMusixmatchToken: () => requests.shift() ?? Promise.resolve(undefined) });
		tab(content, "providers").click();
		control<HTMLButtonElement>(content, "generate-musixmatch-token").click();
		tab(content, "general").click();
		resolvePanelRequest("panel-stale-token");
		await panelRequest;
		await flushTimers();
		expect(store.get().providers.musixmatchToken).toBeUndefined();

		tab(content, "providers").click();
		control<HTMLButtonElement>(content, "generate-musixmatch-token").click();
		view.destroy();
		resolveModalRequest("modal-stale-token");
		await modalRequest;
		await flushTimers();
		expect(store.get().providers.musixmatchToken).toBeUndefined();

		view.open();
		const reopened = document.querySelector<HTMLElement>(".aura-lyrics-settings");
		if (!reopened) {
			throw new Error("Settings view did not reopen.");
		}
		tab(reopened, "providers").click();
		control<HTMLButtonElement>(reopened, "generate-musixmatch-token").click();
		await flushTimers();
		expect(store.get().providers.musixmatchToken).toBe("fresh-token");
		expect(reopened.querySelector('[role="status"]')?.textContent).toContain("updated");
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
		const containerRule = cssRule(css, "body.aura-lyrics-settings-open .main-trackCreditsModal-container");
		const mainSectionRule = cssRule(css, "body.aura-lyrics-settings-open .main-trackCreditsModal-mainSection");
		const originalCreditsRule = cssRule(css, "body.aura-lyrics-settings-open .main-trackCreditsModal-originalCredits");
		const settingsRule = cssRule(css, ".aura-lyrics-settings");

		expect(css).toContain("max-height: min(760px, calc(100vh - 32px))");
		expect(containerRule).toContain("display: flex");
		expect(containerRule).toContain("flex-direction: column");
		expect(containerRule).toContain("overflow: hidden");
		expect(mainSectionRule).toContain("display: flex");
		expect(mainSectionRule).toContain("flex: 1 1 auto");
		expect(mainSectionRule).toContain("min-height: 0");
		expect(mainSectionRule).toContain("overflow: hidden");
		expect(originalCreditsRule).toContain("display: flex");
		expect(originalCreditsRule).toContain("flex: 1 1 auto");
		expect(originalCreditsRule).toContain("min-height: 0");
		expect(originalCreditsRule).toContain("overflow: hidden");
		expect(settingsRule).toContain("flex: 1 1 auto");
		expect(settingsRule).toContain("height: 100%");
		expect(settingsRule).toContain("max-height: 100%");
		expect(settingsRule).toContain("min-height: 0");
		expect(settingsRule).toContain("overflow: hidden");
		expect(css).not.toContain("calc(100vh - 92px)");
		expect(css).not.toContain(".main-trackCreditsModal-content");
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
		expect(content.parentElement?.classList.contains("main-trackCreditsModal-originalCredits")).toBe(true);
		expect(content.parentElement?.parentElement?.classList.contains("main-trackCreditsModal-mainSection")).toBe(true);
		expect(content.closest(".main-trackCreditsModal-container")).not.toBeNull();
	});

	test("focuses the active tab and restores the connected trigger on close", () => {
		const { content, trigger, view } = openView({ withTrigger: true });
		if (!trigger) {
			throw new Error("Settings trigger was not created.");
		}

		expect(document.activeElement).toBe(tab(content, "general"));

		view.destroy();
		expect(document.activeElement).toBe(trigger);
	});

	test("does not steal focus from another connected surface on detach", () => {
		const { content, trigger } = openView({ withTrigger: true });
		if (!trigger) {
			throw new Error("Settings trigger was not created.");
		}
		const otherSurface = document.createElement("button");
		otherSurface.textContent = "Other modal";
		document.body.append(otherSurface);
		otherSurface.focus();

		content.remove();
		FakeMutationObserver.instances[0].trigger();

		expect(document.activeElement).toBe(otherSurface);
	});

	test("does not steal focus when the host modal root is reused", () => {
		const { content, modal, trigger } = openView({ withTrigger: true });
		if (!trigger) {
			throw new Error("Settings trigger was not created.");
		}
		const replacement = document.createElement("button");
		replacement.textContent = "Replacement modal";
		modal.append(replacement);
		replacement.focus();

		content.remove();
		FakeMutationObserver.instances[0].trigger();

		expect(document.activeElement).toBe(replacement);
	});

	test("does not restore the trigger while a new host modal is connected", () => {
		const { modal, trigger } = openView({ withTrigger: true });
		if (!trigger) {
			throw new Error("Settings trigger was not created.");
		}
		const replacementModal = document.createElement("div");
		replacementModal.className = "main-trackCreditsModal-container";

		modal.remove();
		document.body.append(replacementModal);
		FakeMutationObserver.instances[0].trigger();

		expect(document.activeElement).not.toBe(trigger);
		expect(replacementModal.isConnected).toBe(true);
	});

	test("restores the connected trigger after a natural detach", () => {
		const { content, trigger } = openView({ withTrigger: true });
		if (!trigger) {
			throw new Error("Settings trigger was not created.");
		}

		content.remove();
		FakeMutationObserver.instances[0].trigger();

		expect(document.activeElement).toBe(trigger);
	});

	test("cleans up observers and media listeners across detach, reopen, and destroy", () => {
		const firstMedia = createMediaQueryList();
		const { content, hide, view } = openView({ media: firstMedia });
		const firstObserver = FakeMutationObserver.instances[0];
		expect(firstObserver.observe).toHaveBeenCalledOnce();

		content.remove();
		firstObserver.trigger();
		expect(firstObserver.disconnect).toHaveBeenCalledOnce();
		expect(firstMedia.removeListenerSpy).toHaveBeenCalledOnce();
		expect(hide).not.toHaveBeenCalled();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);

		view.open();
		const secondObserver = FakeMutationObserver.instances[1];
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(true);
		firstObserver.trigger();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(true);

		view.destroy();
		expect(secondObserver.disconnect).toHaveBeenCalledOnce();
		expect(hide).toHaveBeenCalledOnce();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);
	});

	test("only hides a connected modal on explicit destroy", () => {
		const { hide, view } = openView();

		view.open();
		expect(hide).not.toHaveBeenCalled();

		view.destroy();
		expect(hide).toHaveBeenCalledOnce();

		view.destroy();
		expect(hide).toHaveBeenCalledOnce();
	});

	test("allows a container to connect within the bounded attach task", async () => {
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

		queueMicrotask(() => document.body.append(content as HTMLElement));
		await flushTimers();
		(content as HTMLElement).remove();
		observer.trigger();
		expect(observer.disconnect).toHaveBeenCalledOnce();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);
	});

	test("cleans up when the container misses the bounded attach task", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const media = createMediaQueryList();
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => media)
		);
		window.Spicetify = {
			PopupModal: {
				display: vi.fn(),
			},
		} as unknown as typeof window.Spicetify;
		const view = new SettingsView(store, providers, callbacks());
		view.open();
		const observer = FakeMutationObserver.instances[0];

		await flushTimers();

		expect(observer.disconnect).toHaveBeenCalledOnce();
		expect(media.removeListenerSpy).toHaveBeenCalledOnce();
		expect(document.body.classList.contains("aura-lyrics-settings-open")).toBe(false);
	});
});
