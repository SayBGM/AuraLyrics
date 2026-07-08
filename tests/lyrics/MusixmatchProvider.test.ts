import { describe, expect, test } from "vitest";
import { MusixmatchProvider } from "../../src/lyrics/providers/MusixmatchProvider";
import type { ProviderContext, TrackIdentity } from "../../src/lyrics/types";

const track: TrackIdentity = {
	uri: "spotify:track:test",
	title: "Birthday",
	artist: "Singer",
	album: "Album",
	durationMs: 7240,
	isLocal: false,
};

describe("MusixmatchProvider", () => {
	test("classifies captcha responses as temporarily unavailable", async () => {
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(): Promise<T> =>
				({
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": {
									message: {
										header: { status_code: 401, hint: "captcha required", mode: "captcha" },
										body: {},
									},
								},
							},
						},
					},
				}) as T,
			fetch,
			userAgent: "test",
			musixmatchToken: "token",
		};

		const result = await provider.fetch(track, context);

		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("expected temporary block");
		}
		expect(result.reason).toBe("temporarily-unavailable");
		expect(result.message).toContain("captcha");
		expect(result.cooldownMs).toBeGreaterThan(0);
	});

	test("prefers richsync word timings before subtitle line lyrics", async () => {
		const urls: string[] = [];
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				urls.push(url);
				if (url.includes("track.richsync.get")) {
					return {
						message: {
							header: { status_code: 200 },
							body: {
								richsync: {
									richsync_body: JSON.stringify([{ ts: 1, te: 3, l: [{ c: "Hello", o: 0 }], x: "Hello" }]),
								},
							},
						},
					} as T;
				}
				return {
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": {
									message: {
										header: { status_code: 200 },
										body: { track: { track_id: 123, has_subtitles: true, instrumental: false } },
									},
								},
								"track.subtitles.get": {
									message: {
										body: {
											subtitle_list: [{ subtitle: { subtitle_body: JSON.stringify([{ text: "Hello", time: { total: 1 } }]) } }],
										},
									},
								},
							},
						},
					},
				} as T;
			},
			fetch,
			userAgent: "test",
			musixmatchToken: "token",
		};

		const result = await provider.fetch(track, context);

		expect(urls.some((url) => url.includes("track.richsync.get"))).toBe(true);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("expected lyrics");
		}
		expect(result.lyrics.type).toBe("syllable");
	});

	test("uses the official Musixmatch host by default", async () => {
		const urls: string[] = [];
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				urls.push(url);
				return { message: { body: {} } } as T;
			},
			fetch,
			userAgent: "test",
			musixmatchToken: "token",
		};

		await provider.fetch(track, context);

		expect(urls[0]).toMatch(/^https:\/\/apic-desktop\.musixmatch\.com\/ws\/1\.1\/macro\.subtitles\.get\?/);
	});

	test("routes requests through a configured proxy via fetch, bypassing CosmosAsync entirely", async () => {
		const provider = new MusixmatchProvider();
		const fetchedUrls: string[] = [];
		const context: ProviderContext = {
			cosmosGet: async () => {
				throw new Error("cosmosGet should not be used when a proxy is configured");
			},
			fetch: (async (url: string) => {
				fetchedUrls.push(url.toString());
				return { json: async () => ({ message: { body: {} } }) } as Response;
			}) as typeof fetch,
			userAgent: "test",
			musixmatchToken: "token",
			musixmatchProxyBaseUrl: "https://my-proxy.example.com/?url=",
		};

		await provider.fetch(track, context);

		expect(fetchedUrls[0]).toMatch(
			/^https:\/\/my-proxy\.example\.com\/\?url=https%3A%2F%2Fapic-desktop\.musixmatch\.com%2Fws%2F1\.1%2Fmacro\.subtitles\.get/
		);
	});
});
