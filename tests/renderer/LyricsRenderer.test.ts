import { describe, expect, test } from "vitest";
import type { LineLyrics } from "../../src/lyrics/types";
import { LyricsRenderer } from "../../src/renderer/LyricsRenderer";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

describe("LyricsRenderer", () => {
	test("renders active line state into the provided root", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 10,
			content: [
				{ type: "vocal", text: "First", startTime: 0, endTime: 5, oppositeAligned: false },
				{ type: "vocal", text: "Second", startTime: 5, endTime: 10, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);
		renderer.update(6, 1 / 60);

		expect(root.querySelector(".aura-lyrics")).not.toBeNull();
		expect(root.querySelector(".vocals-group.active")?.textContent).toContain("Second");
		expect(root.querySelector(".vocals-group.sung")?.textContent).toContain("First");
	});

	test("keeps the previous lyric highlighted until the next lyric starts", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 20,
			content: [
				{ type: "vocal", text: "Hold highlight", startTime: 0, endTime: 5, oppositeAligned: false },
				{ type: "vocal", text: "Next lyric", startTime: 10, endTime: 15, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);
		renderer.update(7, 1 / 60);

		expect(root.querySelector(".vocals-group.active")?.textContent).toContain("Hold highlight");
		expect(root.querySelector(".vocals-group.sung")).toBeNull();
	});

	test("does not use text fill progress for line synced lyrics", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 10,
			content: [{ type: "vocal", text: "Fill should not progress", startTime: 0, endTime: 10, oppositeAligned: false }],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);
		renderer.update(5, 1 / 60);

		const activeLine = root.querySelector<HTMLElement>(".vocals-group.active");
		expect(activeLine?.style.getPropertyValue("--line-progress")).toBe("");
		expect(root.querySelector(".line-group")).not.toBeNull();
	});

	test("renders lyrics as non-button drag surface content", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 10,
			content: [{ type: "vocal", text: "Drag me", startTime: 0, endTime: 10, oppositeAligned: false }],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);

		expect(root.querySelector(".vocals-group")?.tagName).toBe("DIV");
		expect(root.querySelector("button.vocals-group")).toBeNull();
	});

	test("moves the lyrics track to keep the active line near the configured position", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 20,
			content: [
				{ type: "vocal", text: "First", startTime: 0, endTime: 5, oppositeAligned: false },
				{ type: "vocal", text: "Second", startTime: 5, endTime: 10, oppositeAligned: false },
				{ type: "vocal", text: "Third", startTime: 10, endTime: 15, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, { ...DEFAULT_SETTINGS, lyricsVerticalPosition: 0.4 });
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const rows = root.querySelectorAll<HTMLElement>(".vocals-group");
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		rows.forEach((row, index) => {
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index * 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
		});

		renderer.update(11, 1 / 60);

		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -240px, 0)");
	});

	test("scrolls to the final lyric when playback seeks past the last lyric", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 15,
			content: [
				{ type: "vocal", text: "First", startTime: 0, endTime: 5, oppositeAligned: false },
				{ type: "vocal", text: "Second", startTime: 5, endTime: 10, oppositeAligned: false },
				{ type: "vocal", text: "Final", startTime: 10, endTime: 15, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS, "lrclib");
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const rows = root.querySelectorAll<HTMLElement>(".vocals-group");
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		rows.forEach((row, index) => {
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index * 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
		});

		renderer.update(20, 1 / 60);

		expect(root.querySelector<HTMLElement>(".vocals-group.active")).toBeNull();
		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -200px, 0)");
	});

	test("keeps only previous active and next lines visible by default", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 25,
			content: [
				{ type: "vocal", text: "One", startTime: 0, endTime: 5, oppositeAligned: false },
				{ type: "vocal", text: "Two", startTime: 5, endTime: 10, oppositeAligned: false },
				{ type: "vocal", text: "Three", startTime: 10, endTime: 15, oppositeAligned: false },
				{ type: "vocal", text: "Four", startTime: 15, endTime: 20, oppositeAligned: false },
				{ type: "vocal", text: "Five", startTime: 20, endTime: 25, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, { ...DEFAULT_SETTINGS, visibleContextLines: 1 });
		renderer.update(11, 1 / 60);

		const rows = Array.from(root.querySelectorAll<HTMLElement>(".vocals-group"));
		expect(rows.map((row) => row.classList.contains("out-of-context"))).toEqual([true, false, false, false, true]);
		expect(rows[1].classList.contains("context-previous")).toBe(true);
		expect(rows[2].classList.contains("context-current")).toBe(true);
		expect(rows[3].classList.contains("context-next")).toBe(true);
	});

	test("renders provider source below the final lyric", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 100,
			content: [{ type: "vocal", text: "Ending", startTime: 0, endTime: 100, oppositeAligned: false }],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS, "lrclib");

		const rows = Array.from(root.querySelectorAll(".lyrics-track > *"));
		expect(rows.at(-1)?.classList.contains("provider-source")).toBe(true);
		expect(rows.at(-1)?.textContent).toContain("lrclib");
	});

	test("renders interlude soundwave bars and updates progress", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 14,
			content: [
				{ type: "vocal", text: "Before", startTime: 0, endTime: 4, oppositeAligned: false },
				{ type: "interlude", startTime: 4, endTime: 10 },
				{ type: "vocal", text: "After", startTime: 10, endTime: 14, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS, "spotify", {
			"4:10": { bars: [0.2, 0.6, 1], source: "audio-analysis" },
		});
		renderer.update(7, 1 / 60);

		const interlude = root.querySelector<HTMLElement>(".interlude");
		const bars = root.querySelectorAll<HTMLElement>(".interlude-wave-bar");
		expect(bars).toHaveLength(3);
		expect(interlude?.style.getPropertyValue("--interlude-progress")).toBe("50%");
		expect(interlude?.dataset.waveformSource).toBe("audio-analysis");
		expect(Array.from(bars).map((bar) => bar.style.getPropertyValue("--bar-fill-ratio"))).toEqual(["1", "0.5", "0"]);
	});
});
