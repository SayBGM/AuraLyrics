import { describe, expect, test, vi } from "vitest";
import { MusixmatchTokenService } from "../../src/lyrics/providers/MusixmatchTokenService";

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
		expect(cosmosGet).toHaveBeenCalledWith("https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0", null, {
			authority: "apic-desktop.musixmatch.com",
		});
	});

	test("surfaces rate-limit responses as a friendly error", async () => {
		const service = new MusixmatchTokenService(
			async () => ({
				message: {
					header: { status_code: 401 },
				},
			}),
			noFetch
		);

		await expect(service.refresh()).rejects.toThrow("rate-limited");
	});

	test("falls back to the mobile token endpoint when desktop token generation is blocked", async () => {
		const cosmosGet = vi
			.fn()
			.mockResolvedValueOnce({
				message: {
					header: { status_code: 401, hint: "captcha required" },
				},
			})
			.mockResolvedValueOnce({
				message: {
					header: { status_code: 200 },
					body: { user_token: "mobile-token" },
				},
			});
		const service = new MusixmatchTokenService(cosmosGet, noFetch);

		await expect(service.refresh()).resolves.toBe("mobile-token");
		expect(cosmosGet).toHaveBeenCalledTimes(2);
		expect(cosmosGet.mock.calls[1]?.[0]).toContain("apic-appmobile.musixmatch.com");
		expect(cosmosGet.mock.calls[1]?.[2]).toMatchObject({
			Host: "apic-appmobile.musixmatch.com",
			"X-User-Agent": expect.stringContaining("Musixmatch/"),
		});
	});

	test("reports both token endpoints when desktop and mobile generation are blocked", async () => {
		const service = new MusixmatchTokenService(
			async () => ({
				message: {
					header: { status_code: 401, hint: "captcha required" },
				},
			}),
			noFetch
		);

		await expect(service.refresh()).rejects.toThrow("desktop and mobile");
	});

	test("routes the desktop token request through a configured proxy via fetch, bypassing CosmosAsync", async () => {
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
		const realTargetUrl = "https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0";

		await expect(service.refresh("https://my-proxy.example.com/?url=")).resolves.toBe("token");
		expect(cosmosGet).not.toHaveBeenCalled();
		expect(fetchedUrls).toEqual([`https://my-proxy.example.com/?url=${encodeURIComponent(realTargetUrl)}`]);
	});

	test("keeps the real mobile host on CosmosAsync when the proxied desktop request fails", async () => {
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

		await expect(service.refresh("https://my-proxy.example.com/?url=")).resolves.toBe("mobile-token");
		expect(cosmosGet).toHaveBeenCalledTimes(1);
		expect(cosmosGet.mock.calls[0]?.[0]).toContain("apic-appmobile.musixmatch.com");
	});
});
