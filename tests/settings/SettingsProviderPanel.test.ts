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

class ToggleFailStorage extends MemoryStorage {
	public failWrites = false;
	public override set(key: string, value: string) {
		return this.failWrites ? false : super.set(key, value);
	}
}

const providers: LyricsProvider[] = ["spotify", "lrclib", "musixmatch"].map((id) => ({
	id: id as LyricsProvider["id"],
	supports: () => true,
	fetch: async () => ({ ok: false as const, reason: "no-lyrics" as const }),
}));

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

const mountPanel = (
	store: SettingsStore,
	onRefreshMusixmatchToken: () => Promise<string | undefined>,
	onFeedback = vi.fn(),
	onAccepted = vi.fn()
) => {
	const controls = new SettingsControlFactory(document, () => store.commit());
	const panel = new SettingsProviderPanel(document, store, providers, controls, {
		onFeedback,
		onMusixmatchTokenAccepted: onAccepted,
		onRefreshMusixmatchToken,
		onScheduleRefresh: vi.fn(),
	});
	const groups = panel.render(store.get());
	const root = document.createElement("div");
	root.append(...groups);
	document.body.append(root);
	return { groups, onAccepted, onFeedback, panel, root };
};

describe("SettingsProviderPanel", () => {
	test("uses canonical provider names and masks the Musixmatch token by default", () => {
		const store = new SettingsStore(new MemoryStorage());
		const { root } = mountPanel(store, async () => undefined);
		const token = root.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');

		expect(root.textContent).toContain("Spotify");
		expect(root.textContent).toContain("LRCLIB");
		expect(root.textContent).toContain("Musixmatch");
		expect(token?.type).toBe("password");

		root.querySelector<HTMLButtonElement>('[data-control-id="toggle-musixmatch-token"]')?.click();
		expect(token?.type).toBe("text");
	});

	test("shows copy only when Clipboard API is available and reports its result", async () => {
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		const store = new SettingsStore(new MemoryStorage());
		store.update({ providers: { ...store.get().providers, musixmatchToken: "copy-me" } });
		const onFeedback = vi.fn();
		const { root } = mountPanel(store, async () => undefined, onFeedback);
		const copy = root.querySelector<HTMLButtonElement>('[data-control-id="copy-musixmatch-token"]');

		expect(copy).not.toBeNull();
		copy?.click();
		await Promise.resolve();
		expect(writeText).toHaveBeenCalledWith("copy-me");
		expect(onFeedback).toHaveBeenCalledWith("success", "Token copied", 2500);
		Reflect.deleteProperty(navigator, "clipboard");
	});

	test("locks token generation while working and reports the result through shared feedback", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const request = deferred<string | undefined>();
		const onFeedback = vi.fn();
		const onAccepted = vi.fn();
		const { root } = mountPanel(store, () => request.promise, onFeedback, onAccepted);
		const button = root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]');
		const input = root.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');

		button?.click();
		expect(button?.disabled).toBe(true);
		expect(onFeedback).toHaveBeenCalledWith("working", "Requesting Musixmatch token...");

		request.resolve("generated-token");
		await request.promise;
		await Promise.resolve();

		expect(button?.disabled).toBe(false);
		expect(store.get().providers.musixmatchToken).toBe("generated-token");
		expect(input?.value).toBe("generated-token");
		expect(onAccepted).toHaveBeenCalledWith("generated-token");
		expect(onFeedback).toHaveBeenCalledWith("success", "Musixmatch token updated.", 2500);
	});

	test("manual typing invalidates an in-flight token request", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const request = deferred<string | undefined>();
		const onAccepted = vi.fn();
		const { root } = mountPanel(store, () => request.promise, vi.fn(), onAccepted);
		const input = root.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');

		root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();
		if (!input) {
			throw new Error("Token input was not rendered.");
		}
		input.value = "manual-token";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
		request.resolve("stale-token");
		await request.promise;
		await Promise.resolve();

		expect(store.get().providers.musixmatchToken).toBe("manual-token");
		expect(input.value).toBe("manual-token");
		expect(onAccepted).not.toHaveBeenCalled();
	});

	test("announces provider reordering with its display name", () => {
		const store = new SettingsStore(new MemoryStorage());
		const onFeedback = vi.fn();
		const { root } = mountPanel(store, async () => undefined, onFeedback);

		root.querySelector<HTMLButtonElement>('[data-control-id="provider-lrclib-up"]')?.click();

		expect(store.get().providers.order.slice(0, 2)).toEqual(["lrclib", "spotify"]);
		expect(onFeedback).toHaveBeenCalledWith("success", "Moved LRCLIB to position 1.", 2500);
		expect(root.querySelector(".provider-order-announcement")?.textContent).toContain("LRCLIB");
	});

	test("does not accept a generated token when persistence fails", async () => {
		const storage = new ToggleFailStorage();
		const store = new SettingsStore(storage);
		storage.failWrites = true;
		const onFeedback = vi.fn();
		const onAccepted = vi.fn();
		const { root } = mountPanel(store, async () => "runtime-token", onFeedback, onAccepted);

		root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(onAccepted).not.toHaveBeenCalled();
		expect(onFeedback).toHaveBeenCalledWith("error", expect.stringContaining("Could not save"));
	});
});
