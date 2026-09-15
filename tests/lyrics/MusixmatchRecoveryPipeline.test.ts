import { describe, expect, test, vi } from "vitest";
import { ProviderLoadPipeline } from "../../src/lyrics/ProviderLoadPipeline";
import { MusixmatchProvider } from "../../src/lyrics/providers/MusixmatchProvider";
import { MusixmatchRequestError } from "../../src/lyrics/providers/musixmatchProxy";
import type { ProviderContext, TrackIdentity } from "../../src/lyrics/types";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

const track: TrackIdentity = {
	uri: "spotify:track:recovery",
	title: "Birthday",
	artist: "Singer",
	album: "Album",
	durationMs: 180_000,
	isLocal: false,
};

describe("Musixmatch recovery through the provider pipeline", () => {
	test("token captcha without a status code does not repeat the authentication loop", async () => {
		const request = vi.fn(async () => ({ message: { header: { status_code: 401 }, body: {} } }));
		const refresh = vi.fn(async () => {
			throw new MusixmatchRequestError("unsafe token=secret", "captcha");
		});
		const context: ProviderContext = {
			cosmosGet: async <T>() => (await request()) as T,
			fetch,
			userAgent: "test",
			refreshMusixmatchToken: refresh,
		};
		const pipeline = new ProviderLoadPipeline(() => context, { retryDelayMs: 0 });
		const result = await pipeline.load(track, DEFAULT_SETTINGS, [new MusixmatchProvider()], () => true);
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts[0].status).toBe("temporarily-unavailable");
		expect(request).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(result)).not.toContain("secret");
	});

	test("an unsupported search endpoint does not multiply pipeline retries", async () => {
		const urls: string[] = [];
		const context: ProviderContext = {
			cosmosGet: async <T>(url: string) => {
				urls.push(url);
				const status = url.includes("macro.subtitles.get") ? 404 : 405;
				return { message: { header: { status_code: status }, body: {} } } as T;
			},
			fetch,
			userAgent: "test",
		};
		const pipeline = new ProviderLoadPipeline(() => context, { retryDelayMs: 0 });
		const result = await pipeline.load(track, DEFAULT_SETTINGS, [new MusixmatchProvider()], () => true);
		expect(result.state).toEqual({ status: "empty", reason: "no-lyrics" });
		expect(urls).toHaveLength(2);
		expect(urls[1]).toContain("track.search");
		expect(result.attempts).toHaveLength(1);
	});

	test.each(["Birthday", "Different song"])("a nested subtitle limit stops retries even when matcher returns %s", async (matchedTitle) => {
		const request = vi.fn(async () => ({
			message: {
				header: { status_code: 200 },
				body: {
					macro_calls: {
						"matcher.track.get": {
							message: {
								header: { status_code: 200 },
								body: {
									track: {
										track_id: 123,
										track_name: matchedTitle,
										artist_name: track.artist,
										track_length: 180,
									},
								},
							},
						},
						"track.subtitles.get": { message: { header: { status_code: 429, retry_after: 60 }, body: {} } },
					},
				},
			},
		}));
		const refresh = vi.fn(async () => "new-token");
		const context: ProviderContext = {
			cosmosGet: async <T>() => (await request()) as T,
			fetch,
			userAgent: "test",
			musixmatchToken: "private-token",
			refreshMusixmatchToken: refresh,
		};
		const pipeline = new ProviderLoadPipeline(() => context, { retryDelayMs: 0 });
		const providers = [new MusixmatchProvider()];
		const result = await pipeline.load(track, DEFAULT_SETTINGS, providers, () => true);
		expect(result.state.status).toBe("error");
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts[0].status).toBe("temporarily-unavailable");
		expect(result.attempts[0].requests).toEqual(expect.arrayContaining([expect.objectContaining({ stage: "track.subtitles.get", status: 429 })]));
		const next = await pipeline.load({ ...track, uri: "spotify:track:next" }, DEFAULT_SETTINGS, providers, () => true);
		expect(next.attempts[0].status).toBe("cooldown");
		expect(request).toHaveBeenCalledTimes(1);
		expect(refresh).not.toHaveBeenCalled();
		expect(JSON.stringify(result)).not.toContain("private-token");
	});
});
