import { describe, expect, test, vi } from "vitest";
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

	test("fetches Korean crowd translations and merges them into subtitle lyrics", async () => {
		const urls: string[] = [];
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				urls.push(url);
				if (url.includes("crowd.track.translations.get")) {
					return {
						message: {
							body: {
								translations_list: [{ translation: { subtitle_matched_line: "Hello", description: "안녕" } }],
							},
						},
					} as T;
				}
				if (url.includes("track.richsync.get")) {
					return { message: { header: { status_code: 404 }, body: {} } } as T;
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

		const translationUrl = urls.find((url) => url.includes("crowd.track.translations.get"));
		expect(translationUrl).toContain("selected_language=ko");
		expect(translationUrl).toContain("track_id=123");
		expect(result.ok).toBe(true);
		if (!result.ok || result.lyrics.type !== "line") {
			throw new Error("expected line lyrics");
		}
		const vocal = result.lyrics.content[0];
		expect(vocal.type === "vocal" && vocal.translatedText).toBe("안녕");
	});

	test("renders LRC subtitles when richsync is unavailable", async () => {
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				if (url.includes("crowd.track.translations.get") || url.includes("track.richsync.get")) {
					throw new Error("unavailable");
				}
				return {
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": {
									message: { header: { status_code: 200 }, body: { track: { track_id: 123 } } },
								},
								"track.subtitles.get": {
									message: { body: { subtitle_list: [{ subtitle: { subtitle_body: "[00:01.00]Hello" } }] } },
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

		expect(result.ok).toBe(true);
		if (!result.ok || result.lyrics.type !== "line") {
			throw new Error("expected LRC line lyrics");
		}
		expect(result.lyrics.content[0]).toMatchObject({ type: "vocal", text: "Hello", startTime: 1 });
	});

	test("rejects a macro response matched to another track before requesting follow-ups", async () => {
		const urls: string[] = [];
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				urls.push(url);
				return {
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": {
									message: {
										header: { status_code: 200 },
										body: { track: { track_id: 123, track_name: "NOKIA", artist_name: "Another artist", track_length: 836 } },
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

		expect(result).toMatchObject({ ok: false, reason: "no-lyrics", message: "Musixmatch returned a different track." });
		expect(urls).toHaveLength(1);
	});

	test("rejects a same-titled track by a different artist", async () => {
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(): Promise<T> =>
				({
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": {
									message: {
										header: { status_code: 200 },
										body: { track: { track_id: 123, track_name: "Birthday", artist_name: "Other performer", track_length: 7 } },
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

		expect(result).toMatchObject({ ok: false, reason: "no-lyrics", message: "Musixmatch returned a different track." });
	});

	test("still returns lyrics when the translation request fails", async () => {
		const provider = new MusixmatchProvider();
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				if (url.includes("crowd.track.translations.get") || url.includes("track.richsync.get")) {
					throw new Error("translation endpoint down");
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

		expect(result.ok).toBe(true);
		if (!result.ok || result.lyrics.type !== "line") {
			throw new Error("expected line lyrics");
		}
		const vocal = result.lyrics.content[0];
		expect(vocal.type === "vocal" && vocal.translatedText).toBeUndefined();
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
			proxyBaseUrl: "https://my-proxy.example.com/?url=",
		};

		await provider.fetch(track, context);

		expect(fetchedUrls[0]).toMatch(
			/^https:\/\/my-proxy\.example\.com\/\?url=https%3A%2F%2Fapic-desktop\.musixmatch\.com%2Fws%2F1\.1%2Fmacro\.subtitles\.get/
		);
	});

	test("refreshes an expired token once on a 401 and retries with the new token", async () => {
		const provider = new MusixmatchProvider();
		const usedTokens: string[] = [];
		const refreshMusixmatchToken = vi.fn(async () => "fresh-token");
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				if (!url.includes("macro.subtitles.get")) {
					// Translation/richsync follow-ups: an empty-but-valid shape they gracefully no-op on.
					return { message: { body: {} } } as T;
				}
				const tokenParam = new URL(url, "https://apic-desktop.musixmatch.com").searchParams.get("usertoken") ?? "";
				usedTokens.push(tokenParam);
				if (tokenParam === "fresh-token") {
					return {
						message: {
							body: {
								macro_calls: {
									"matcher.track.get": {
										message: { header: { status_code: 200 }, body: { track: { track_id: 1, instrumental: false } } },
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
				}
				return {
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": { message: { header: { status_code: 401, hint: "token expired" }, body: {} } },
							},
						},
					},
				} as T;
			},
			fetch,
			userAgent: "test",
			musixmatchToken: "stale-token",
			refreshMusixmatchToken,
		};

		const result = await provider.fetch(track, context);

		expect(refreshMusixmatchToken).toHaveBeenCalledOnce();
		expect(usedTokens).toEqual(["stale-token", "fresh-token"]);
		expect(result.ok).toBe(true);
		if (!result.ok || result.lyrics.type !== "line") {
			throw new Error("expected line lyrics after token refresh");
		}
	});

	test("falls back to the cooldown result when the refreshed token still fails", async () => {
		const provider = new MusixmatchProvider();
		const refreshMusixmatchToken = vi.fn(async () => "still-bad-token");
		let calls = 0;
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(): Promise<T> => {
				calls += 1;
				return {
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": { message: { header: { status_code: 401, hint: "token expired" }, body: {} } },
							},
						},
					},
				} as T;
			},
			fetch,
			userAgent: "test",
			musixmatchToken: "stale-token",
			refreshMusixmatchToken,
		};

		const result = await provider.fetch(track, context);

		expect(refreshMusixmatchToken).toHaveBeenCalledOnce();
		expect(calls).toBe(2);
		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("expected temporary block");
		}
		expect(result.reason).toBe("temporarily-unavailable");
	});

	test("does not attempt a token refresh when no refresh callback is configured", async () => {
		const provider = new MusixmatchProvider();
		let calls = 0;
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(): Promise<T> => {
				calls += 1;
				return {
					message: {
						body: {
							macro_calls: {
								"matcher.track.get": { message: { header: { status_code: 401, hint: "token expired" }, body: {} } },
							},
						},
					},
				} as T;
			},
			fetch,
			userAgent: "test",
			musixmatchToken: "stale-token",
		};

		const result = await provider.fetch(track, context);

		expect(calls).toBe(1);
		expect(result.ok).toBe(false);
	});

	test("skips the translation and richsync follow-up requests once the signal is aborted", async () => {
		const provider = new MusixmatchProvider();
		const controller = new AbortController();
		const calledUrls: string[] = [];
		const context: ProviderContext = {
			cosmosGet: async <T = unknown>(url: string): Promise<T> => {
				calledUrls.push(url);
				if (url.includes("macro.subtitles.get")) {
					controller.abort();
					return {
						message: {
							body: {
								macro_calls: {
									"matcher.track.get": {
										message: { header: { status_code: 200 }, body: { track: { track_id: 123, instrumental: false } } },
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
				}
				throw new Error(`unexpected follow-up request: ${url}`);
			},
			fetch,
			userAgent: "test",
			musixmatchToken: "token",
			signal: controller.signal,
		};

		const result = await provider.fetch(track, context);

		expect(calledUrls).toHaveLength(1);
		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("expected the aborted follow-up to short-circuit");
		}
		expect(result.reason).toBe("error");
	});
});
