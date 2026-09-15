import { describe, expect, test } from "vitest";
import { lyricsLoadNoticeFor } from "../../src/lyrics/lyricsLoadNotice";
import type { LyricsLoadDiagnostics } from "../../src/lyrics/types";

const diagnostics: LyricsLoadDiagnostics = {
	cache: { status: "miss", primaryProvider: "spotify" },
	attempts: [
		{ provider: "spotify", status: "no-lyrics", message: "Spotify has no synced lyrics." },
		{ provider: "lrclib", status: "error", message: "Request failed\nwith a verbose upstream response" },
	],
};

describe("lyricsLoadNoticeFor", () => {
	test("shows the failing subcall status and duration in request details", () => {
		const notice = lyricsLoadNoticeFor("error", "ko", undefined, {
			cache: { status: "miss" },
			attempts: [
				{
					provider: "musixmatch",
					status: "temporarily-unavailable",
					requests: [{ stage: "track.subtitles.get", status: 429, outcome: "rate-limit", durationMs: 42.2 }],
				},
			],
		});
		expect(notice.diagnostics).toEqual(["Musixmatch: 일시적으로 사용할 수 없음", "track.subtitles.get [429]: rate-limit · 42 ms"]);
	});

	test("explains the provider failure and exposes a retry action", () => {
		const notice = lyricsLoadNoticeFor("error", "en", "Network request failed", diagnostics);

		expect(notice).toMatchObject({
			title: "Unable to load lyrics",
			detail: "Network request failed",
			tryAgainLabel: "Retry this track",
			tone: "danger",
		});
		expect(notice.diagnostics).toEqual([
			"Spotify: no lyrics · Spotify has no synced lyrics.",
			"LRCLIB: error · Request failed with a verbose upstream response",
		]);
	});

	test("uses localized no-lyrics copy and keeps retry available", () => {
		const notice = lyricsLoadNoticeFor("no-lyrics", "ko", undefined, diagnostics);

		expect(notice.title).toBe("가사를 찾지 못했습니다");
		expect(notice.detail).toContain("가사 제공자");
		expect(notice.tryAgainLabel).toBe("현재 곡 다시 요청");
		expect(notice.diagnostics?.[0]).toContain("Spotify: 가사 없음");
	});

	test("does not offer retry for unsupported local tracks", () => {
		const notice = lyricsLoadNoticeFor("unsupported-local", "en");

		expect(notice.tryAgainLabel).toBeUndefined();
		expect(notice.detail).toContain("local files");
		expect(notice.diagnostics).toBeUndefined();
	});

	test.each([
		["restricted", "ko", "Musixmatch에서 이 가사의 제공이 제한되어 있습니다."],
		["instrumental", "en", "This is an instrumental track with no lyrics."],
		["restricted", "ja", "Musixmatch でこの歌詞の提供が制限されています。"],
	] as const)("localizes %s notices in %s", (reason, language, detail) => {
		const notice = lyricsLoadNoticeFor(reason, language);

		expect(notice.detail).toBe(detail);
		expect(notice.tone).toBe("neutral");
		expect(notice.tryAgainLabel).toBeUndefined();
	});

	test("labels restricted provider attempts in diagnostics", () => {
		const notice = lyricsLoadNoticeFor("restricted", "ko", undefined, {
			cache: { status: "miss" },
			attempts: [{ provider: "musixmatch", status: "restricted" }],
		});

		expect(notice.diagnostics).toEqual(["Musixmatch: 제한됨"]);
	});

	test("bounds provider messages before they are displayed", () => {
		const message = "x".repeat(300);
		const notice = lyricsLoadNoticeFor("error", "en", message);

		expect(notice.detail.length).toBe(180);
		expect(notice.detail.endsWith("…")).toBe(true);
	});
});
