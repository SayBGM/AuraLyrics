import { describe, expect, test, vi } from "vitest";
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

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

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

	test("keeps provider-mismatch diagnostics when the primary provider replaces a fallback cache entry", async () => {
		const cache = new LyricsCache();
		cache.set(track.uri, lineLyrics("Fallback cache"), "lrclib");
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Primary") }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS);

		expect(state).toMatchObject({
			status: "ready",
			source: "network",
			diagnostics: {
				cache: { status: "provider-mismatch", provider: "lrclib", primaryProvider: "spotify" },
			},
		});
	});

	test("uses the first enabled provider that supports the track as the cache primary", async () => {
		const cache = new LyricsCache();
		cache.set(track.uri, lineLyrics("Supported cache"), "lrclib");
		const unsupported: LyricsProvider = {
			id: "spotify",
			supports: () => false,
			fetch: async () => {
				throw new Error("unsupported provider must not fetch");
			},
		};
		const supported: LyricsProvider = {
			id: "lrclib",
			supports: () => true,
			fetch: async () => {
				throw new Error("valid cache must avoid network fetch");
			},
		};
		const service = new LyricsService(new ProviderRegistry([unsupported, supported]), cache, () => context, { retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS);

		expect(state).toMatchObject({
			status: "ready",
			source: "cache",
			provider: "lrclib",
			diagnostics: { cache: { status: "hit", provider: "lrclib", primaryProvider: "lrclib" } },
		});
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

	test("removes malformed static cached lyrics and falls back to the provider", async () => {
		const cache = new LyricsCache();
		cache.set(track.uri, { type: "static", lines: null } as unknown as LyricsDocument, "spotify");
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Recovered") }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, {
			maxAttempts: 1,
			retryDelayMs: 0,
		});

		const state = await service.load(track, DEFAULT_SETTINGS, false);

		expect(state).toMatchObject({ status: "ready", source: "network" });
		if (state.status !== "ready") throw new Error("expected ready");
		expect(state.lyrics).toMatchObject({ type: "line" });
	});

	test("removes malformed timed cached lyrics and falls back to the provider", async () => {
		const cache = new LyricsCache();
		cache.set(
			track.uri,
			{ ...lineLyrics("Invalid"), content: [{ ...lineLyrics("Invalid").content[0], text: 42 }] } as unknown as LyricsDocument,
			"spotify"
		);
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Recovered") }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { maxAttempts: 1, retryDelayMs: 0 });

		const state = await service.load(track, DEFAULT_SETTINGS, false);

		expect(state).toMatchObject({ status: "ready", source: "network" });
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

	test("does not store or return a pipeline success superseded before the facade resumes", async () => {
		const firstTrack = { ...track, uri: "spotify:track:first" };
		const nextTrack = { ...track, uri: "spotify:track:next" };
		const cache = new LyricsCache();
		let service: LyricsService;
		let supersedingLoad: ReturnType<LyricsService["load"]> | undefined;
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: (requestedTrack) => {
				if (requestedTrack.uri !== firstTrack.uri) {
					return Promise.resolve({ ok: false, reason: "no-lyrics" });
				}
				return {
					// biome-ignore lint/suspicious/noThenProperty: This controlled thenable fixes the microtask order at the facade race boundary.
					then: (resolve: (value: { ok: true; lyrics: ReturnType<typeof lineLyrics> }) => void) => {
						resolve({ ok: true, lyrics: lineLyrics("Stale success") });
						queueMicrotask(() => {
							supersedingLoad = service.load(nextTrack, DEFAULT_SETTINGS, true);
						});
					},
				} as unknown as ReturnType<LyricsProvider["fetch"]>;
			},
		};
		service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { maxAttempts: 1, retryDelayMs: 0 });

		const state = await service.load(firstTrack, DEFAULT_SETTINGS, true);

		expect(state).toEqual({ status: "idle" });
		expect(cache.get(firstTrack.uri)).toBeUndefined();
		await supersedingLoad;
	});

	test("a local-track load invalidates a pending network result before it can be cached", async () => {
		const pending = deferred<ReturnType<typeof lineLyrics>>();
		const firstTrack = { ...track, uri: "spotify:track:pending-before-local" };
		const localTrack = { ...track, uri: "spotify:local:aura:album:track:1", isLocal: true };
		const cache = new LyricsCache();
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: await pending.promise }),
		};
		const service = new LyricsService(new ProviderRegistry([provider]), cache, () => context, { maxAttempts: 1, retryDelayMs: 0 });

		const staleLoad = service.load(firstTrack, DEFAULT_SETTINGS);
		await expect(service.load(localTrack, DEFAULT_SETTINGS)).resolves.toEqual({ status: "empty", track: localTrack, reason: "unsupported-local" });
		pending.resolve(lineLyrics("Stale after local"));

		await expect(staleLoad).resolves.toEqual({ status: "idle" });
		expect(cache.get(firstTrack.uri)).toBeUndefined();
	});

	test("invalidate prevents a pending network result from reaching the cache", async () => {
		const pending = deferred<void>();
		const pendingTrack = { ...track, uri: "spotify:track:pending-before-invalidate" };
		const cache = new LyricsCache();
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => {
				await pending.promise;
				return { ok: false, reason: "no-lyrics" };
			},
		};
		const fallbackFetch = vi.fn(async () => ({ ok: true as const, lyrics: lineLyrics("Fallback must not run") }));
		const fallback: LyricsProvider = { id: "lrclib", supports: () => true, fetch: fallbackFetch };
		const service = new LyricsService(new ProviderRegistry([provider, fallback]), cache, () => context, { maxAttempts: 1, retryDelayMs: 0 });

		const staleLoad = service.load(pendingTrack, DEFAULT_SETTINGS);
		service.invalidate();
		pending.resolve();

		await expect(staleLoad).resolves.toEqual({ status: "idle" });
		expect(fallbackFetch).not.toHaveBeenCalled();
		expect(cache.get(pendingTrack.uri)).toBeUndefined();
	});
});
