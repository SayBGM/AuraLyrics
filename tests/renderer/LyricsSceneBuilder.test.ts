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

		const scene = buildLyricsScene(track, { lyrics, settings: DEFAULT_SETTINGS, provider: "lrclib" });

		expect(scene.groups).toHaveLength(0);
		expect(scene.mode).toBe("static");
		expect(track.querySelector(".static-line .line")?.textContent).toBe("Original");
		expect(track.textContent).not.toContain("Romanized");
		expect(track.querySelector(".lyric-translation")?.textContent).toBe("Translated");
		expect(track.lastElementChild?.classList.contains("provider-credit")).toBe(true);
		expect(track.lastElementChild?.textContent).toContain("LRCLIB");
	});

	test("renders original text instead of romanized text for line and syllable lyrics", () => {
		const lineTrack = document.createElement("div");
		const lineLyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 4,
			content: [{ type: "vocal", text: "원문", romanizedText: "wonmun", startTime: 0, endTime: 4, oppositeAligned: false }],
		};
		buildLyricsScene(lineTrack, { lyrics: lineLyrics, settings: DEFAULT_SETTINGS });

		const syllableTrack = document.createElement("div");
		const syllableLyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 4,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 4,
						syllables: [{ text: "가사", romanizedText: "gasa", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
			],
		};
		buildLyricsScene(syllableTrack, { lyrics: syllableLyrics, settings: DEFAULT_SETTINGS });

		expect(lineTrack.textContent).toContain("원문");
		expect(lineTrack.textContent).not.toContain("wonmun");
		expect(syllableTrack.textContent).toContain("가사");
		expect(syllableTrack.textContent).not.toContain("gasa");
	});

	test("omits every interlude renderer when interludes are hidden", () => {
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
			settings: { ...DEFAULT_SETTINGS, interludeStyle: "frame", showInterludes: false },
		});

		expect(scene.groups).toHaveLength(2);
		expect(track.querySelector(".interlude")).toBeNull();
	});

	test.each([
		["en", "Instrumental break"],
		["ko", "연주 구간"],
		["ja", "間奏"],
	] as const)("localizes interlude screen-reader labels in %s", (language, label) => {
		const track = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 8,
			content: [{ type: "interlude", startTime: 0, endTime: 8 }],
		};

		buildLyricsScene(track, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, language, interludeStyle: "dots", showInterludes: true },
		});

		expect(track.querySelector(".interlude")?.getAttribute("aria-label")).toBe(label);
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
