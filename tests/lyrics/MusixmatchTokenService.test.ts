import { describe, expect, test, vi } from "vitest";
import { MusixmatchTokenService } from "../../src/lyrics/providers/MusixmatchTokenService";

describe("MusixmatchTokenService", () => {
	test("returns the generated user token from Musixmatch", async () => {
		const cosmosGet = vi.fn(async () => ({
			message: {
				header: { status_code: 200 },
				body: { user_token: "token" },
			},
		}));
		const service = new MusixmatchTokenService(cosmosGet);

		await expect(service.refresh()).resolves.toBe("token");
		expect(cosmosGet).toHaveBeenCalledWith("https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0", null, {
			authority: "apic-desktop.musixmatch.com",
		});
	});

	test("surfaces rate-limit responses as a friendly error", async () => {
		const service = new MusixmatchTokenService(async () => ({
			message: {
				header: { status_code: 401 },
			},
		}));

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
		const service = new MusixmatchTokenService(cosmosGet);

		await expect(service.refresh()).resolves.toBe("mobile-token");
		expect(cosmosGet).toHaveBeenCalledTimes(2);
		expect(cosmosGet.mock.calls[1]?.[0]).toContain("apic-appmobile.musixmatch.com");
		expect(cosmosGet.mock.calls[1]?.[2]).toMatchObject({
			Host: "apic-appmobile.musixmatch.com",
			"X-User-Agent": expect.stringContaining("Musixmatch/"),
		});
	});

	test("reports both token endpoints when desktop and mobile generation are blocked", async () => {
		const service = new MusixmatchTokenService(async () => ({
			message: {
				header: { status_code: 401, hint: "captcha required" },
			},
		}));

		await expect(service.refresh()).rejects.toThrow("desktop and mobile");
	});
});
