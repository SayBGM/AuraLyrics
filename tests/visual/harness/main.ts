import { buildTrackTheme, type TrackTheme } from "../../../src/app/TrackThemeService";
import type { TrackIdentity } from "../../../src/domain/types";
import type { LineLyrics, LyricsDocument, SyllableLyrics } from "../../../src/lyrics/types";
import { LyricsRenderer } from "../../../src/renderer/LyricsRenderer";
import { DEFAULT_SETTINGS, type ExtensionSettings, SettingsStore } from "../../../src/settings/SettingsStore";
import { SettingsView } from "../../../src/settings/SettingsView";
import { pipStyles } from "../../../src/styles/pipStyles";

type ScenarioName =
	| "album-art-instrumental"
	| "aurora-loading-dark"
	| "aurora-metadata-light"
	| "background-opposite"
	| "frame-interlude"
	| "line-sync"
	| "word-sync"
	| "synthetic-word-sync"
	| "korean-tail"
	| "multiline-active-row"
	| "settings-general";

type Scenario = {
	lyrics?: LyricsDocument;
	settings?: Partial<ExtensionSettings>;
	timestamp: number;
	timingSource?: "native" | "synthetic";
	mode?: "album-art" | "lyrics" | "metadata" | "settings";
	metadata?: {
		mode: "loading" | "persistent";
		track: TrackIdentity;
	};
	theme?: TrackTheme;
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

body {
	margin: 0;
	min-width: 100vw;
	min-height: 100vh;
	background: #070708;
}

.harness-settings-overlay {
	position: fixed;
	inset: 0;
	display: grid;
	place-items: center;
	box-sizing: border-box;
	padding: 16px;
	background: rgba(0, 0, 0, 0.72);
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

const darkAuroraCover = svgCover({
	background: "#102d3a",
	accent: "#63d2d5",
	secondary: "#183f52",
	flare: "#b86f85",
});
const lightAuroraCover = svgCover({
	background: "#f5d8b4",
	accent: "#d1696f",
	secondary: "#f8ecd8",
	flare: "#e7a86f",
});

const scenarios: Record<ScenarioName, Scenario> = {
	"album-art-instrumental": {
		timestamp: 0,
		mode: "album-art",
	},
	"aurora-loading-dark": {
		timestamp: 0,
		mode: "metadata",
		metadata: {
			mode: "loading",
			track: {
				uri: "spotify:track:visual-dark",
				title: "Midnight Bloom",
				artist: "Haneul Park",
				album: "Afterglow",
				durationMs: 213_000,
				coverUrl: darkAuroraCover,
				isLocal: false,
			},
		},
		theme: buildTrackTheme({
			DARK_VIBRANT: "#102d3a",
			DESATURATED: "#3c6870",
			LIGHT_VIBRANT: "#8ce6e3",
			PROMINENT: "#102d3a",
			VIBRANT: "#63d2d5",
			VIBRANT_NON_ALARMING: "#63d2d5",
		}),
	},
	"aurora-metadata-light": {
		timestamp: 0,
		mode: "metadata",
		metadata: {
			mode: "persistent",
			track: {
				uri: "spotify:track:visual-light",
				title: "Sunlit Letters",
				artist: "Mira Lee",
				album: "Paper Skies",
				durationMs: 188_000,
				coverUrl: lightAuroraCover,
				isLocal: false,
			},
		},
		theme: buildTrackTheme({
			DARK_VIBRANT: "#9d5b54",
			DESATURATED: "#caa98e",
			LIGHT_VIBRANT: "#f8ecd8",
			PROMINENT: "#f5d8b4",
			VIBRANT: "#d1696f",
			VIBRANT_NON_ALARMING: "#d1696f",
		}),
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
	"synthetic-word-sync": {
		timestamp: 4.2,
		settings: settingsForVisuals,
		timingSource: "synthetic",
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
	"settings-general": {
		timestamp: 0,
		mode: "settings",
	},
};

window.auraVisualHarness = {
	renderScenario(name, timestamp) {
		const scenario = scenarios[name];
		if (!scenario) {
			throw new Error(`Unknown visual scenario: ${name}`);
		}
		if (scenario.mode === "settings") {
			renderSettingsScenario();
			return;
		}
		pipRoot.className = scenario.mode === "metadata" ? "is-playing controls-visible" : "is-playing";
		if (scenario.mode === "metadata") {
			if (!scenario.metadata || !scenario.theme) {
				throw new Error(`Metadata scenario is incomplete: ${name}`);
			}
			const cover = pipRoot.querySelector<HTMLImageElement>(":scope > .pip-cover");
			if (!cover) {
				throw new Error("Visual harness background cover was not found.");
			}
			cover.src = scenario.metadata.track.coverUrl ?? "";
			applyTheme(pipRoot, scenario.theme);
			renderer.showTrackMetadata(mountRoot, scenario.metadata, {
				...structuredClone(DEFAULT_SETTINGS),
				...scenario.settings,
			});
			return;
		}
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
			timingSource: scenario.timingSource,
		});
		for (let frame = 0; frame < 3; frame += 1) {
			renderer.update(timestamp ?? scenario.timestamp, 1 / 60);
		}
	},
};

function renderSettingsScenario(): void {
	const values = new Map<string, string>();
	const store = new SettingsStore({
		get: (key) => values.get(key),
		set: (key, value) => {
			values.set(key, value);
			return true;
		},
	});
	window.Spicetify = {
		PopupModal: {
			display: ({ content }) => {
				const overlay = document.createElement("div");
				overlay.className = "harness-settings-overlay";
				const modal = document.createElement("div");
				modal.className = "main-trackCreditsModal-container";
				const main = document.createElement("div");
				main.className = "main-trackCreditsModal-mainSection";
				const originalCredits = document.createElement("div");
				originalCredits.className = "main-trackCreditsModal-originalCredits";
				originalCredits.append(content);
				main.append(originalCredits);
				modal.append(main);
				overlay.append(modal);
				document.body.replaceChildren(overlay);
			},
		},
	} as NonNullable<typeof window.Spicetify>;
	const settingsView = new SettingsView(store, [], {
		onRefreshLyrics: () => undefined,
		onClearCache: () => undefined,
		onMusixmatchTokenAccepted: () => undefined,
		onRefreshMusixmatchToken: async () => undefined,
	});
	settingsView.open();
}

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

function applyTheme(root: HTMLElement, theme: TrackTheme): void {
	const properties = {
		"--pip-accent-color": theme.accent,
		"--pip-accent-rgb": theme.accentRgb,
		"--pip-background-color": theme.background,
		"--pip-surface-tone": theme.surfaceTone,
		"--pip-foreground-color": theme.foreground,
		"--pip-foreground-rgb": theme.foregroundRgb,
		"--pip-synthetic-wake-color": theme.syntheticWakeForeground,
		"--pip-synthetic-wake-rgb": theme.syntheticWakeRgb,
		"--pip-muted-foreground-color": theme.mutedForeground,
		"--pip-muted-rgb": theme.mutedRgb,
		"--pip-glow-rgb": theme.glowRgb,
		"--pip-scrim-rgb": theme.scrimRgb,
		"--pip-scrim-opacity": String(theme.scrimOpacity),
	};
	for (const [property, value] of Object.entries(properties)) {
		root.style.setProperty(property, value);
	}
	root.dataset.surfaceTone = theme.surfaceTone;
}

function svgCover(colors: { background: string; accent: string; secondary: string; flare: string }): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">
		<rect width="900" height="900" fill="${colors.background}"/>
		<circle cx="210" cy="160" r="360" fill="${colors.secondary}" opacity="0.95"/>
		<circle cx="720" cy="690" r="380" fill="${colors.accent}" opacity="0.78"/>
		<circle cx="610" cy="220" r="170" fill="${colors.flare}" opacity="0.72"/>
		<path d="M100 690 C280 520 540 790 820 520" stroke="${colors.secondary}" stroke-width="74" fill="none" stroke-linecap="round" opacity="0.8"/>
	</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
