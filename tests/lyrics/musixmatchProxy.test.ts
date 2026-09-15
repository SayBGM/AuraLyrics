import { describe, expect, test, vi } from "vitest";
import { MusixmatchRequestError, requestMusixmatch } from "../../src/lyrics/providers/musixmatchProxy";
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

	test("honors an HTTP failure even when a transport omits the ok flag", async () => {
		await expect(
			requestMusixmatch({
				targetUrl,
				proxyBaseUrl: "https://my-proxy.example.com/?url=",
				cosmosGet: vi.fn(),
				cosmosHeaders,
				fetch: vi.fn(async () => ({ status: 500, json: async () => ({ message: { header: { status_code: 200 } } }) })) as unknown as typeof fetch,
			})
		).rejects.toMatchObject({ kind: "http", status: 500 });
	});

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

	test("normalizes CosmosAsync status and retry headers without exposing its raw error", async () => {
		const secretUrl = `${targetUrl}&usertoken=secret-token`;
		const cosmosGet = vi.fn(async () => {
			throw {
				message: `Request failed: ${secretUrl}`,
				response: { status: 429, headers: { "retry-after": "7" } },
			};
		});

		const error = await requestMusixmatch({
			targetUrl: secretUrl,
			cosmosGet,
			cosmosHeaders,
			fetch: vi.fn() as unknown as typeof fetch,
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(MusixmatchRequestError);
		expect(error).toMatchObject({
			kind: "rate-limit",
			status: 429,
			retryAfterMs: 7000,
			message: "Musixmatch rate limit was reached.",
		});
		expect((error as Error).message).not.toContain("secret-token");
		expect((error as Error).message).not.toContain(secretUrl);
	});

	test("re-sanitizes typed errors while preserving their classification metadata", async () => {
		const cosmosGet = vi.fn(async () => {
			throw new MusixmatchRequestError("failed for usertoken=secret-token at https://raw.example", "rate-limit", 429, 9000);
		});

		await expect(requestMusixmatch({ targetUrl, cosmosGet, cosmosHeaders, fetch: vi.fn() as unknown as typeof fetch })).rejects.toMatchObject({
			kind: "rate-limit",
			status: 429,
			retryAfterMs: 9000,
			message: "Musixmatch rate limit was reached.",
		});
	});

	test("distinguishes captcha from a generic CosmosAsync authentication failure", async () => {
		const captchaGet = vi.fn(async () => {
			throw { statusCode: 401, message: "captcha required for usertoken=secret" };
		});
		const authGet = vi.fn(async () => {
			throw { status: 401, message: "unauthorized" };
		});

		await expect(
			requestMusixmatch({ targetUrl, cosmosGet: captchaGet, cosmosHeaders, fetch: vi.fn() as unknown as typeof fetch })
		).rejects.toMatchObject({ kind: "captcha", status: 401, message: "Musixmatch captcha verification is required." });
		await expect(
			requestMusixmatch({ targetUrl, cosmosGet: authGet, cosmosHeaders, fetch: vi.fn() as unknown as typeof fetch })
		).rejects.toMatchObject({ kind: "authentication", status: 401, message: "Musixmatch authentication failed." });
	});

	test("preserves fetch HTTP status and Retry-After metadata", async () => {
		const fetchFn = vi.fn(async () => ({
			ok: false,
			status: 429,
			headers: { get: (name: string) => (name === "Retry-After" ? "5" : null) },
			json: async () => ({}),
		})) as unknown as typeof fetch;

		await expect(
			requestMusixmatch({
				targetUrl,
				proxyBaseUrl: "https://proxy.test/?url=",
				cosmosGet: vi.fn(),
				cosmosHeaders,
				fetch: fetchFn,
			})
		).rejects.toMatchObject({ kind: "rate-limit", status: 429, retryAfterMs: 5000 });
	});

	test("uses a proxy error body's captcha hint without trusting its status", async () => {
		const fetchFn = vi.fn(async () => ({
			ok: false,
			status: 401,
			headers: { get: () => null },
			json: async () => ({
				message: { header: { status_code: 200, hint: "captcha required for usertoken=secret-token", mode: "captcha" } },
			}),
		})) as unknown as typeof fetch;

		await expect(
			requestMusixmatch({
				targetUrl,
				proxyBaseUrl: "https://proxy.test/?url=",
				cosmosGet: vi.fn(),
				cosmosHeaders,
				fetch: fetchFn,
			})
		).rejects.toMatchObject({
			kind: "captcha",
			status: 401,
			message: "Musixmatch captcha verification is required.",
		});
	});

	test("does not invoke a transport when its signal was already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const cosmosGet = vi.fn(async () => ({ ok: true }));

		await expect(
			requestMusixmatch({
				targetUrl,
				cosmosGet,
				cosmosHeaders,
				fetch: vi.fn() as unknown as typeof fetch,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ kind: "aborted" });
		expect(cosmosGet).not.toHaveBeenCalled();
	});

	test("classifies malformed proxy JSON as an invalid response", async () => {
		const fetchFn = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => {
				throw new SyntaxError("raw response includes secret-token");
			},
		})) as unknown as typeof fetch;

		await expect(
			requestMusixmatch({
				targetUrl,
				proxyBaseUrl: "https://proxy.test/?url=",
				cosmosGet: vi.fn(),
				cosmosHeaders,
				fetch: fetchFn,
			})
		).rejects.toMatchObject({ kind: "invalid-response", status: 200, message: "Musixmatch returned an invalid response." });
	});
});
