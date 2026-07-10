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

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const jsonResponse = (payload: unknown, status = 200): Response =>
	({
		ok: status >= 200 && status < 300,
		status,
		json: vi.fn(async (): Promise<unknown> => payload),
	}) as unknown as Response;

const fetchReturning = (payload: unknown, status = 200) =>
	vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => jsonResponse(payload, status));

const createContext = (
	fetchFn: TestFetch,
	cosmosGet = vi.fn(async (): Promise<unknown> => {
		throw new Error("cosmosGet should not be used for LRCLIB");
	})
): ProviderContext => ({
	cosmosGet: cosmosGet as ProviderContext["cosmosGet"],
	fetch: fetchFn as typeof fetch,
	userAgent: "AuraLyrics/test",
});

describe("LrclibProvider", () => {
	test("routes the request through fetch with the LRCLIB user agent and never uses Cosmos", async () => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning({ syncedLyrics: "[00:01.00]Hello" });
		const cosmosGet = vi.fn(async (): Promise<unknown> => {
			throw new Error("cosmosGet should not be used for LRCLIB");
		});

		await provider.fetch(track, createContext(fetchFn, cosmosGet));

		expect(fetchFn).toHaveBeenCalledOnce();
		expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining("https://lrclib.net/api/get?"), {
			headers: { "x-user-agent": "AuraLyrics/test" },
		});
		expect(cosmosGet).not.toHaveBeenCalled();
	});

	test("encodes track metadata and duration in seconds", async () => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning({ syncedLyrics: "[00:01.00]Hello" });

		await provider.fetch(track, createContext(fetchFn));

		const requestedUrl = new URL(String(fetchFn.mock.calls[0]?.[0]));
		expect(requestedUrl.searchParams.get("track_name")).toBe("Rock & Roll?");
		expect(requestedUrl.searchParams.get("artist_name")).toBe("A/B + C");
		expect(requestedUrl.searchParams.get("album_name")).toBe("Hits #1");
		expect(requestedUrl.searchParams.get("duration")).toBe("7.24");
	});

	test("parses synchronized LRC from the decoded payload", async () => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning({ syncedLyrics: "[00:01.00]First\n[00:04.50]Second" }));

		const result = await provider.fetch(track, context);

		expect(result.ok).toBe(true);
		if (!result.ok || result.lyrics.type !== "line") {
			throw new Error("expected line lyrics");
		}
		expect(result.lyrics.content[0]).toMatchObject({ type: "vocal", text: "First", startTime: 1, endTime: 4.5 });
	});

	test("classifies instrumental tracks", async () => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning({ instrumental: true, syncedLyrics: "[00:01.00]Ignored" }));

		const result = await provider.fetch(track, context);

		expect(result).toEqual({ ok: false, reason: "instrumental" });
	});

	test.each([undefined, null, "", "   "])("classifies missing or empty synchronized lyrics as no lyrics (%p)", async (syncedLyrics) => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning({ syncedLyrics }));

		const result = await provider.fetch(track, context);

		expect(result).toEqual({ ok: false, reason: "no-lyrics" });
	});

	test("classifies non-string synchronized lyrics as a schema error", async () => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning({ syncedLyrics: 42 }));

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "error" });
	});

	test("classifies a fetch 404 response as no lyrics", async () => {
		const provider = new LrclibProvider();

		const result = await provider.fetch(track, createContext(fetchReturning({}, 404)));

		expect(result).toMatchObject({ ok: false, reason: "no-lyrics" });
	});

	test("classifies a fetch 429 response as temporarily unavailable with a five-minute cooldown", async () => {
		const provider = new LrclibProvider();

		const result = await provider.fetch(track, createContext(fetchReturning({}, 429)));

		expect(result).toMatchObject({ ok: false, reason: "temporarily-unavailable", cooldownMs: 1000 * 60 * 5 });
	});

	test("classifies fetch server errors as temporarily unavailable", async () => {
		const provider = new LrclibProvider();

		const result = await provider.fetch(track, createContext(fetchReturning({}, 503)));

		expect(result).toMatchObject({ ok: false, reason: "temporarily-unavailable" });
	});

	test("classifies other non-ok fetch responses as errors", async () => {
		const provider = new LrclibProvider();

		const result = await provider.fetch(track, createContext(fetchReturning({}, 400)));

		expect(result).toMatchObject({ ok: false, reason: "error" });
	});

	test("classifies rejected fetch requests as errors", async () => {
		const provider = new LrclibProvider();
		const fetchFn = vi.fn(async (): Promise<Response> => {
			throw new Error("network unavailable");
		});

		const result = await provider.fetch(track, createContext(fetchFn));

		expect(result).toEqual({ ok: false, reason: "error", message: "network unavailable" });
	});

	test("classifies response JSON decoding failures as errors", async () => {
		const provider = new LrclibProvider();
		const response = {
			ok: true,
			status: 200,
			json: vi.fn(async (): Promise<unknown> => {
				throw new SyntaxError("invalid JSON");
			}),
		} as unknown as Response;
		const fetchFn = vi.fn(async (): Promise<Response> => response);

		const result = await provider.fetch(track, createContext(fetchFn));

		expect(result).toEqual({ ok: false, reason: "error", message: "invalid JSON" });
	});

	test.each([
		"Plain lyrics without timestamps",
		"[00:01.00]\n[00:02.00]",
		"[00:01.00]<00:01.00>",
	])("classifies synchronized lyrics without renderable vocals as errors (%p)", async (syncedLyrics) => {
		const provider = new LrclibProvider();

		const result = await provider.fetch(track, createContext(fetchReturning({ syncedLyrics })));

		expect(result).toMatchObject({ ok: false, reason: "error" });
	});

	test.each([
		null,
		[],
		{ instrumental: "true", syncedLyrics: "[00:01.00]Hello" },
	])("classifies malformed decoded payloads as errors (%p)", async (payload) => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning(payload));

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "error" });
	});
});
