import { describe, expect, test, vi } from "vitest";
import { appendProviderSource } from "../../src/renderer/lyricsTrackHelpers";

describe("appendProviderSource", () => {
	test("creates provider source and diagnostics through the supplied owner document", () => {
		const ownerDocument = document.implementation.createHTMLDocument("pip");
		const lyricsTrack = ownerDocument.createElement("div");
		const createElement = vi.spyOn(ownerDocument, "createElement");

		appendProviderSource(ownerDocument, lyricsTrack, {
			provider: "lrclib",
			source: "network",
			showDiagnostics: true,
			diagnostics: {
				cache: { status: "miss", primaryProvider: "spotify" },
				attempts: [{ provider: "lrclib", status: "success" }],
			},
		});

		expect(createElement).toHaveBeenCalledTimes(2);
		expect(lyricsTrack.querySelector(".provider-source")?.textContent).toBe("Source: lrclib · network");
		expect(lyricsTrack.querySelector(".provider-diagnostics")?.textContent).toContain("lrclib: success");
	});
});
