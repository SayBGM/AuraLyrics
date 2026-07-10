import { describe, expect, test } from "vitest";
import type { LineLyrics, StaticLyrics, SyllableLyrics } from "../../src/lyrics/types";
import { buildLyricsScene } from "../../src/renderer/LyricsSceneBuilder";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

describe("buildLyricsScene", () => {
	test("constructs static rows and translations without animated groups", () => {
		const track = document.createElement("div");
		const lyrics: StaticLyrics = {
			type: "static",
			lines: [{ text: "Original", romanizedText: "Romanized", translatedText: "Translated" }],
		};

		const scene = buildLyricsScene(track, { lyrics, settings: DEFAULT_SETTINGS });

		expect(scene.groups).toHaveLength(0);
		expect(track.querySelector(".vocals-group.static")?.childNodes[0]?.textContent).toBe("Romanized");
		expect(track.querySelector(".lyric-translation")?.textContent).toBe("Translated");
	});

	test("keeps frame interludes animated but outside the lyric track", () => {
		const track = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 12,
			content: [
				{ type: "vocal", text: "Before", startTime: 0, endTime: 4, oppositeAligned: false },
				{ type: "interlude", startTime: 4, endTime: 8 },
				{ type: "vocal", text: "After", startTime: 8, endTime: 12, oppositeAligned: false },
			],
		};

		const scene = buildLyricsScene(track, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, interludeStyle: "frame", showInterludes: true },
		});

		expect(scene.groups).toHaveLength(3);
		expect(track.querySelectorAll(".line-group")).toHaveLength(2);
		expect(track.querySelector(".interlude")).toBeNull();
	});

	test("downgrades syllable lyrics to the line scene when requested", () => {
		const track = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 4,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					translatedText: "번역",
					lead: {
						startTime: 0,
						endTime: 4,
						syllables: [{ text: "Line", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
			],
		};

		const scene = buildLyricsScene(track, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, syncPreference: "line-only" },
		});

		expect(scene.groups).toHaveLength(1);
		expect(track.querySelector(".line-group")?.textContent).toBe("Line번역");
		expect(track.querySelector(".syllable-group")).toBeNull();
	});
});
