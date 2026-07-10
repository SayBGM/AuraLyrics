import { describe, expect, test } from "vitest";
import { LyricsCache } from "../../src/lyrics/LyricsCache";
import { LyricsService } from "../../src/lyrics/LyricsService";
import { ProviderRegistry } from "../../src/lyrics/providers/ProviderRegistry";
import type { LyricsDocument, LyricsProvider, ProviderContext, ProviderId, TrackIdentity } from "../../src/lyrics/types";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

const track: TrackIdentity = {
	uri: "spotify:track:retry",
	title: "Retry",
	artist: "Artist",
	album: "Album",
	durationMs: 10000,
	isLocal: false,
};

const context: ProviderContext = {
	cosmosGet: async <T = unknown>() => ({}) as T,
	fetch,
	userAgent: "test",
};

const lineLyrics = (text: string) => ({
	type: "line" as const,
	startTime: 0,
	endTime: 4,
	content: [{ type: "vocal" as const, text, startTime: 0, endTime: 4, oppositeAligned: false }],
});

describe("LyricsService", () => {
	test("temporarily skips a blocked provider and falls back without retrying it", async () => {
		let now = 1000;
		let blockedAttempts = 0;
		const blockedProvider: LyricsProvider = {
			id: "musixmatch",
			supports: () => true,
			fetch: async () => {
				blockedAttempts += 1;
				return { ok: false, reason: "temporarily-unavailable", message: "Musixmatch captcha required.", cooldownMs: 60_000 };
			},
		};
		const fallbackProvider: LyricsProvider = {
			id: "lrclib",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Fallback") }),
		};
		const settings = {
			...DEFAULT_SETTINGS,
			providers: {
				...DEFAULT_SETTINGS.providers,
				order: ["musixmatch", "lrclib", "spotify"] satisfies ProviderId[],
			},
		};
		const service = new LyricsService(new ProviderRegistry([blockedProvider, fallbackProvider]), new LyricsCache(), () => context, {
			now: () => now,
			retryDelayMs: 0,
		});

		const first = await service.load(track, settings, true);
		const second = await service.load({ ...track, uri: "spotify:track:second" }, settings, true);
		now += 60_001;
		const third = await service.load({ ...track, uri: "spotify:track:third" }, settings, true);

		expect(first.status).toBe("ready");
		expect(second.status).toBe("ready");
		expect(third.status).toBe("ready");
		expect(blockedAttempts).toBe(2);
	});

	test("reports cache and provider attempt diagnostics for fallback loads", async () => {
		const firstProvider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: false, reason: "no-lyrics", message: "Spotify has no synced lyrics." }),
		};
		const fallbackProvider: LyricsProvider = {
			id: "lrclib",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Fallback") }),
		};
		const service = new LyricsService(new ProviderRegistry([firstProvider, fallbackProvider]), new LyricsCache(), () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, false);

		expect(state.status).toBe("ready");
		if (state.status !== "ready") {
			throw new Error("expected ready");
		}
		expect(state.source).toBe("network");
		expect(state.diagnostics.cache).toEqual({ status: "miss", primaryProvider: "spotify" });
		expect(state.diagnostics.attempts.map((attempt) => `${attempt.provider}:${attempt.status}`)).toEqual(["spotify:no-lyrics", "lrclib:success"]);
	});

	test("reports cache hit diagnostics without fetching providers", async () => {
		const cache = new LyricsCache();
		cache.set(track.uri, lineLyrics("Cached"), "spotify");
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => {
				throw new Error("should not fetch when cache is valid");
			},
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, false);

		expect(state.status).toBe("ready");
		if (state.status !== "ready") {
			throw new Error("expected ready");
		}
		expect(state.source).toBe("cache");
		expect(state.diagnostics.cache).toEqual({ status: "hit", provider: "spotify", primaryProvider: "spotify" });
		expect(state.diagnostics.attempts).toEqual([]);
	});

	test("caches lyrics only when the first enabled provider succeeds", async () => {
		const cache = new LyricsCache();
		const firstProvider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: false, reason: "no-lyrics" }),
		};
		const fallbackProvider: LyricsProvider = {
			id: "lrclib",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Fallback") }),
		};
		const service = new LyricsService(new ProviderRegistry([firstProvider, fallbackProvider]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, true);

		expect(state.status).toBe("ready");
		if (state.status !== "ready") {
			throw new Error("expected ready");
		}
		expect(state.provider).toBe("lrclib");
		expect(cache.get(track.uri)).toBeUndefined();
	});

	test("uses cached lyrics only when they came from the current first enabled provider", async () => {
		const cache = new LyricsCache();
		cache.set(track.uri, lineLyrics("Fallback cache"), "lrclib");
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Primary") }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS);

		expect(state.status).toBe("ready");
		if (state.status !== "ready") {
			throw new Error("expected ready");
		}
		expect(state.provider).toBe("spotify");
		expect(cache.get(track.uri)?.provider).toBe("spotify");
	});

	test("rebuilds cached interludes with the current threshold before rendering", async () => {
		const staleCachedLyrics: LyricsDocument = {
			type: "syllable",
			startTime: 14.82,
			endTime: 27.43,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 14.82,
						endTime: 19.539,
						syllables: [{ text: "아른아른", startTime: 14.82, endTime: 19.539, isPartOfWord: false }],
					},
				},
				{ type: "interlude", startTime: 19.539, endTime: 21.38 },
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 21.63,
						endTime: 27.43,
						syllables: [{ text: "포근해진", startTime: 21.63, endTime: 27.43, isPartOfWord: false }],
					},
				},
			],
		};
		const cache = new LyricsCache();
		cache.set(track.uri, staleCachedLyrics, "spotify");
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => {
				throw new Error("should not fetch when cache is valid");
			},
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS);

		expect(state.status).toBe("ready");
		if (state.status !== "ready" || state.lyrics.type !== "syllable") {
			throw new Error("expected cached syllable lyrics");
		}
		expect(state.lyrics.content.some((item) => item.type === "interlude" && item.startTime === 19.539)).toBe(false);
	});

	test("caches the pre-split syllable document but returns the Hangul-split version", async () => {
		const cache = new LyricsCache();
		const wordLevelLyrics: LyricsDocument = {
			type: "syllable",
			startTime: 0,
			endTime: 4.719,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 4.719,
						syllables: [{ text: "아른아른", startTime: 0, endTime: 4.719, isPartOfWord: false }],
					},
				},
			],
		};
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: wordLevelLyrics }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, true);

		expect(state.status).toBe("ready");
		if (state.status !== "ready" || state.lyrics.type !== "syllable") {
			throw new Error("expected ready syllable lyrics");
		}
		const returnedItem = state.lyrics.content[0];
		if (returnedItem.type !== "vocal") {
			throw new Error("expected vocal content");
		}
		expect(returnedItem.lead.syllables.length).toBeGreaterThan(1);
		expect(returnedItem.lead.syllables.every((syllable) => [...syllable.text].length === 1)).toBe(true);

		const cachedLyrics = cache.get(track.uri)?.lyrics;
		if (!cachedLyrics || cachedLyrics.type !== "syllable") {
			throw new Error("expected cached syllable lyrics");
		}
		const cachedItem = cachedLyrics.content[0];
		if (cachedItem.type !== "vocal") {
			throw new Error("expected cached vocal content");
		}
		expect(cachedItem.lead.syllables).toEqual([{ text: "아른아른", startTime: 0, endTime: 4.719, isPartOfWord: false }]);
	});

	test("returns ready lyrics when cache persistence fails after provider success", async () => {
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({
				ok: true,
				lyrics: lineLyrics("Still ready"),
			}),
		};
		const cache = new LyricsCache({
			get: () => null,
			set: () => {
				throw new Error("quota exceeded");
			},
		});
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, true);

		expect(state.status).toBe("ready");
		if (state.status !== "ready") {
			throw new Error("expected ready");
		}
		expect(state.provider).toBe("spotify");
	});

	test("retries transient provider failures before showing an error", async () => {
		let attempts = 0;
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => {
				attempts += 1;
				if (attempts < 3) {
					return { ok: false, reason: "error", message: "temporary" };
				}
				return {
					ok: true,
					lyrics: lineLyrics("Recovered"),
				};
			},
		};
		const service = new LyricsService(new ProviderRegistry([provider]), new LyricsCache(), () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, true);

		expect(attempts).toBe(3);
		expect(state.status).toBe("ready");
		if (state.status !== "ready") {
			throw new Error("expected ready");
		}
		expect(state.provider).toBe("spotify");
	});

	test("returns error after retry budget is exhausted", async () => {
		let attempts = 0;
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => {
				attempts += 1;
				return { ok: false, reason: "error", message: `failure ${attempts}` };
			},
		};
		const service = new LyricsService(new ProviderRegistry([provider]), new LyricsCache(), () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, true);

		expect(attempts).toBe(3);
		expect(state.status).toBe("error");
		if (state.status !== "error") {
			throw new Error("expected error");
		}
		expect(state.message).toContain("failure 3");
	});

	test("falls back after an instrumental provider result", async () => {
		const instrumental: LyricsProvider = { id: "spotify", supports: () => true, fetch: async () => ({ ok: false, reason: "instrumental" }) };
		const fallback: LyricsProvider = { id: "lrclib", supports: () => true, fetch: async () => ({ ok: true, lyrics: lineLyrics("Fallback") }) };
		const service = new LyricsService(new ProviderRegistry([instrumental, fallback]), new LyricsCache(), () => context, { retryDelayMs: 0 });
		const state = await service.load(track, DEFAULT_SETTINGS, true);
		expect(state.status).toBe("ready");
	});

	test("preserves instrumental when no fallback provider has lyrics", async () => {
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: false, reason: "instrumental" }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), new LyricsCache(), () => context, {
			maxAttempts: 1,
			retryDelayMs: 0,
		});

		const state = await service.load(track, DEFAULT_SETTINGS, true);

		expect(state).toMatchObject({ status: "empty", reason: "instrumental" });
	});

	test("does not report temporary provider unavailability as no lyrics", async () => {
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: false, reason: "temporarily-unavailable", message: "rate limited", cooldownMs: 60000 }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), new LyricsCache(), () => context, {
			maxAttempts: 1,
			retryDelayMs: 0,
		});

		const state = await service.load(track, DEFAULT_SETTINGS, true);

		expect(state).toMatchObject({ status: "error" });
		if (state.status !== "error") throw new Error("expected error");
		expect(state.message).toContain("rate limited");
	});

	test("removes invalid cached lyrics and falls back to the provider", async () => {
		const cache = new LyricsCache();
		cache.set(track.uri, { ...lineLyrics("Invalid"), endTime: 0 }, "spotify");
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: false, reason: "no-lyrics" }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, {
			maxAttempts: 1,
			retryDelayMs: 0,
		});

		const state = await service.load(track, DEFAULT_SETTINGS, false);

		expect(state).toMatchObject({ status: "empty", reason: "no-lyrics" });
		expect(cache.get(track.uri)).toBeUndefined();
	});

	test("manual refresh bypasses a provider cooldown", async () => {
		let calls = 0;
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => {
				calls += 1;
				return calls === 1 ? { ok: false, reason: "temporarily-unavailable", cooldownMs: 60000 } : { ok: true, lyrics: lineLyrics("Recovered") };
			},
		};
		const service = new LyricsService(new ProviderRegistry([provider]), new LyricsCache(), () => context, { retryDelayMs: 0 });
		await service.load(track, DEFAULT_SETTINGS, true);
		service.refreshCooldowns();
		const state = await service.load({ ...track, uri: "spotify:track:refresh" }, DEFAULT_SETTINGS, true);
		expect(state.status).toBe("ready");
	});
});
