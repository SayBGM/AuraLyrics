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

const lrclibRecord = (overrides: Record<string, unknown> = {}) => ({
	id: 1,
	trackName: track.title,
	artistName: track.artist,
	albumName: track.album,
	duration: track.durationMs / 1000,
	instrumental: false,
	plainLyrics: "Hello",
	syncedLyrics: "[00:01.00]Hello",
	...overrides,
});

const firstVocalText = (result: Awaited<ReturnType<LrclibProvider["fetch"]>>): string => {
	if (!result.ok || result.lyrics.type !== "line") {
		throw new Error("expected line lyrics");
	}
	const vocal = result.lyrics.content.find((item) => item.type === "vocal");
	if (!vocal || vocal.type !== "vocal") {
		throw new Error("expected a vocal line");
	}
	return vocal.text;
};

const createContext = (
	fetchFn: TestFetch,
	cosmosGet = vi.fn(async (): Promise<unknown> => {
		throw new Error("cosmosGet should not be used for LRCLIB");
	}),
	proxyBaseUrl?: string
): ProviderContext => ({
	cosmosGet: cosmosGet as ProviderContext["cosmosGet"],
	fetch: fetchFn as typeof fetch,
	userAgent: "AuraLyrics/test",
	proxyBaseUrl,
});

describe("LrclibProvider", () => {
	test("searches by track, artist, and album with the LRCLIB user agent", async () => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning([lrclibRecord()]);
		const cosmosGet = vi.fn(async (): Promise<unknown> => {
			throw new Error("cosmosGet should not be used for LRCLIB");
		});

		const result = await provider.fetch(track, createContext(fetchFn, cosmosGet));

		expect(result.ok).toBe(true);
		expect(fetchFn).toHaveBeenCalledOnce();
		const requestedUrl = new URL(String(fetchFn.mock.calls[0]?.[0]));
		expect(requestedUrl.origin + requestedUrl.pathname).toBe("https://lrclib.net/api/search");
		expect(requestedUrl.searchParams.get("track_name")).toBe(track.title);
		expect(requestedUrl.searchParams.get("artist_name")).toBe(track.artist);
		expect(requestedUrl.searchParams.get("album_name")).toBe(track.album);
		expect(requestedUrl.searchParams.has("duration")).toBe(false);
		expect(fetchFn.mock.calls[0]?.[1]).toEqual({ headers: { "x-user-agent": "AuraLyrics/test" } });
		expect(cosmosGet).not.toHaveBeenCalled();
	});

	test("falls back to a broad title and artist query after an empty field search", async () => {
		const provider = new LrclibProvider();
		const fetchFn = vi
			.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
			.mockResolvedValueOnce(jsonResponse([]))
			.mockResolvedValueOnce(jsonResponse([lrclibRecord({ syncedLyrics: "[00:01.00]Broad match" })]));

		const result = await provider.fetch(track, createContext(fetchFn));

		expect(result.ok).toBe(true);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		const requestedUrl = new URL(String(fetchFn.mock.calls[1]?.[0]));
		expect(requestedUrl.origin + requestedUrl.pathname).toBe("https://lrclib.net/api/search");
		expect(requestedUrl.searchParams.get("q")).toBe("Rock & Roll? A/B + C");
		expect([...requestedUrl.searchParams.keys()]).toEqual(["q"]);
	});

	test("routes both prioritized searches through the configured proxy", async () => {
		const provider = new LrclibProvider();
		const proxyBaseUrl = "https://my-proxy.example.com/?url=";
		const fetchFn = vi
			.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
			.mockResolvedValueOnce(jsonResponse([]))
			.mockResolvedValueOnce(jsonResponse([lrclibRecord()]));
		const cosmosGet = vi.fn(async (): Promise<unknown> => {
			throw new Error("cosmosGet should not be used for LRCLIB");
		});

		const result = await provider.fetch(track, createContext(fetchFn, cosmosGet, proxyBaseUrl));

		expect(result.ok).toBe(true);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		for (const [input, init] of fetchFn.mock.calls) {
			const proxiedUrl = String(input);
			expect(proxiedUrl.startsWith(proxyBaseUrl)).toBe(true);
			const upstreamUrl = decodeURIComponent(proxiedUrl.slice(proxyBaseUrl.length));
			expect(proxiedUrl).toBe(`${proxyBaseUrl}${encodeURIComponent(upstreamUrl)}`);
			expect(new URL(upstreamUrl).origin + new URL(upstreamUrl).pathname).toBe("https://lrclib.net/api/search");
			expect(init).toEqual({ headers: { "x-user-agent": "AuraLyrics/test" } });
		}
		expect(new URL(decodeURIComponent(String(fetchFn.mock.calls[0]?.[0]).slice(proxyBaseUrl.length))).searchParams.get("track_name")).toBe(
			track.title
		);
		expect(new URL(decodeURIComponent(String(fetchFn.mock.calls[1]?.[0]).slice(proxyBaseUrl.length))).searchParams.get("q")).toBe(
			`${track.title} ${track.artist}`
		);
		expect(cosmosGet).not.toHaveBeenCalled();
	});

	test("parses synchronized LRC from the decoded payload", async () => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning([lrclibRecord({ syncedLyrics: "[00:01.00]First\n[00:04.50]Second" })]));

		const result = await provider.fetch(track, context);

		expect(result.ok).toBe(true);
		if (!result.ok || result.lyrics.type !== "line") {
			throw new Error("expected line lyrics");
		}
		expect(result.lyrics.content[0]).toMatchObject({ type: "vocal", text: "First", startTime: 1, endTime: 4.5 });
	});

	test.each([
		[
			"normalized title",
			lrclibRecord({ trackName: "Wrong", syncedLyrics: "[00:01.00]First" }),
			lrclibRecord({ trackName: "  ROCK ＆ ROLL?  ", artistName: "Wrong", albumName: "Wrong", duration: 100, syncedLyrics: "[00:01.00]Title" }),
			"Title",
		],
		[
			"normalized artist",
			lrclibRecord({ artistName: "Wrong", syncedLyrics: "[00:01.00]First" }),
			lrclibRecord({ artistName: " a/b   + c ", albumName: "Wrong", duration: 100, syncedLyrics: "[00:01.00]Artist" }),
			"Artist",
		],
		[
			"normalized album",
			lrclibRecord({ albumName: "Wrong", syncedLyrics: "[00:01.00]First" }),
			lrclibRecord({ albumName: " hits ＃1 ", duration: 100, syncedLyrics: "[00:01.00]Album" }),
			"Album",
		],
		[
			"closest duration",
			lrclibRecord({ duration: 100, syncedLyrics: "[00:01.00]First" }),
			lrclibRecord({ duration: 7.25, syncedLyrics: "[00:01.00]Duration" }),
			"Duration",
		],
		[
			"finite duration",
			lrclibRecord({ duration: undefined, syncedLyrics: "[00:01.00]First" }),
			lrclibRecord({ duration: 100, syncedLyrics: "[00:01.00]Finite" }),
			"Finite",
		],
		["original API order", lrclibRecord({ syncedLyrics: "[00:01.00]First" }), lrclibRecord({ syncedLyrics: "[00:01.00]Second" }), "First"],
	])("selects candidates by %s precedence", async (_name, first, second, expectedText) => {
		const provider = new LrclibProvider();

		const result = await provider.fetch(track, createContext(fetchReturning([first, second])));

		expect(firstVocalText(result)).toBe(expectedText);
	});

	test("keeps a renderable candidate whose duration is non-finite", async () => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning([lrclibRecord({ duration: Number.NaN, syncedLyrics: "[00:01.00]Unknown duration" })]);

		const result = await provider.fetch(track, createContext(fetchFn));

		expect(firstVocalText(result)).toBe("Unknown duration");
		expect(fetchFn).toHaveBeenCalledOnce();
	});

	test("classifies instrumental tracks", async () => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning([lrclibRecord({ instrumental: true, syncedLyrics: null })]);
		const context = createContext(fetchFn);

		const result = await provider.fetch(track, context);

		expect(result).toEqual({ ok: false, reason: "instrumental" });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test.each([undefined, null, "", "   "])("classifies missing or empty synchronized lyrics as no lyrics (%p)", async (syncedLyrics) => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning([lrclibRecord({ syncedLyrics })]);
		const context = createContext(fetchFn);

		const result = await provider.fetch(track, context);

		expect(result).toEqual({ ok: false, reason: "no-lyrics" });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test("classifies non-string synchronized lyrics as a schema error", async () => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning([lrclibRecord({ syncedLyrics: 42 })]));

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "error" });
	});

	test("classifies a fetch 404 response as no lyrics", async () => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning({}, 404);

		const result = await provider.fetch(track, createContext(fetchFn));

		expect(result).toMatchObject({ ok: false, reason: "no-lyrics" });
		expect(fetchFn).toHaveBeenCalledTimes(2);
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
	])("skips synchronized lyrics without renderable vocals (%p)", async (syncedLyrics) => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning([lrclibRecord({ syncedLyrics })]);

		const result = await provider.fetch(track, createContext(fetchFn));

		expect(result).toMatchObject({ ok: false, reason: "no-lyrics" });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test.each([null, [null], [lrclibRecord({ instrumental: "true" })]])("classifies malformed decoded payloads as errors (%p)", async (payload) => {
		const provider = new LrclibProvider();
		const context = createContext(fetchReturning(payload));

		const result = await provider.fetch(track, context);

		expect(result).toMatchObject({ ok: false, reason: "error" });
	});

	test("ignores malformed records when a valid candidate is present", async () => {
		const provider = new LrclibProvider();
		const fetchFn = fetchReturning([null, lrclibRecord({ syncedLyrics: "[00:01.00]Valid candidate" })]);

		const result = await provider.fetch(track, createContext(fetchFn));

		expect(firstVocalText(result)).toBe("Valid candidate");
		expect(fetchFn).toHaveBeenCalledOnce();
	});
});
