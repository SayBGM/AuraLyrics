import { describe, expect, test } from "vitest";
import type { LineLyrics, SyllableLyrics } from "../../src/lyrics/types";
import { interludeKey, LyricsRenderer } from "../../src/renderer/LyricsRenderer";
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

	test("does not force parenthetical line lyrics onto separate visual lines", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 10,
			content: [{ type: "vocal", text: "바람아 내게 봄을 데려와 줘 (벚꽃잎이 흩날리듯이)", startTime: 0, endTime: 10, oppositeAligned: false }],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);

		const line = root.querySelector<HTMLElement>(".line");
		expect(line?.querySelector(".lyric-parenthetical-break")).toBeNull();
		expect(line?.querySelector(".lyric-parenthetical")).toBeNull();
		expect(line?.textContent).toBe("바람아 내게 봄을 데려와 줘 (벚꽃잎이 흩날리듯이)");
	});

	test("formats parenthetical word-synced lyrics as smaller right-aligned lowered echoes in the same visual row", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 7,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 7,
						syllables: [
							{ text: "괜찮아", startTime: 0, endTime: 1, isPartOfWord: false },
							{ text: "(괜찮아)", startTime: 1, endTime: 2, isPartOfWord: false },
							{ text: "언젠가", startTime: 2, endTime: 3, isPartOfWord: false },
							{ text: "(언젠가)", startTime: 3, endTime: 4, isPartOfWord: false },
							{ text: "바람아", startTime: 4, endTime: 5, isPartOfWord: false },
							{ text: "내게", startTime: 5, endTime: 6, isPartOfWord: false },
							{ text: "(흩날리듯이)", startTime: 6, endTime: 7, isPartOfWord: false },
						],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);

		const lead = root.querySelector<HTMLElement>(".vocals.lead");
		const rows = Array.from(lead?.querySelectorAll<HTMLElement>(".syllable-row") ?? []);
		expect(rows).toHaveLength(3);
		expect(rows.map((row) => row.querySelector(".syllable-main")?.textContent)).toEqual(["괜찮아", "언젠가", "바람아내게"]);
		expect(rows.map((row) => row.querySelector(".syllable-echo")?.textContent)).toEqual(["괜찮아", "언젠가", "흩날리듯이"]);
		expect(rows[0].querySelector<HTMLElement>(".parenthetical-word")?.textContent).toBe("괜찮아");
		expect(rows[1].querySelector<HTMLElement>(".parenthetical-word")?.textContent).toBe("언젠가");
		expect(rows[2].querySelector<HTMLElement>(".parenthetical-word")?.textContent).toBe("흩날리듯이");
		expect(rows.every((row) => row.classList.contains("has-parenthetical-echo"))).toBe(true);
		expect(lead?.textContent).not.toContain("(");
		expect(lead?.textContent).not.toContain(")");
	});

	test("splits multiple parentheticals inside one word-synced token into separate visual rows", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
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
						syllables: [{ text: "괜찮아 (괜찮아) 언젠가 (언젠가)", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);

		const lead = root.querySelector<HTMLElement>(".vocals.lead");
		const rows = Array.from(lead?.querySelectorAll<HTMLElement>(".syllable-row") ?? []);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.querySelector(".syllable-main")?.textContent)).toEqual(["괜찮아", "언젠가"]);
		expect(rows.map((row) => row.querySelector(".syllable-echo")?.textContent)).toEqual(["괜찮아", "언젠가"]);
		expect(lead?.textContent).not.toContain("(");
		expect(lead?.textContent).not.toContain(")");
	});

	test("keeps punctuation between word-synced parentheticals out of the next visual row", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
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
						syllables: [{ text: "피땀으로 (hey), 눈물로 (hey)", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);

		const lead = root.querySelector<HTMLElement>(".vocals.lead");
		const rows = Array.from(lead?.querySelectorAll<HTMLElement>(".syllable-row") ?? []);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.querySelector(".syllable-main")?.textContent)).toEqual(["피땀으로,", "눈물로"]);
		expect(rows.map((row) => row.querySelector(".syllable-echo")?.textContent)).toEqual(["hey", "hey"]);
		expect(rows[1].querySelector(".syllable-main")?.textContent?.startsWith(",")).toBe(false);
		expect(lead?.textContent).not.toContain("(");
		expect(lead?.textContent).not.toContain(")");
	});

	test("scrolls word-synced parenthetical lyrics by visual rows instead of original provider lines", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 12,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 6,
						syllables: [
							{ text: "무궁화에", startTime: 0, endTime: 1, isPartOfWord: false },
							{ text: "(무궁화에)", startTime: 1, endTime: 2, isPartOfWord: false },
							{ text: "꽃이", startTime: 2, endTime: 3, isPartOfWord: false },
							{ text: "피고", startTime: 3, endTime: 4, isPartOfWord: false },
							{ text: "(꽃이 피고)", startTime: 4, endTime: 6, isPartOfWord: false },
						],
					},
				},
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 6,
						endTime: 12,
						syllables: [
							{ text: "돌아", startTime: 6, endTime: 7, isPartOfWord: false },
							{ text: "보면", startTime: 7, endTime: 8, isPartOfWord: false },
							{ text: "(돌아보면)", startTime: 8, endTime: 9, isPartOfWord: false },
							{ text: "다", startTime: 9, endTime: 10, isPartOfWord: false },
							{ text: "그대로", startTime: 10, endTime: 11, isPartOfWord: false },
							{ text: "멈춰라", startTime: 11, endTime: 12, isPartOfWord: false },
						],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, { ...DEFAULT_SETTINGS, lyricsVerticalPosition: 0.4 } as typeof DEFAULT_SETTINGS);
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const groups = root.querySelectorAll<HTMLElement>(".vocals-group");
		const rows = root.querySelectorAll<HTMLElement>(".syllable-row");
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		groups.forEach((group, index) => {
			Object.defineProperty(group, "offsetTop", { configurable: true, value: index * 360 });
			Object.defineProperty(group, "clientHeight", { configurable: true, value: 160 });
		});
		rows.forEach((row, index) => {
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index % 2 === 0 ? 0 : 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
		});

		renderer.update(3, 1 / 60);

		expect(root.querySelector<HTMLElement>(".syllable-row.active")?.textContent ?? "").toContain("꽃이피고꽃이 피고");
		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -20px, 0)");
	});

	test("does not split parentheticals inside syllable-level continuation tokens", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
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
						syllables: [
							{ text: "괜", startTime: 0, endTime: 1, isPartOfWord: false },
							{ text: "찮아 (괜찮아) 언젠가 (언젠가)", startTime: 1, endTime: 4, isPartOfWord: true },
						],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);

		const lead = root.querySelector<HTMLElement>(".vocals.lead");
		const rows = Array.from(lead?.querySelectorAll<HTMLElement>(".syllable-row") ?? []);
		expect(rows).toHaveLength(1);
		expect(rows[0].querySelector(".syllable-main")?.textContent).toBe("괜찮아 (괜찮아) 언젠가 (언젠가)");
		expect(rows[0].querySelector(".syllable-echo")?.textContent).toBe("");
		expect(lead?.textContent).toContain("(");
		expect(lead?.textContent).toContain(")");
	});

	test("keeps standalone parenthetical word-synced rows right aligned at full lyric size", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 2,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 2,
						syllables: [{ text: "(괜찮아)", startTime: 0, endTime: 2, isPartOfWord: false }],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, DEFAULT_SETTINGS);

		const row = root.querySelector<HTMLElement>(".syllable-row");
		expect(row?.classList.contains("parenthetical-only")).toBe(true);
		expect(row?.querySelector(".syllable-main")?.textContent).toBe("");
		expect(row?.querySelector(".syllable-echo")?.textContent).toBe("괜찮아");
		expect(row?.querySelector(".parenthetical-word")).not.toBeNull();
		expect(root.textContent).not.toContain("(");
		expect(root.textContent).not.toContain(")");
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

	test("moves the lyrics track to keep the active line centered regardless of saved vertical position", () => {
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
		renderer.mount(root, lyrics, { ...DEFAULT_SETTINGS, lyricsVerticalPosition: 0.4 } as typeof DEFAULT_SETTINGS);
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const rows = root.querySelectorAll<HTMLElement>(".vocals-group");
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		rows.forEach((row, index) => {
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index * 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
		});

		renderer.update(11, 1 / 60);

		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -200px, 0)");
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

	test("exposes interlude progress to the PiP frame and softens the lyric scene while active", () => {
		const pipRoot = document.createElement("div");
		const root = document.createElement("main");
		pipRoot.append(root);
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
		renderer.mount(root, lyrics, { ...DEFAULT_SETTINGS, interludeStyle: "frame", showInterludes: false }, "spotify");
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const rows = root.querySelectorAll<HTMLElement>(".vocals-group");
		Object.defineProperty(pipRoot, "clientWidth", { configurable: true, value: 300 });
		Object.defineProperty(pipRoot, "clientHeight", { configurable: true, value: 100 });
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		rows.forEach((row, index) => {
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index * 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
		});
		renderer.update(5.5, 1 / 60);

		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("0.25");
		expect(Number(pipRoot.style.getPropertyValue("--pip-frame-progress-top"))).toBeCloseTo(188 / 300);
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-right")).toBe("0");

		renderer.update(7, 1 / 60);

		const container = root.querySelector<HTMLElement>(".aura-lyrics");
		expect(container?.classList.contains("interlude-active")).toBe(true);
		expect(pipRoot.classList.contains("interlude-active")).toBe(true);
		expect(pipRoot.classList.contains("interlude-frame-active")).toBe(true);
		expect(pipRoot.classList.contains("interlude-style-frame")).toBe(true);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("0.5");
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress-percent")).toBe("50%");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-top")).toBe("1");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-right")).toBe("1");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-bottom")).toBe("0");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-left")).toBe("0");
		expect(root.querySelector(".interlude-frame")).toBeNull();
		expect(root.querySelector(".interlude")).toBeNull();
		expect(root.querySelector(".vocals-group.context-current")?.textContent).toContain("After");
		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -20px, 0)");

		renderer.update(11, 1 / 60);

		expect(container?.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.classList.contains("interlude-frame-active")).toBe(false);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("");
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress-percent")).toBe("");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-top")).toBe("");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-right")).toBe("");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-bottom")).toBe("");
		expect(pipRoot.style.getPropertyValue("--pip-frame-progress-left")).toBe("");
	});

	test("renders the legacy dots interlude style when selected", () => {
		const pipRoot = document.createElement("div");
		const root = document.createElement("main");
		pipRoot.append(root);
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
		renderer.mount(root, lyrics, { ...DEFAULT_SETTINGS, interludeStyle: "dots", showInterludes: true }, "spotify");
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const rows = root.querySelectorAll<HTMLElement>(".vocals-group");
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		rows.forEach((row, index) => {
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index * 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
		});
		renderer.update(7, 1 / 60);

		const interlude = root.querySelector<HTMLElement>(".interlude");
		expect(interlude?.dataset.interludeStyle).toBe("dots");
		expect(interlude?.querySelector(".interlude-pill")).not.toBeNull();
		expect(interlude?.querySelectorAll(".interlude-dot")).toHaveLength(3);
		expect(interlude?.classList.contains("context-current")).toBe(true);
		expect(root.querySelector(".vocals-group.context-current")?.textContent).not.toContain("After");
		expect(root.querySelector<HTMLElement>(".aura-lyrics")?.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("");
		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -20px, 0)");
	});

	test("renders soundwave interlude bars and updates progress when selected", () => {
		const pipRoot = document.createElement("div");
		const root = document.createElement("main");
		pipRoot.append(root);
		const interlude = { type: "interlude" as const, startTime: 4, endTime: 10 };
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 14,
			content: [
				{ type: "vocal", text: "Before", startTime: 0, endTime: 4, oppositeAligned: false },
				interlude,
				{ type: "vocal", text: "After", startTime: 10, endTime: 14, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, lyrics, { ...DEFAULT_SETTINGS, interludeStyle: "wave", showInterludes: true }, "spotify", {
			[interludeKey(interlude)]: { bars: [0.2, 0.6, 1], source: "audio-analysis" },
		});
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const rows = root.querySelectorAll<HTMLElement>(".vocals-group");
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		rows.forEach((row, index) => {
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index * 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
		});
		renderer.update(7, 1 / 60);

		const interludeElement = root.querySelector<HTMLElement>(".interlude");
		const bars = root.querySelectorAll<HTMLElement>(".interlude-wave-bar");
		expect(interludeElement?.dataset.interludeStyle).toBe("wave");
		expect(interludeElement?.dataset.waveformSource).toBe("audio-analysis");
		expect(interludeElement?.style.getPropertyValue("--interlude-progress")).toBe("50%");
		expect(interludeElement?.classList.contains("context-current")).toBe(true);
		expect(interludeElement?.classList.contains("interlude-wave")).toBe(false);
		expect(interludeElement?.classList.contains("interlude-style-wave")).toBe(true);
		expect(root.querySelectorAll(".interlude-wave")).toHaveLength(1);
		expect(root.querySelector(".vocals-group.context-current")?.textContent).not.toContain("After");
		expect(root.querySelector<HTMLElement>(".aura-lyrics")?.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("");
		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -20px, 0)");
		expect(bars).toHaveLength(3);
		expect(Array.from(bars).map((bar) => bar.style.getPropertyValue("--bar-fill-ratio"))).toEqual(["1", "0.5", "0"]);
	});
});
