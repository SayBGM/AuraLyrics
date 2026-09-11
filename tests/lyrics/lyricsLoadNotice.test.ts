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

	test("bounds provider messages before they are displayed", () => {
		const message = "x".repeat(300);
		const notice = lyricsLoadNoticeFor("error", "en", message);

		expect(notice.detail.length).toBe(180);
		expect(notice.detail.endsWith("…")).toBe(true);
	});
});
