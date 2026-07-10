import { describe, expect, test, vi } from "vitest";
import { LrclibProvider } from "../../src/lyrics/providers/LrclibProvider";
import type { ProviderContext, TrackIdentity } from "../../src/lyrics/types";

const track: TrackIdentity = {
	uri: "spotify:track:test",
	title: "Rock & Roll?",
	artist: "A/B + C",
	album: "Hits #1",
	durationMs: 7240,
	isLocal: false,
};

type TestCosmosGet = (url: string, body?: unknown, headers?: Record<string, string>) => Promise<unknown>;

const cosmosGetReturning = (payload: unknown) =>
	vi.fn(async (_url: string, _body?: unknown, _headers?: Record<string, string>): Promise<unknown> => payload);

const createContext = (
	cosmosGet: TestCosmosGet,
	fetchFn = vi.fn(async () => {
		throw new Error("fetch should not be used for LRCLIB");
	})
): ProviderContext => ({
	cosmosGet: cosmosGet as ProviderContext["cosmosGet"],
	fetch: fetchFn as unknown as typeof fetch,
	userAgent: "AuraLyrics/test",
});

describe("LrclibProvider", () => {
	test("routes the request through Cosmos with the LRCLIB user agent", async () => {
		const provider = new LrclibProvider();
		const cosmosGet = cosmosGetReturning({ syncedLyrics: "[00:01.00]Hello" });
		const fetchFn = vi.fn(async () => {
			throw new Error("fetch should not be used for LRCLIB");
		});

		await provider.fetch(track, createContext(cosmosGet, fetchFn));

		expect(cosmosGet).toHaveBeenCalledOnce();
		expect(cosmosGet).toHaveBeenCalledWith(expect.stringContaining("https://lrclib.net/api/get?"), null, {
			"User-Agent": "AuraLyrics/test",
		});
		expect(fetchFn).not.toHaveBeenCalled();
	});

	test("encodes track metadata and duration in seconds", async () => {
		const provider = new LrclibProvider();
		const cosmosGet = cosmosGetReturning({ syncedLyrics: "[00:01.00]Hello" });

		await provider.fetch(track, createContext(cosmosGet));

		const requestedUrl = new URL(String(cosmosGet.mock.calls[0]?.[0]));
		expect(requestedUrl.searchParams.get("track_name")).toBe("Rock & Roll?");
		expect(requestedUrl.searchParams.get("artist_name")).toBe("A/B + C");
		expect(requestedUrl.searchParams.get("album_name")).toBe("Hits #1");
		expect(requestedUrl.searchParams.get("duration")).toBe("7.24");
	});

	test("parses synchronized LRC from the decoded payload", async () => {
		const provider = new LrclibProvider();
		const context = createContext(cosmosGetReturning({ syncedLyrics: "[00:01.00]First\n[00:04.50]Second" }));

		const result = await provider.fetch(track, context);

		expect(result.ok).toBe(true);
		if (!result.ok || result.lyrics.type !== "line") {
			throw new Error("expected line lyrics");
		}
		expect(result.lyrics.content[0]).toMatchObject({ type: "vocal", text: "First", startTime: 1, endTime: 4.5 });
	});

	test("classifies instrumental tracks", async () => {
		const provider = new LrclibProvider();
		const context = createContext(cosmosGetReturning({ instrumental: true, syncedLyrics: "[00:01.00]Ignored" }));

		const result = await provider.fetch(track, context);

		expect(result).toEqual({ ok: false, reason: "instrumental" });
	});

	test.each([undefined, 42, "", "   "])("classifies missing or invalid synchronized lyrics as no lyrics (%p)", async (syncedLyrics) => {
		const provider = new LrclibProvider();
		const context = createContext(cosmosGetReturning({ syncedLyrics }));

		const result = await provider.fetch(track, context);

		expect(result).toEqual({ ok: false, reason: "no-lyrics" });
	});

	test("classifies a Cosmos 404 as no lyrics", async () => {
		const provider = new LrclibProvider();
		const context = createContext(async () => {
			throw { status: 404 };
		});

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "no-lyrics" });
	});

	test("classifies a Cosmos 429 as temporarily unavailable with a cooldown", async () => {
		const provider = new LrclibProvider();
		const context = createContext(async () => {
			throw { statusCode: 429 };
		});

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "temporarily-unavailable" });
		if (result.ok) {
			throw new Error("expected a temporary failure");
		}
		expect(result.cooldownMs).toBeGreaterThan(0);
	});

	test("classifies Cosmos server errors as temporarily unavailable", async () => {
		const provider = new LrclibProvider();
		const context = createContext(async () => {
			throw { response: { status: 503 } };
		});

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "temporarily-unavailable" });
	});

	test.each([
		null,
		[],
		{ instrumental: "true", syncedLyrics: "[00:01.00]Hello" },
	])("classifies malformed decoded payloads as errors (%p)", async (payload) => {
		const provider = new LrclibProvider();
		const context = createContext(cosmosGetReturning(payload));

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "error" });
	});
});
