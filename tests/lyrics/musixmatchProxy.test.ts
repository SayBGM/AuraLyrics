import { describe, expect, test, vi } from "vitest";
import { requestMusixmatch } from "../../src/lyrics/providers/musixmatchProxy";
import { applyUrlProxy } from "../../src/lyrics/providers/urlProxy";

describe("applyUrlProxy", () => {
	test("returns the target URL unchanged when no proxy is configured", () => {
		expect(applyUrlProxy("https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0")).toBe(
			"https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0"
		);
	});

	test("appends the URL-encoded target after the proxy base URL", () => {
		const targetUrl = "https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0";

		expect(applyUrlProxy(targetUrl, "https://my-proxy.example.com/?url=")).toBe(`https://my-proxy.example.com/?url=${encodeURIComponent(targetUrl)}`);
	});
});

describe("requestMusixmatch", () => {
	const targetUrl = "https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0";
	const cosmosHeaders = { authority: "apic-desktop.musixmatch.com" };

	test("uses cosmosGet directly with the given headers when no proxy is configured", async () => {
		const cosmosGet = vi.fn(async () => ({ ok: true }));
		const fetchFn = vi.fn();

		const result = await requestMusixmatch({
			targetUrl,
			cosmosGet,
			cosmosHeaders,
			fetch: fetchFn as unknown as typeof fetch,
		});

		expect(result).toEqual({ ok: true });
		expect(cosmosGet).toHaveBeenCalledWith(targetUrl, null, cosmosHeaders);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	test("bypasses cosmosGet and fetches the proxy URL directly when a proxy is configured", async () => {
		const cosmosGet = vi.fn();
		const fetchFn = vi.fn(async () => ({ json: async () => ({ ok: true }) }) as Response);

		const result = await requestMusixmatch({
			targetUrl,
			proxyBaseUrl: "https://my-proxy.example.com/?url=",
			cosmosGet,
			cosmosHeaders,
			fetch: fetchFn as unknown as typeof fetch,
		});

		expect(result).toEqual({ ok: true });
		expect(cosmosGet).not.toHaveBeenCalled();
		expect(fetchFn).toHaveBeenCalledWith(`https://my-proxy.example.com/?url=${encodeURIComponent(targetUrl)}`, { headers: cosmosHeaders });
	});
});
