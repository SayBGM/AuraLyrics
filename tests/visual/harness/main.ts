import type { LineLyrics, LyricsDocument, SyllableLyrics } from "../../../src/lyrics/types";
import { LyricsRenderer } from "../../../src/renderer/LyricsRenderer";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../../src/settings/SettingsStore";
import { pipStyles } from "../../../src/styles/pipStyles";

type ScenarioName =
	| "album-art-instrumental"
	| "background-opposite"
	| "frame-interlude"
	| "line-sync"
	| "word-sync"
	| "korean-tail"
	| "multiline-active-row";

type Scenario = {
	lyrics?: LyricsDocument;
	settings?: Partial<ExtensionSettings>;
	timestamp: number;
	mode?: "album-art" | "lyrics";
};

declare global {
	interface Window {
		auraVisualHarness?: {
			renderScenario(name: ScenarioName, timestamp?: number): void;
		};
	}
}

const renderer = new LyricsRenderer();
const mountRoot = document.querySelector<HTMLElement>("#aura-visual-root");
const pipRoot = document.querySelector<HTMLElement>("#aura-lyrics-root");

if (!mountRoot || !pipRoot) {
	throw new Error("AuraLyrics visual harness root was not found.");
}

const style = document.createElement("style");
style.textContent = `${pipStyles}

#aura-visual-root {
	width: 100%;
	height: 100%;
}

.pip-content {
	padding: 7vh 6vw;
}

*, *::before, *::after {
	animation-duration: 0s !important;
	animation-delay: 0s !important;
	transition-duration: 0s !important;
	transition-delay: 0s !important;
}
`;
document.head.append(style);

const settingsForVisuals: Partial<ExtensionSettings> = {
	fontFamily: "Arial",
	fontScale: 1,
	inactiveBlurPx: 0,
	motionIntensity: 1,
	reduceMotion: true,
	visibleContextLines: 2,
};

const scenarios: Record<ScenarioName, Scenario> = {
	"album-art-instrumental": {
		timestamp: 0,
		mode: "album-art",
	},
	"background-opposite": {
		timestamp: 2.4,
		settings: {
			...settingsForVisuals,
			alignmentMode: "left",
		},
		lyrics: {
			type: "syllable",
			startTime: 0,
			endTime: 6,
			content: [
				{
					type: "vocal",
					oppositeAligned: true,
					lead: {
						startTime: 0,
						endTime: 5,
						syllables: [
							{ text: "Lead", startTime: 0, endTime: 1.8, isPartOfWord: false },
							{ text: "line", startTime: 1.8, endTime: 5, isPartOfWord: false },
						],
					},
					background: [
						{
							startTime: 1.1,
							endTime: 4.6,
							syllables: [
								{ text: "soft", startTime: 1.1, endTime: 2.4, isPartOfWord: false },
								{ text: "echo", startTime: 2.4, endTime: 4.6, isPartOfWord: false },
							],
						},
					],
				},
			],
		},
	},
	"frame-interlude": {
		timestamp: 7,
		settings: {
			...settingsForVisuals,
			interludeStyle: "frame",
			showInterludes: false,
		},
		lyrics: {
			type: "line",
			startTime: 0,
			endTime: 14,
			content: [
				{ type: "vocal", text: "Before the break", startTime: 0, endTime: 4, oppositeAligned: false },
				{ type: "interlude", startTime: 4, endTime: 10 },
				{ type: "vocal", text: "After the break returns", startTime: 10, endTime: 14, oppositeAligned: false },
			],
		},
	},
	"line-sync": {
		timestamp: 5,
		settings: {
			...settingsForVisuals,
			alignmentMode: "center",
		},
		lyrics: lineLyrics([
			["Before the chorus arrives", 0, 3],
			["Same lyric width stays steady", 3, 7],
			["Same lyric width stays steady", 7, 11],
			["After the chorus resolves", 11, 15],
		]),
	},
	"word-sync": {
		timestamp: 4.2,
		settings: settingsForVisuals,
		lyrics: syllableLyrics([
			[
				["먼", 0, 0.5],
				["저", 0.5, 1],
				["지나간", 1, 2],
			],
			[
				["빛", 3, 3.6],
				["이", 3.6, 4.1, true],
				["나는", 4.1, 4.9],
				["밤", 4.9, 5.8],
			],
			[
				["다시", 6, 6.8],
				["돌아와", 6.8, 8],
			],
		]),
	},
	"korean-tail": {
		timestamp: 4.9,
		settings: settingsForVisuals,
		lyrics: syllableLyrics([
			[["조용히", 0, 1.2]],
			[
				["널", 2, 2.45],
				["사랑해", 2.45, 6.4],
			],
			[["말할게", 6.6, 8]],
		]),
	},
	"multiline-active-row": {
		timestamp: 4.8,
		settings: {
			...settingsForVisuals,
			visibleContextLines: 1,
		},
		lyrics: lineLyrics([
			["Before the long line", 0, 2.5],
			["This active lyric wraps across multiple visual lines without changing measure", 3, 7],
			["This active lyric wraps across multiple visual lines without changing measure", 7, 11],
			["After the long line", 11, 13],
		]),
	},
};

window.auraVisualHarness = {
	renderScenario(name, timestamp) {
		const scenario = scenarios[name];
		if (!scenario) {
			throw new Error(`Unknown visual scenario: ${name}`);
		}
		pipRoot.className = "is-playing";
		if (scenario.mode === "album-art") {
			renderer.showAlbumArt(mountRoot);
			return;
		}
		if (!scenario.lyrics) {
			throw new Error(`Scenario has no lyrics: ${name}`);
		}
		renderer.mount(mountRoot, {
			lyrics: structuredClone(scenario.lyrics),
			settings: {
				...structuredClone(DEFAULT_SETTINGS),
				...scenario.settings,
			},
			provider: "visual",
		});
		for (let frame = 0; frame < 3; frame += 1) {
			renderer.update(timestamp ?? scenario.timestamp, 1 / 60);
		}
	},
};

function lineLyrics(lines: Array<[text: string, startTime: number, endTime: number]>): LineLyrics {
	return {
		type: "line",
		startTime: lines[0]?.[1] ?? 0,
		endTime: lines.at(-1)?.[2] ?? 0,
		content: lines.map(([text, startTime, endTime]) => ({
			type: "vocal",
			text,
			startTime,
			endTime,
			oppositeAligned: false,
		})),
	};
}

function syllableLyrics(groups: Array<Array<[text: string, startTime: number, endTime: number, isPartOfWord?: boolean]>>): SyllableLyrics {
	return {
		type: "syllable",
		startTime: groups[0]?.[0]?.[1] ?? 0,
		endTime: groups.at(-1)?.at(-1)?.[2] ?? 0,
		content: groups.map((syllables) => ({
			type: "vocal",
			oppositeAligned: false,
			lead: {
				startTime: syllables[0]?.[1] ?? 0,
				endTime: syllables.at(-1)?.[2] ?? 0,
				syllables: syllables.map(([text, startTime, endTime, isPartOfWord = false]) => ({
					text,
					startTime,
					endTime,
					isPartOfWord,
				})),
			},
		})),
	};
}
