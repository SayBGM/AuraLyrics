import { describe, expect, test, vi } from "vitest";
import { SpotifyProvider } from "../../src/lyrics/providers/SpotifyProvider";
import type { ProviderContext, TrackIdentity } from "../../src/lyrics/types";

const track: TrackIdentity = {
	uri: "spotify:track:abc123",
	id: "abc123",
	title: "Test Track",
	artist: "Test Artist",
	album: "Test Album",
	durationMs: 4000,
	isLocal: false,
};

const createContext = (cosmosGet: (url: string) => Promise<unknown>): ProviderContext => ({
	cosmosGet: cosmosGet as ProviderContext["cosmosGet"],
	fetch: vi.fn(async (): Promise<Response> => {
		throw new Error("fetch should not be used for Spotify color lyrics");
	}) as unknown as typeof fetch,
	userAgent: "AuraLyrics/test",
});

describe("SpotifyProvider", () => {
	test("supports non-local tracks that have a track id", () => {
		const provider = new SpotifyProvider();
		expect(provider.supports(track)).toBe(true);
		expect(provider.supports({ ...track, isLocal: true })).toBe(false);
		expect(provider.supports({ ...track, id: undefined })).toBe(false);
	});

	test("fetches color lyrics via CosmosAsync using the track id", async () => {
		const provider = new SpotifyProvider();
		const cosmosGet = vi.fn(async () => ({
			lyrics: {
				syncType: "LINE_SYNCED",
				lines: [{ startTimeMs: "0", words: "Hello" }],
			},
		}));

		const result = await provider.fetch(track, createContext(cosmosGet));

		expect(cosmosGet).toHaveBeenCalledWith(
			"https://spclient.wg.spotify.com/color-lyrics/v2/track/abc123?format=json&vocalRemoval=false&market=from_token"
		);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected ok result");
		expect(result.lyrics.type).toBe("line");
	});

	test("falls back to parsing the track id out of the URI when TrackIdentity.id is missing", async () => {
		const provider = new SpotifyProvider();
		const cosmosGet = vi.fn(async () => ({
			lyrics: { syncType: "LINE_SYNCED", lines: [{ startTimeMs: "0", words: "Hello" }] },
		}));

		await provider.fetch({ ...track, id: undefined }, createContext(cosmosGet));

		expect(cosmosGet).toHaveBeenCalledWith(expect.stringContaining("/color-lyrics/v2/track/abc123?"));
	});

	test("reports no-lyrics when the payload has no usable line-synced content", async () => {
		const provider = new SpotifyProvider();
		const cosmosGet = vi.fn(async () => ({ lyrics: { syncType: "UNSYNCED", lines: [] } }));

		const result = await provider.fetch(track, createContext(cosmosGet));

		expect(result).toEqual({ ok: false, reason: "no-lyrics" });
	});
});
