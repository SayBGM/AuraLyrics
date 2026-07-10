import { describe, expect, test } from "vitest";
import { ProviderLoadPipeline } from "../../src/lyrics/ProviderLoadPipeline";
import type { LyricsProvider, ProviderContext, ProviderId, TrackIdentity } from "../../src/lyrics/types";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

const track: TrackIdentity = {
	uri: "spotify:track:pipeline",
	title: "Pipeline",
	artist: "Artist",
	album: "Album",
	durationMs: 10_000,
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

describe("ProviderLoadPipeline", () => {
	test("owns fallback diagnostics independently of cache lookup", async () => {
		const primary: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => ({ ok: false, reason: "no-lyrics", message: "No Spotify lyrics" }),
		};
		const fallback: LyricsProvider = {
			id: "lrclib",
			supports: () => true,
			fetch: async () => ({ ok: true, lyrics: lineLyrics("Fallback") }),
		};
		const pipeline = new ProviderLoadPipeline(() => context, { retryDelayMs: 0 });

		const result = await pipeline.load(track, DEFAULT_SETTINGS, [primary, fallback], () => true);

		expect(result.state).toMatchObject({ status: "ready", provider: "lrclib" });
		expect(result.attempts.map((attempt) => `${attempt.provider}:${attempt.status}`)).toEqual(["spotify:no-lyrics", "lrclib:success"]);
	});

	test("retains provider cooldowns across loads and can clear them", async () => {
		const now = 1_000;
		let blockedCalls = 0;
		const blocked: LyricsProvider = {
			id: "musixmatch",
			supports: () => true,
			fetch: async () => {
				blockedCalls += 1;
				return { ok: false, reason: "temporarily-unavailable", cooldownMs: 60_000 };
			},
		};
		const fallback: LyricsProvider = {
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
		const pipeline = new ProviderLoadPipeline(() => context, { now: () => now, retryDelayMs: 0 });

		await pipeline.load(track, settings, [blocked, fallback], () => true);
		const cooled = await pipeline.load({ ...track, uri: "spotify:track:cooled" }, settings, [blocked, fallback], () => true);
		pipeline.clearCooldowns();
		await pipeline.load({ ...track, uri: "spotify:track:cleared" }, settings, [blocked, fallback], () => true);

		expect(blockedCalls).toBe(2);
		expect(cooled.attempts[0]).toEqual({ provider: "musixmatch", status: "cooldown" });
	});

	test("owns retry attempts and returns the normalized successful document", async () => {
		let calls = 0;
		const provider: LyricsProvider = {
			id: "spotify",
			supports: () => true,
			fetch: async () => {
				calls += 1;
				return calls < 3
					? { ok: false as const, reason: "error" as const, message: "temporary" }
					: { ok: true as const, lyrics: lineLyrics("Recovered") };
			},
		};
		const pipeline = new ProviderLoadPipeline(() => context, { retryDelayMs: 0 });

		const result = await pipeline.load(track, DEFAULT_SETTINGS, [provider], () => true);

		expect(calls).toBe(3);
		expect(result.state).toMatchObject({ status: "ready", provider: "spotify" });
		expect(result.attempts.map((attempt) => attempt.status)).toEqual(["error", "error", "success"]);
	});
});
