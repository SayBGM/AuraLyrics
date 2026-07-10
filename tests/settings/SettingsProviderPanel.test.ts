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

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

const flushPromise = async <T>(promise: Promise<T>): Promise<void> => {
	await promise;
	await Promise.resolve();
};

describe("SettingsProviderPanel", () => {
	test("keeps token status and input nodes live while an async token request resolves", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const controls = new SettingsControlFactory(document, () => store.commit());
		let resolveToken: (value: string | undefined) => void = () => undefined;
		const token = new Promise<string | undefined>((resolve) => {
			resolveToken = resolve;
		});
		const panel = new SettingsProviderPanel(document, store, providers, controls, {
			onMusixmatchTokenAccepted: vi.fn(),
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

	test("applies only the newest token request when requests finish out of order", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const controls = new SettingsControlFactory(document, () => store.commit());
		const first = deferred<string | undefined>();
		const second = deferred<string | undefined>();
		const requests = [first.promise, second.promise];
		const accepted = vi.fn();
		const panel = new SettingsProviderPanel(document, store, providers, controls, {
			onMusixmatchTokenAccepted: accepted,
			onRefreshMusixmatchToken: () => requests.shift() ?? Promise.resolve(undefined),
			onScheduleRefresh: vi.fn(),
		});
		const root = document.createElement("div");
		root.append(...panel.render(store.get()));
		document.body.append(root);
		const button = root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]');
		const input = root.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');
		const status = root.querySelector<HTMLElement>('[role="status"]');
		if (!button || !input || !status) {
			throw new Error("Provider token controls were not rendered.");
		}

		button.click();
		button.click();
		second.resolve("new-token");
		await flushPromise(second.promise);
		expect(store.get().providers.musixmatchToken).toBe("new-token");
		expect(input.value).toBe("new-token");
		expect(status.textContent).toContain("updated");
		expect(accepted).toHaveBeenCalledOnce();
		expect(accepted).toHaveBeenCalledWith("new-token");

		first.resolve("stale-token");
		await flushPromise(first.promise);
		expect(store.get().providers.musixmatchToken).toBe("new-token");
		expect(input.value).toBe("new-token");
		expect(status.textContent).toContain("updated");
		expect(accepted).toHaveBeenCalledOnce();
	});

	test("invalidates pending requests and releases mounted nodes during cleanup", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const controls = new SettingsControlFactory(document, () => store.commit());
		const request = deferred<string | undefined>();
		const accepted = vi.fn();
		const panel = new SettingsProviderPanel(document, store, providers, controls, {
			onMusixmatchTokenAccepted: accepted,
			onRefreshMusixmatchToken: () => request.promise,
			onScheduleRefresh: vi.fn(),
		});
		const root = document.createElement("div");
		root.append(...panel.render(store.get()));
		const input = root.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');
		const status = root.querySelector<HTMLElement>('[role="status"]');
		root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();
		expect(status?.textContent).toContain("Requesting");

		panel.cleanup();
		request.resolve("stale-token");
		await flushPromise(request.promise);

		expect(store.get().providers.musixmatchToken).toBeUndefined();
		expect(input?.value).toBe("");
		expect(status?.textContent).toContain("Requesting");
		expect(accepted).not.toHaveBeenCalled();
		const reopened = document.createElement("div");
		reopened.append(...panel.render(store.get()));
		expect(reopened.querySelector('[role="status"]')?.textContent).toBe("");
	});

	test("clearTokenStatus invalidates a pending request without mutating the store", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const controls = new SettingsControlFactory(document, () => store.commit());
		const request = deferred<string | undefined>();
		const accepted = vi.fn();
		const panel = new SettingsProviderPanel(document, store, providers, controls, {
			onMusixmatchTokenAccepted: accepted,
			onRefreshMusixmatchToken: () => request.promise,
			onScheduleRefresh: vi.fn(),
		});
		const root = document.createElement("div");
		root.append(...panel.render(store.get()));
		root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();

		panel.clearTokenStatus();
		request.resolve("stale-token");
		await flushPromise(request.promise);

		expect(store.get().providers.musixmatchToken).toBeUndefined();
		expect(root.querySelector('[role="status"]')?.textContent).toBe("");
		expect(accepted).not.toHaveBeenCalled();
	});

	test("manual token edits invalidate a pending request before it can overwrite the store or UI", async () => {
		const store = new SettingsStore(new MemoryStorage());
		const controls = new SettingsControlFactory(document, () => store.commit());
		const request = deferred<string | undefined>();
		const accepted = vi.fn();
		const panel = new SettingsProviderPanel(document, store, providers, controls, {
			onMusixmatchTokenAccepted: accepted,
			onRefreshMusixmatchToken: () => request.promise,
			onScheduleRefresh: vi.fn(),
		});
		const root = document.createElement("div");
		root.append(...panel.render(store.get()));
		document.body.append(root);
		const input = root.querySelector<HTMLInputElement>('[data-control-id="musixmatch-token"]');
		const status = root.querySelector<HTMLElement>('[role="status"]');
		root.querySelector<HTMLButtonElement>('[data-control-id="generate-musixmatch-token"]')?.click();
		if (!input || !status) {
			throw new Error("Provider token controls were not rendered.");
		}

		input.value = "manual-token";
		input.dispatchEvent(new Event("change", { bubbles: true }));
		expect(store.get().providers.musixmatchToken).toBe("manual-token");
		expect(status.textContent).toBe("");

		request.resolve("generated-token");
		await flushPromise(request.promise);

		expect(store.get().providers.musixmatchToken).toBe("manual-token");
		expect(input.value).toBe("manual-token");
		expect(status.textContent).toBe("");
		expect(accepted).not.toHaveBeenCalled();
	});
});
