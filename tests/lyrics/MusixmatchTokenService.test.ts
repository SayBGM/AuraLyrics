import { describe, expect, test, vi } from "vitest";
import { MusixmatchTokenService } from "../../src/lyrics/providers/MusixmatchTokenService";
import { MusixmatchRequestError } from "../../src/lyrics/providers/musixmatchProxy";

const noFetch: typeof fetch = vi.fn(async () => {
	throw new Error("fetch should not be called");
}) as typeof fetch;

describe("MusixmatchTokenService", () => {
	test("returns the generated user token from Musixmatch", async () => {
		const cosmosGet = vi.fn(async () => ({
			message: {
				header: { status_code: 200 },
				body: { user_token: "token" },
			},
		}));
		const service = new MusixmatchTokenService(cosmosGet, noFetch);

		await expect(service.refresh()).resolves.toBe("token");
		expect(cosmosGet).toHaveBeenCalledWith(
			"https://apic-appmobile.musixmatch.com/ws/1.1/token.get?app_id=mac-ios-v2.0",
			null,
			expect.objectContaining({
				Host: "apic-appmobile.musixmatch.com",
			})
		);
	});

	test("preserves authentication failures as typed errors", async () => {
		const service = new MusixmatchTokenService(
			async () => ({
				message: {
					header: { status_code: 401 },
				},
			}),
			noFetch
		);

		await expect(service.refresh()).rejects.toMatchObject({
			name: "MusixmatchRequestError",
			kind: "authentication",
			status: 401,
		});
	});

	test("uses only the mobile token endpoint", async () => {
		const cosmosGet = vi.fn().mockResolvedValueOnce({
			message: {
				header: { status_code: 200 },
				body: { user_token: "mobile-token" },
			},
		});
		const service = new MusixmatchTokenService(cosmosGet, noFetch);

		await expect(service.refresh()).resolves.toBe("mobile-token");
		expect(cosmosGet).toHaveBeenCalledTimes(1);
		expect(cosmosGet.mock.calls[0]?.[0]).toContain("apic-appmobile.musixmatch.com");
		expect(cosmosGet.mock.calls[0]?.[2]).toMatchObject({
			Host: "apic-appmobile.musixmatch.com",
			"X-User-Agent": expect.stringContaining("Musixmatch/"),
		});
	});

	test("distinguishes captcha responses and preserves retry timing", async () => {
		const service = new MusixmatchTokenService(
			async () => ({
				message: {
					header: { status_code: 401, hint: "captcha required", retry_after: 12 },
				},
			}),
			noFetch
		);

		await expect(service.refresh()).rejects.toMatchObject({
			kind: "captcha",
			status: 401,
			retryAfterMs: 12_000,
		});
	});

	test("distinguishes rate-limit responses from authentication failures", async () => {
		const service = new MusixmatchTokenService(
			async () => ({
				message: {
					header: { status_code: 429, hint: "too many requests", retry_after: "3" },
				},
			}),
			noFetch
		);

		await expect(service.refresh()).rejects.toMatchObject({
			kind: "rate-limit",
			status: 429,
			retryAfterMs: 3000,
		});
	});

	test("routes the mobile token request through a configured proxy via fetch", async () => {
		const cosmosGet = vi.fn(async () => {
			throw new Error("cosmosGet should not be used for the proxied desktop endpoint");
		});
		const fetchedUrls: string[] = [];
		const fetchFn: typeof fetch = (async (url: string) => {
			fetchedUrls.push(url.toString());
			return {
				json: async () => ({
					message: {
						header: { status_code: 200 },
						body: { user_token: "token" },
					},
				}),
			} as Response;
		}) as typeof fetch;
		const service = new MusixmatchTokenService(cosmosGet, fetchFn);
		const realTargetUrl = "https://apic-appmobile.musixmatch.com/ws/1.1/token.get?app_id=mac-ios-v2.0";

		await expect(service.refresh("https://my-proxy.example.com/?url=")).resolves.toBe("token");
		expect(cosmosGet).not.toHaveBeenCalled();
		expect(fetchedUrls).toEqual([`https://my-proxy.example.com/?url=${encodeURIComponent(realTargetUrl)}`]);
	});

	test("surfaces custom proxy token failure", async () => {
		const cosmosGet = vi.fn(async (_url: string) => ({
			message: {
				header: { status_code: 200 },
				body: { user_token: "mobile-token" },
			},
		}));
		const fetchFn: typeof fetch = (async () => {
			throw new Error("proxy unreachable");
		}) as typeof fetch;
		const service = new MusixmatchTokenService(cosmosGet, fetchFn);

		await expect(service.refresh("https://my-proxy.example.com/?url=")).rejects.toMatchObject({
			kind: "network",
			message: "Musixmatch network request failed.",
		});
		expect(cosmosGet).not.toHaveBeenCalled();
	});

	test("never exposes an upstream token or URL in errors", async () => {
		const secret = "secret-user-token";
		const rawUrl = `https://example.test/?usertoken=${secret}`;
		const service = new MusixmatchTokenService(async () => {
			throw new Error(`request to ${rawUrl} failed`);
		}, noFetch);

		const error = await service.refresh().catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(MusixmatchRequestError);
		expect((error as Error).message).toBe("Musixmatch network request failed.");
		expect((error as Error).message).not.toContain(secret);
		expect((error as Error).message).not.toContain(rawUrl);
	});

	test("shares an in-flight token request and permits a later refresh", async () => {
		let resolveRequest: ((response: { message: { header: { status_code: number }; body: { user_token: string } } }) => void) | undefined;
		const cosmosGet = vi.fn(
			() =>
				new Promise<{ message: { header: { status_code: number }; body: { user_token: string } } }>((resolve) => {
					resolveRequest = resolve;
				})
		);
		const service = new MusixmatchTokenService(cosmosGet, noFetch);

		const first = service.refresh();
		const second = service.refresh();
		expect(cosmosGet).toHaveBeenCalledOnce();
		resolveRequest?.({ message: { header: { status_code: 200 }, body: { user_token: "shared-token" } } });
		await expect(Promise.all([first, second])).resolves.toEqual(["shared-token", "shared-token"]);

		const third = service.refresh();
		expect(cosmosGet).toHaveBeenCalledTimes(2);
		resolveRequest?.({ message: { header: { status_code: 200 }, body: { user_token: "new-token" } } });
		await expect(third).resolves.toBe("new-token");
	});
});
