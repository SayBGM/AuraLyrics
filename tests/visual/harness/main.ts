import { outroMetadataThresholdSec } from "../../../src/app/OutroPresentationPolicy";
import { buildTrackTheme, type TrackTheme } from "../../../src/app/TrackThemeService";
import type { TrackIdentity } from "../../../src/domain/types";
import type { LineLyrics, LyricsDocument, StaticLyrics, SyllableLyrics } from "../../../src/lyrics/types";
import { COVER_CROSSFADE_DURATION_MS, PipCoverTransitionController } from "../../../src/pip/PipCoverTransitionController";
import { LyricsRenderer } from "../../../src/renderer/LyricsRenderer";
import {
	SCENE_TRANSITION_DURATION_MS,
	type SceneTransitionDirection,
	type SceneTransitionHandle,
} from "../../../src/renderer/SceneTransitionController";
import { DEFAULT_SETTINGS, type ExtensionSettings, SettingsStore } from "../../../src/settings/SettingsStore";
import { SettingsView } from "../../../src/settings/SettingsView";
import type { SettingsSection } from "../../../src/settings/settingsViewTypes";
import { pipStyles } from "../../../src/styles/pipStyles";

type ScenarioName =
	| "album-art-instrumental"
	| "aurora-intro-ready"
	| "aurora-loading-dark"
	| "aurora-metadata-light"
	| "background-opposite"
	| "frame-interlude"
	| "highlight-marker-wave"
	| "interlude-dots"
	| "interlude-wave"
	| "line-sync"
	| "provider-credit"
	| "reduced-motion-lyrics"
	| "static-document"
	| "translated-line"
	| "word-sync"
	| "synthetic-word-sync"
	| "korean-tail"
	| "multiline-active-row"
	| "parenthetical-echo"
	| "settings-general"
	| "settings-lyrics"
	| "settings-appearance"
	| "settings-motion"
	| "settings-providers"
	| "settings-advanced"
	| "settings-lyrics-ko"
	| "settings-providers-ja";

type Scenario = {
	lyrics?: LyricsDocument;
	settings?: Partial<ExtensionSettings>;
	timestamp: number;
	timingSource?: "native" | "synthetic";
	mode?: "album-art" | "lyrics" | "metadata" | "settings";
	metadata?: {
		mode: "intro" | "loading" | "persistent";
		track: TrackIdentity;
	};
	theme?: TrackTheme;
	settingsLanguage?: ExtensionSettings["language"];
	settingsSection?: SettingsSection;
};

type TransitionScenarioName = "metadata-next" | "metadata-previous" | "outro-up" | "reduced-motion-next" | "short-tail-next";
type TransitionPhase = "start" | "mid";

type RectSnapshot = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type ChromeRects = Record<"border" | "close" | "controls", RectSnapshot>;

type CoverHarnessState = {
	lastAnimate: boolean | null;
	planes: Array<{
		duration: string;
		inlineTransition: string;
		state: string | null;
	}>;
};

type TransitionPolicyState = {
	durationSec: number;
	metadataSkipped: boolean;
	thresholdSec: number | null;
	updateTimestampSec: number;
};

declare global {
	interface Window {
		auraVisualHarness?: {
			completeTransition(): Promise<void>;
			getCoverState(): CoverHarnessState;
			getTransitionChromeBaseline(): ChromeRects;
			getTransitionPolicyState(): TransitionPolicyState;
			renderScenario(name: ScenarioName, timestamp?: number): void;
			renderTransitionScenario(name: TransitionScenarioName, phase?: TransitionPhase): void;
		};
	}
}

const renderer = new LyricsRenderer();
const mountRoot = document.querySelector<HTMLElement>("#aura-visual-root");
const pipRoot = document.querySelector<HTMLElement>("#aura-lyrics-root");
const coverLayer = document.querySelector<HTMLElement>("#aura-lyrics-root > .pip-cover-layer");

if (!mountRoot || !pipRoot || !coverLayer) {
	throw new Error("AuraLyrics visual harness root was not found.");
}

const visualMountRoot = mountRoot;
const visualPipRoot = pipRoot;
const visualCoverLayer = coverLayer;
const coverController = new PipCoverTransitionController(visualCoverLayer, (hasCover) => {
	visualPipRoot.classList.toggle("cover-missing", !hasCover);
});

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

*:not(.pip-cover), *::before, *::after {
	animation-duration: 0s !important;
	animation-delay: 0s !important;
	transition-duration: 0s !important;
	transition-delay: 0s !important;
}

.pip-content > [data-scene-plane] {
	animation-duration: ${SCENE_TRANSITION_DURATION_MS}ms !important;
	animation-delay: var(--aura-visual-transition-delay, 0ms) !important;
	animation-play-state: paused !important;
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
const defaultVisualCover =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'%3E%3Crect width='900' height='900' fill='%23132123'/%3E%3Ccircle cx='450' cy='430' r='250' fill='%232b7378'/%3E%3Ccircle cx='300' cy='310' r='145' fill='%23f5c15f'/%3E%3Ccircle cx='590' cy='580' r='165' fill='%23d94f70'/%3E%3Cpath d='M150 680 C330 540 520 800 750 630' stroke='%23f8f6ed' stroke-width='48' fill='none' stroke-linecap='round'/%3E%3C/svg%3E";

const transitionTracks = {
	current: visualTrack("visual-current", "Current Horizon", "Haneul Park", "Afterglow", darkAuroraCover),
	next: visualTrack("visual-next", "Next Light", "Mira Lee", "Paper Skies", lightAuroraCover),
	previous: visualTrack("visual-previous", "Before Dawn", "Haneul Park", "Night Letters", darkAuroraCover),
	shortTail: visualTrack("visual-short-tail", "Short Tail", "Haneul Park", "Afterglow", darkAuroraCover, 5_500),
};

const outroLyrics = lineLyrics([
	["Hold on through the final line", 0, 4],
	["Let the last word settle", 4, 8],
]);
const shortTailLyrics = lineLyrics([
	["The final lyric ends near the track boundary", 0, 4.6],
	["No room for current metadata", 4.6, 5],
]);

let transitionChromeBaseline: ChromeRects | undefined;
let transitionPolicy: TransitionPolicyState | undefined;
let lastCoverAnimate: boolean | null = null;
let controlledCoverCompletion: (() => void) | undefined;
let controlledTransition:
	| {
			complete: () => void;
			handle: SceneTransitionHandle;
	  }
	| undefined;

setCoverAndLoad(defaultVisualCover, false);

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
	"aurora-intro-ready": {
		timestamp: 0,
		mode: "metadata",
		metadata: {
			mode: "intro",
			track: {
				uri: "spotify:track:visual-intro",
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
			alignmentMode: "natural",
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
			showInterludes: true,
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
	"highlight-marker-wave": {
		timestamp: 4.35,
		settings: {
			...settingsForVisuals,
			highlightEffect: "marker",
			highlightMotion: "wave",
			reduceMotion: false,
		},
		theme: buildTrackTheme({
			DARK_VIBRANT: "#102d3a",
			DESATURATED: "#3c6870",
			LIGHT_VIBRANT: "#8ce6e3",
			PROMINENT: "#102d3a",
			VIBRANT: "#63d2d5",
			VIBRANT_NON_ALARMING: "#63d2d5",
		}),
		lyrics: syllableLyrics([
			[["지나간", 0, 2]],
			[
				["빛", 3, 3.6],
				["이", 3.6, 4.1, true],
				["나는", 4.1, 4.9],
				["밤", 4.9, 5.8],
			],
			[["돌아와", 6, 8]],
		]),
	},
	"interlude-dots": {
		timestamp: 7,
		settings: { ...settingsForVisuals, interludeStyle: "dots", showInterludes: true },
		lyrics: interludeLyrics(),
	},
	"interlude-wave": {
		timestamp: 7,
		settings: { ...settingsForVisuals, interludeStyle: "wave", showInterludes: true },
		lyrics: interludeLyrics(),
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
	"provider-credit": {
		timestamp: 12,
		settings: settingsForVisuals,
		lyrics: lineLyrics([
			["This is the final lyric", 0, 4],
			["The credits follow", 4, 8],
		]),
	},
	"reduced-motion-lyrics": {
		timestamp: 5,
		settings: { ...settingsForVisuals, reduceMotion: true },
		lyrics: lineLyrics([
			["Motion is kept quiet", 0, 3],
			["Color carries the focus", 3, 7],
			["Context stays readable", 7, 11],
		]),
	},
	"static-document": {
		timestamp: 0,
		settings: { ...settingsForVisuals, showTranslation: true },
		lyrics: {
			type: "static",
			lines: [
				{ text: "창가에 머문 빛", translatedText: "Light resting by the window" },
				{ text: "조용히 번지는 밤", translatedText: "Night spreading quietly" },
				{ text: "우리의 이야기를 적어", translatedText: "Write down our story" },
				{ text: "다시 아침이 올 때까지", translatedText: "Until morning comes again" },
			],
		} satisfies StaticLyrics,
	},
	"translated-line": {
		timestamp: 5,
		settings: { ...settingsForVisuals, showTranslation: true },
		lyrics: {
			...lineLyrics([
				["Before the translated line", 0, 3],
				["별빛이 우리를 비춰", 3, 7],
				["After the translated line", 7, 11],
			]),
			content: [
				{ type: "vocal", text: "Before the translated line", startTime: 0, endTime: 3, oppositeAligned: false },
				{
					type: "vocal",
					text: "별빛이 우리를 비춰",
					translatedText: "Starlight shines on us",
					startTime: 3,
					endTime: 7,
					oppositeAligned: false,
				},
				{ type: "vocal", text: "After the translated line", startTime: 7, endTime: 11, oppositeAligned: false },
			],
		},
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
		settings: {
			...settingsForVisuals,
			reduceMotion: false,
		},
		timingSource: "synthetic",
		theme: buildTrackTheme({
			DARK_VIBRANT: "#102d3a",
			DESATURATED: "#3c6870",
			LIGHT_VIBRANT: "#8ce6e3",
			PROMINENT: "#102d3a",
			VIBRANT: "#63d2d5",
			VIBRANT_NON_ALARMING: "#63d2d5",
		}),
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
	"parenthetical-echo": {
		timestamp: 3.4,
		settings: {
			...settingsForVisuals,
			alignmentMode: "center",
			fontScale: 1.08,
			highlightEffect: "glow-sweep",
			highlightMotion: "bounce",
			reduceMotion: false,
		},
		lyrics: {
			type: "syllable",
			startTime: 0,
			endTime: 8,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 8,
						syllables: [
							{ text: "빛나는", startTime: 0, endTime: 1.5, isPartOfWord: false },
							{ text: "밤", startTime: 1.5, endTime: 2.2, isPartOfWord: false },
							{
								text: "(오래도록 우리 곁을 맴돌던 작은 목소리)",
								startTime: 2.2,
								endTime: 5.2,
								isPartOfWord: false,
							},
							{ text: "다시", startTime: 5.2, endTime: 6.4, isPartOfWord: false },
							{ text: "찾아와", startTime: 6.4, endTime: 8, isPartOfWord: false },
						],
					},
				},
			],
		},
	},
	"settings-general": {
		timestamp: 0,
		mode: "settings",
		settingsSection: "general",
	},
	"settings-lyrics": {
		timestamp: 0,
		mode: "settings",
		settingsSection: "lyrics",
	},
	"settings-appearance": {
		timestamp: 0,
		mode: "settings",
		settingsSection: "appearance",
	},
	"settings-motion": {
		timestamp: 0,
		mode: "settings",
		settingsSection: "motion",
	},
	"settings-providers": {
		timestamp: 0,
		mode: "settings",
		settingsSection: "providers",
	},
	"settings-advanced": {
		timestamp: 0,
		mode: "settings",
		settingsSection: "advanced",
	},
	"settings-lyrics-ko": {
		timestamp: 0,
		mode: "settings",
		settingsLanguage: "ko",
		settingsSection: "lyrics",
	},
	"settings-providers-ja": {
		timestamp: 0,
		mode: "settings",
		settingsLanguage: "ja",
		settingsSection: "providers",
	},
};

window.auraVisualHarness = {
	async completeTransition() {
		const transition = controlledTransition;
		if (!transition) {
			throw new Error("No controlled visual transition is pending.");
		}
		controlledTransition = undefined;
		const coverCompletion = controlledCoverCompletion;
		controlledCoverCompletion = undefined;
		coverCompletion?.();
		transition.complete();
		await transition.handle.settled;
	},
	getCoverState() {
		return {
			lastAnimate: lastCoverAnimate,
			planes: Array.from(visualCoverLayer.querySelectorAll<HTMLImageElement>(":scope > .pip-cover"), (cover) => ({
				duration: getComputedStyle(cover).transitionDuration,
				inlineTransition: cover.style.transition,
				state: cover.dataset.coverState ?? null,
			})),
		};
	},
	getTransitionChromeBaseline() {
		if (!transitionChromeBaseline) {
			throw new Error("No visual transition chrome baseline was captured.");
		}
		return structuredClone(transitionChromeBaseline);
	},
	getTransitionPolicyState() {
		if (!transitionPolicy) {
			throw new Error("No visual transition policy state was captured.");
		}
		return structuredClone(transitionPolicy);
	},
	renderScenario(name, timestamp) {
		const scenario = scenarios[name];
		if (!scenario) {
			throw new Error(`Unknown visual scenario: ${name}`);
		}
		if (scenario.mode === "settings") {
			renderSettingsScenario(scenario.settingsSection ?? "general", scenario.settingsLanguage ?? "en");
			return;
		}
		pipRoot.className = scenario.mode === "metadata" ? "is-playing controls-visible" : "is-playing";
		if (scenario.mode === "metadata") {
			if (!scenario.metadata || !scenario.theme) {
				throw new Error(`Metadata scenario is incomplete: ${name}`);
			}
			setCoverAndLoad(scenario.metadata.track.coverUrl, false);
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
		if (scenario.theme) {
			applyTheme(pipRoot, scenario.theme);
		}
		setCoverAndLoad(darkAuroraCover, false);
		renderer.mount(mountRoot, {
			lyrics: structuredClone(scenario.lyrics),
			settings: {
				...structuredClone(DEFAULT_SETTINGS),
				...scenario.settings,
			},
			provider: "lrclib",
			timingSource: scenario.timingSource,
		});
		for (let frame = 0; frame < 3; frame += 1) {
			renderer.update(timestamp ?? scenario.timestamp, 1 / 60);
		}
	},
	renderTransitionScenario(name, phase = "start") {
		renderControlledTransition(name, phase);
	},
};

function renderControlledTransition(name: TransitionScenarioName, phase: TransitionPhase): void {
	controlledTransition = undefined;
	controlledCoverCompletion = undefined;
	transitionPolicy = undefined;
	renderer.destroy();
	visualPipRoot.className = `is-playing controls-visible${name === "reduced-motion-next" ? " reduce-motion" : ""}`;
	visualMountRoot.style.setProperty("--aura-visual-transition-delay", phase === "mid" ? `-${SCENE_TRANSITION_DURATION_MS / 2}ms` : "0ms");
	applyTheme(
		visualPipRoot,
		buildTrackTheme({
			DARK_VIBRANT: "#102d3a",
			DESATURATED: "#3c6870",
			LIGHT_VIBRANT: "#8ce6e3",
			PROMINENT: "#102d3a",
			VIBRANT: "#63d2d5",
			VIBRANT_NON_ALARMING: "#63d2d5",
		})
	);
	const sourceTrack = name === "short-tail-next" ? transitionTracks.shortTail : transitionTracks.current;
	setCoverAndLoad(sourceTrack.coverUrl, false);

	const settings = transitionSettings(false);
	if (name === "outro-up") {
		const durationSec = sourceTrack.durationMs / 1_000;
		const thresholdSec = outroMetadataThresholdSec(outroLyrics, settings.syncPreference, durationSec);
		if (thresholdSec !== 10) {
			throw new Error(`Expected the outro metadata threshold to equal 10 seconds, received ${String(thresholdSec)}.`);
		}
		transitionPolicy = { durationSec, metadataSkipped: false, thresholdSec, updateTimestampSec: thresholdSec };
		renderer.mount(visualMountRoot, {
			lyrics: outroLyrics,
			settings,
			provider: "lrclib",
		});
		renderer.update(thresholdSec, 1 / 60);
	} else if (name === "short-tail-next") {
		const durationSec = sourceTrack.durationMs / 1_000;
		const thresholdSec = outroMetadataThresholdSec(shortTailLyrics, settings.syncPreference, durationSec);
		if (thresholdSec !== undefined) {
			throw new Error(`Expected the short-tail metadata threshold to be skipped, received ${thresholdSec}.`);
		}
		transitionPolicy = { durationSec, metadataSkipped: true, thresholdSec: null, updateTimestampSec: durationSec };
		renderer.mount(visualMountRoot, {
			lyrics: shortTailLyrics,
			settings,
			provider: "lrclib",
		});
		renderer.update(durationSec, 1 / 60);
	} else {
		renderer.showTrackMetadata(visualMountRoot, { mode: "persistent", track: transitionTracks.current }, settings);
	}

	transitionChromeBaseline = measureChromeRects();
	const targetTrack =
		name === "metadata-previous" ? transitionTracks.previous : name === "outro-up" ? transitionTracks.current : transitionTracks.next;
	const direction: SceneTransitionDirection = name === "metadata-previous" ? "previous" : name === "outro-up" ? "up" : "next";
	const targetSettings = transitionSettings(name === "reduced-motion-next");
	if (targetTrack.coverUrl !== sourceTrack.coverUrl) {
		controlledCoverCompletion = setCoverAndLoad(targetTrack.coverUrl, name !== "reduced-motion-next", name !== "reduced-motion-next");
	}
	const presentTarget = () =>
		renderer.showTrackMetadata(visualMountRoot, { mode: "persistent", track: targetTrack }, targetSettings, {
			animate: true,
			direction,
		});

	if (name === "reduced-motion-next") {
		presentTarget();
		return;
	}
	captureTransitionCompletion(presentTarget);
}

function captureTransitionCompletion(present: () => SceneTransitionHandle): void {
	const captured = captureTimer(SCENE_TRANSITION_DURATION_MS, present);
	if (!captured.complete) {
		throw new Error("Scene transition completion timer was not captured.");
	}
	controlledTransition = { complete: captured.complete, handle: captured.value };
}

function setCoverAndLoad(url: string | undefined, animate: boolean, controlCompletion = false): (() => void) | undefined {
	lastCoverAnimate = animate;
	const load = () => {
		coverController.setCover(url, { animate });
		const pending = visualCoverLayer.querySelector<HTMLImageElement>(":scope > .pip-cover[data-cover-state='pending']");
		pending?.dispatchEvent(new Event("load"));
	};
	if (!controlCompletion) {
		load();
		return undefined;
	}
	const captured = captureTimer(COVER_CROSSFADE_DURATION_MS, load);
	if (!captured.complete) {
		throw new Error("Cover crossfade completion timer was not captured.");
	}
	return captured.complete;
}

function captureTimer<T>(durationMs: number, action: () => T): { complete?: () => void; value: T } {
	let complete: (() => void) | undefined;
	const originalSetTimeout = window.setTimeout;
	window.setTimeout = ((handler: TimerHandler, timeout?: number) => {
		if (timeout === durationMs && typeof handler === "function") {
			complete = () => handler();
			return 2_147_483_647;
		}
		return originalSetTimeout(handler, timeout);
	}) as typeof window.setTimeout;
	let value: T;
	try {
		value = action();
	} finally {
		window.setTimeout = originalSetTimeout;
	}
	return { complete, value };
}

function transitionSettings(reduceMotion: boolean): ExtensionSettings {
	return {
		...structuredClone(DEFAULT_SETTINGS),
		fontFamily: "Arial",
		fontScale: 1,
		inactiveBlurPx: 0,
		motionEnabled: true,
		motionIntensity: 1,
		reduceMotion,
		visibleContextLines: 2,
	};
}

function measureChromeRects(): ChromeRects {
	const measure = (selector: string): RectSnapshot => {
		const element = document.querySelector<HTMLElement>(selector);
		if (!element) {
			throw new Error(`Missing visual harness chrome element: ${selector}`);
		}
		const rect = element.getBoundingClientRect();
		return {
			x: Number(rect.x.toFixed(3)),
			y: Number(rect.y.toFixed(3)),
			width: Number(rect.width.toFixed(3)),
			height: Number(rect.height.toFixed(3)),
		};
	};
	return {
		border: measure(".pip-border-frame"),
		close: measure(".pip-close"),
		controls: measure(".pip-controls"),
	};
}

function renderSettingsScenario(section: SettingsSection, language: ExtensionSettings["language"]): void {
	const values = new Map<string, string>();
	const store = new SettingsStore({
		get: (key) => values.get(key),
		set: (key, value) => {
			values.set(key, value);
			return true;
		},
	});
	store.update({ language });
	if (section === "providers") {
		store.update({ providers: { ...store.get().providers, musixmatchToken: "visual-mxm-token" } });
	}
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
		getCurrentTrackLyricsDelay: () => ({
			artist: "Haneul Park",
			delayMs: 150,
			defaultDelayMs: 0,
			hasOverride: true,
			title: "Midnight Bloom",
			uri: "spotify:track:visual-settings",
		}),
		onAdjustCurrentTrackLyricsDelay: () => true,
		onRefreshLyrics: async () => undefined,
		onClearCache: () => undefined,
		onMusixmatchTokenAccepted: () => undefined,
		onRefreshMusixmatchToken: async () => undefined,
		onResetCurrentTrackLyricsDelay: () => true,
	});
	settingsView.open();
	if (section !== "general") {
		document.querySelector<HTMLButtonElement>(`[role="tab"][data-section="${section}"]`)?.click();
	}
}

function interludeLyrics(): LineLyrics {
	return {
		type: "line",
		startTime: 0,
		endTime: 14,
		content: [
			{ type: "vocal", text: "Before the break", startTime: 0, endTime: 4, oppositeAligned: false },
			{ type: "interlude", startTime: 4, endTime: 10 },
			{ type: "vocal", text: "After the break returns", startTime: 10, endTime: 14, oppositeAligned: false },
		],
	};
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

function visualTrack(uriSuffix: string, title: string, artist: string, album: string, coverUrl: string, durationMs = 210_000): TrackIdentity {
	return {
		uri: `spotify:track:${uriSuffix}`,
		title,
		artist,
		album,
		durationMs,
		coverUrl,
		isLocal: false,
	};
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
