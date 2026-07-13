import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LineLyrics, StaticLyrics, SyllableLyrics, TrackIdentity } from "../../src/lyrics/types";
import { interludeKey, LyricsRenderer } from "../../src/renderer/LyricsRenderer";
import { SCENE_TRANSITION_DURATION_MS } from "../../src/renderer/SceneTransitionController";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsStore";

type RendererMountOptions = Parameters<LyricsRenderer["mount"]>[1];

const mountRenderer = (
	renderer: LyricsRenderer,
	root: HTMLElement,
	lyrics: RendererMountOptions["lyrics"],
	settings: RendererMountOptions["settings"],
	provider?: RendererMountOptions["provider"],
	waveforms?: RendererMountOptions["waveforms"],
	rhythm?: RendererMountOptions["rhythm"]
): void => {
	renderer.mount(root, { lyrics, settings, provider, waveforms, rhythm });
};

const transitionLyrics = (label: string): LineLyrics => ({
	type: "line",
	startTime: 0,
	endTime: 10,
	content: [
		{ type: "vocal", text: `${label} first`, startTime: 0, endTime: 5, oppositeAligned: false },
		{ type: "vocal", text: `${label} second`, startTime: 5, endTime: 10, oppositeAligned: false },
	],
});

const transitionTrack = (title: string): TrackIdentity => ({
	uri: `spotify:track:${title.toLowerCase().replaceAll(" ", "-")}`,
	title,
	artist: "Aura",
	album: "Transitions",
	durationMs: 10_000,
	isLocal: false,
});

describe("LyricsRenderer", () => {
	describe("scene presentation", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			document.body.replaceChildren();
		});

		afterEach(() => {
			vi.clearAllTimers();
			vi.useRealTimers();
			document.body.replaceChildren();
		});

		test("transitions lyrics up to persistent metadata and settles with only metadata after 720ms", async () => {
			const root = document.createElement("main");
			const renderer = new LyricsRenderer();
			renderer.mount(root, { lyrics: transitionLyrics("Outgoing"), settings: DEFAULT_SETTINGS });

			const handle = renderer.showTrackMetadata(root, { mode: "persistent", track: transitionTrack("Incoming metadata") }, DEFAULT_SETTINGS, {
				direction: "up",
				animate: true,
			});

			const outgoing = root.querySelector<HTMLElement>('[data-scene-plane="outgoing"]');
			const incoming = root.querySelector<HTMLElement>('[data-scene-plane="incoming"]');
			expect(root.classList.contains("scene-transition-up")).toBe(true);
			expect(outgoing?.querySelector(".aura-lyrics .lyrics-track")?.textContent).toContain("Outgoing first");
			expect(incoming?.querySelector(".track-metadata-title")?.textContent).toBe("Incoming metadata");
			expect(root.children).toHaveLength(2);

			await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);

			expect(await handle.settled).toEqual({ generation: 2, completed: true });
			expect(root.children).toHaveLength(1);
			expect(root.querySelector("[data-scene-plane]")).toBeNull();
			expect(root.querySelector(".track-metadata-title")?.textContent).toBe("Incoming metadata");
			expect(root.querySelector(".lyrics-track")).toBeNull();
		});

		test("uses next and previous directions for consecutive metadata scenes and returns each controller handle", async () => {
			const root = document.createElement("main");
			const renderer = new LyricsRenderer();
			renderer.showTrackMetadata(root, { mode: "intro", track: transitionTrack("First") }, DEFAULT_SETTINGS);

			const next = renderer.showTrackMetadata(root, { mode: "intro", track: transitionTrack("Second") }, DEFAULT_SETTINGS, {
				direction: "next",
				animate: true,
			});
			expect(root.classList.contains("scene-transition-next")).toBe(true);
			expect(root.querySelector('[data-scene-plane="outgoing"] .track-metadata-title')?.textContent).toBe("First");
			expect(root.querySelector('[data-scene-plane="incoming"] .track-metadata-title')?.textContent).toBe("Second");
			await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);
			expect(await next.settled).toEqual({ generation: 2, completed: true });

			const previous = renderer.showTrackMetadata(root, { mode: "intro", track: transitionTrack("Third") }, DEFAULT_SETTINGS, {
				direction: "previous",
				animate: true,
			});
			expect(root.classList.contains("scene-transition-previous")).toBe(true);
			expect(root.querySelector('[data-scene-plane="outgoing"] .track-metadata-title')?.textContent).toBe("Second");
			expect(root.querySelector('[data-scene-plane="incoming"] .track-metadata-title')?.textContent).toBe("Third");
			await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);
			expect(await previous.settled).toEqual({ generation: 3, completed: true });
		});

		test("routes status, album art, and lyrics through the shared presenter", async () => {
			const pipRoot = document.createElement("div");
			const root = document.createElement("main");
			pipRoot.append(root);
			const renderer = new LyricsRenderer();
			renderer.showStatus(root, { title: "Status scene" }, DEFAULT_SETTINGS);

			const album = renderer.showAlbumArt(root, { direction: "up", animate: true });
			expect(root.querySelector('[data-scene-plane="outgoing"] .status-card')?.textContent).toContain("Status scene");
			expect(root.querySelector('[data-scene-plane="incoming"] .album-art-scene')).not.toBeNull();
			expect(root.classList.contains("album-art-mode")).toBe(true);
			expect(pipRoot.classList.contains("album-art-mode")).toBe(true);
			await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);
			expect(await album.settled).toEqual({ generation: 2, completed: true });
			expect(root.children).toHaveLength(0);

			renderer.showStatus(root, { title: "Before lyrics" }, DEFAULT_SETTINGS);
			const lyrics = renderer.mount(root, { lyrics: transitionLyrics("Lyrics"), settings: DEFAULT_SETTINGS }, { direction: "next", animate: true });
			expect(root.querySelector('[data-scene-plane="outgoing"] .status-card')?.textContent).toContain("Before lyrics");
			expect(root.querySelector('[data-scene-plane="incoming"] .lyrics-track')?.textContent).toContain("Lyrics first");
			expect(root.classList.contains("album-art-mode")).toBe(false);
			expect(pipRoot.classList.contains("album-art-mode")).toBe(false);
			await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);
			expect(await lyrics.settled).toEqual({ generation: 4, completed: true });
		});

		test.each([
			["reduced motion", { ...DEFAULT_SETTINGS, reduceMotion: true }],
			["disabled motion", { ...DEFAULT_SETTINGS, motionEnabled: false }],
		] as const)("presents a requested animation immediately with %s", async (_label, settings) => {
			const root = document.createElement("main");
			const renderer = new LyricsRenderer();
			renderer.showStatus(root, { title: "Before" }, DEFAULT_SETTINGS);

			const handle = renderer.showTrackMetadata(root, { mode: "persistent", track: transitionTrack("Immediate") }, settings, {
				direction: "next",
				animate: true,
			});

			expect(root.children).toHaveLength(1);
			expect(root.firstElementChild?.classList.contains("track-metadata-scene")).toBe(true);
			expect(root.querySelector("[data-scene-plane]")).toBeNull();
			expect(root.className).toBe("");
			expect(await handle.settled).toEqual({ generation: 2, completed: true });
			expect(vi.getTimerCount()).toBe(0);
		});

		test("keeps callers without presentation options immediate", async () => {
			const root = document.createElement("main");
			const renderer = new LyricsRenderer();
			renderer.showStatus(root, { title: "Before" }, DEFAULT_SETTINGS);

			const handle = renderer.showTrackMetadata(root, { mode: "persistent", track: transitionTrack("Default immediate") }, DEFAULT_SETTINGS);

			expect(root.children).toHaveLength(1);
			expect(root.querySelector("[data-scene-plane]")).toBeNull();
			expect(await handle.settled).toEqual({ generation: 2, completed: true });
		});

		test("updates and applies settings only to the current incoming lyrics resources", () => {
			const root = document.createElement("main");
			const renderer = new LyricsRenderer();
			renderer.mount(root, { lyrics: transitionLyrics("Outgoing"), settings: DEFAULT_SETTINGS });
			renderer.update(1, 1 / 60);

			renderer.mount(root, { lyrics: transitionLyrics("Incoming"), settings: DEFAULT_SETTINGS }, { direction: "up", animate: true });
			renderer.update(6, 1 / 60);
			renderer.applySettings({ ...DEFAULT_SETTINGS, alignmentMode: "left", visibleContextLines: 0 });

			const outgoing = root.querySelector<HTMLElement>('[data-scene-plane="outgoing"]');
			const incoming = root.querySelector<HTMLElement>('[data-scene-plane="incoming"]');
			expect(outgoing?.querySelector(".vocals-group.active")?.textContent).toContain("Outgoing first");
			expect(outgoing?.querySelector(".vocals-group.sung")).toBeNull();
			expect(outgoing?.querySelector(".lyrics-track")?.classList.contains("align-center")).toBe(true);
			expect(outgoing?.querySelector(".lyrics-track")?.classList.contains("align-left")).toBe(false);
			expect(incoming?.querySelector(".vocals-group.active")?.textContent).toContain("Incoming second");
			expect(incoming?.querySelector(".lyrics-track")?.classList.contains("align-left")).toBe(true);
			renderer.destroy();
		});

		test("settles a rapidly replaced handle false and keeps only the latest scene", async () => {
			const root = document.createElement("main");
			const renderer = new LyricsRenderer();
			renderer.showTrackMetadata(root, { mode: "intro", track: transitionTrack("First") }, DEFAULT_SETTINGS);
			const interrupted = renderer.showTrackMetadata(root, { mode: "intro", track: transitionTrack("Second") }, DEFAULT_SETTINGS, {
				direction: "next",
				animate: true,
			});

			const latest = renderer.showStatus(root, { title: "Latest" }, DEFAULT_SETTINGS, { direction: "previous", animate: true });

			expect(await interrupted.settled).toEqual({ generation: 2, completed: false });
			expect(root.querySelector('[data-scene-plane="outgoing"] .track-metadata-title')?.textContent).toBe("Second");
			expect(root.querySelector('[data-scene-plane="incoming"] .status-card')?.textContent).toContain("Latest");
			await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);
			expect(await latest.settled).toEqual({ generation: 3, completed: true });
			expect(root.children).toHaveLength(1);
			expect(root.querySelector(".status-card")?.textContent).toContain("Latest");
			expect(root.querySelector(".track-metadata-scene")).toBeNull();
		});

		test("destroy cancels an active transition and clears DOM, transition classes, and album art mode", async () => {
			const pipRoot = document.createElement("div");
			const root = document.createElement("main");
			pipRoot.append(root);
			const renderer = new LyricsRenderer();
			renderer.showStatus(root, { title: "Before" }, DEFAULT_SETTINGS);
			const handle = renderer.showAlbumArt(root, { direction: "up", animate: true });

			renderer.destroy();

			expect(await handle.settled).toEqual({ generation: 2, completed: false });
			expect(root.children).toHaveLength(0);
			expect(root.className).toBe("");
			expect(pipRoot.classList.contains("album-art-mode")).toBe(false);
			expect(vi.getTimerCount()).toBe(0);
		});

		test("cleans the retired interlude resources and reapplies the current frame state after settlement", async () => {
			const pipRoot = document.createElement("div");
			const root = document.createElement("main");
			pipRoot.append(root);
			Object.defineProperty(pipRoot, "clientWidth", { configurable: true, value: 300 });
			Object.defineProperty(pipRoot, "clientHeight", { configurable: true, value: 100 });
			const frameLyrics: LineLyrics = {
				type: "line",
				startTime: 0,
				endTime: 10,
				content: [{ type: "interlude", startTime: 0, endTime: 10 }],
			};
			const settings = { ...DEFAULT_SETTINGS, interludeStyle: "frame" as const };
			const renderer = new LyricsRenderer();
			renderer.mount(root, { lyrics: frameLyrics, settings });
			renderer.update(5, 1 / 60);
			const retired = root.querySelector<HTMLElement>(".aura-lyrics");

			const handle = renderer.mount(root, { lyrics: frameLyrics, settings }, { direction: "next", animate: true });
			renderer.update(5, 1 / 60);
			const current = root.querySelector<HTMLElement>('[data-scene-plane="incoming"] .aura-lyrics');
			expect(retired?.classList.contains("interlude-active")).toBe(true);
			expect(current?.classList.contains("interlude-active")).toBe(true);
			expect(pipRoot.classList.contains("interlude-frame-active")).toBe(true);

			await vi.advanceTimersByTimeAsync(SCENE_TRANSITION_DURATION_MS);
			expect(await handle.settled).toEqual({ generation: 2, completed: true });
			expect(retired?.classList.contains("interlude-active")).toBe(false);
			expect(current?.classList.contains("interlude-active")).toBe(true);
			expect(root.firstElementChild).toBe(current);
			expect(pipRoot.classList.contains("interlude-frame-active")).toBe(true);
			expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("0.5");
		});

		test("switching roots destroys the old presenter before presenting on the new root", async () => {
			const rootA = document.createElement("main");
			const rootB = document.createElement("main");
			const renderer = new LyricsRenderer();
			renderer.showStatus(rootA, { title: "Root A" }, DEFAULT_SETTINGS);
			const interrupted = renderer.showTrackMetadata(rootA, { mode: "intro", track: transitionTrack("Moving") }, DEFAULT_SETTINGS, {
				direction: "next",
				animate: true,
			});

			const nextRoot = renderer.showStatus(rootB, { title: "Root B" }, DEFAULT_SETTINGS, { direction: "up", animate: true });

			expect(await interrupted.settled).toEqual({ generation: 2, completed: false });
			expect(rootA.children).toHaveLength(0);
			expect(rootA.className).toBe("");
			expect(rootB.querySelector(".status-card")?.textContent).toContain("Root B");
			expect(await nextRoot.settled).toEqual({ generation: 1, completed: true });
		});
	});

	test("applies visual settings to an existing lyrics scene without replacing its DOM", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 10,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 10,
						syllables: [{ text: "Aurora", startTime: 0, endTime: 10, isPartOfWord: false }],
					},
				},
			],
		};
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: DEFAULT_SETTINGS });
		const scene = root.querySelector<HTMLElement>(".aura-lyrics");
		const row = root.querySelector<HTMLElement>(".syllable-row");
		const vocals = root.querySelector<HTMLElement>(".vocals.lead");

		renderer.applySettings({
			...DEFAULT_SETTINGS,
			fontScale: 1.32,
			fontFamily: "Inter",
			backgroundBlurPx: 24,
			backgroundDim: 0.62,
			backgroundSaturation: 0.74,
			vignetteStrength: 0.48,
			inactiveBlurPx: 1.4,
			motionIntensity: 0.45,
			springSoftness: 0.9,
			glowStrength: 0.25,
			reduceMotion: true,
			alignmentMode: "left",
			visibleContextLines: 2,
		});

		expect(root.querySelector(".aura-lyrics")).toBe(scene);
		expect(root.querySelector(".syllable-row")).toBe(row);
		expect(scene?.style.getPropertyValue("--font-scale")).toBe("1.32");
		expect(scene?.style.getPropertyValue("--background-blur")).toBe("24px");
		expect(scene?.style.getPropertyValue("--background-dim")).toBe("0.62");
		expect(scene?.style.getPropertyValue("--background-saturation")).toBe("0.74");
		expect(scene?.style.getPropertyValue("--vignette-strength")).toBe("0.48");
		expect(scene?.style.getPropertyValue("--inactive-blur")).toBe("1.4px");
		expect(scene?.style.getPropertyValue("--motion-intensity")).toBe("0.45");
		expect(scene?.style.getPropertyValue("--spring-softness")).toBe("0.9");
		expect(scene?.style.fontFamily).toBe("Inter, sans-serif");
		expect(scene?.classList.contains("reduce-motion")).toBe(true);
		expect(root.querySelector(".lyrics-track")?.classList.contains("align-left")).toBe(true);
		expect(vocals?.style.getPropertyValue("--glow-strength")).toBe("0.25");
		renderer.applySettings({ ...DEFAULT_SETTINGS, motionIntensity: 0, glowStrength: 0, reduceMotion: true });
		renderer.update(5, 1 / 60);
		const syllable = root.querySelector<HTMLElement>(".syllable.synced");
		expect(syllable?.style.scale).toBe("1");
		expect(syllable?.style.transform).toBe("translateY(calc(var(--lyrics-size) * 0))");
		expect(syllable?.style.getPropertyValue("--text-shadow-opacity")).toBe("0%");
	});

	test.each(["status", "metadata"] as const)("applies live font and motion settings to a %s scene", (sceneKind) => {
		const root = document.createElement("div");
		const renderer = new LyricsRenderer();
		if (sceneKind === "status") {
			renderer.showStatus(root, { title: "Waiting" }, DEFAULT_SETTINGS);
		} else {
			renderer.showTrackMetadata(
				root,
				{
					mode: "loading",
					track: {
						uri: "spotify:track:settings",
						title: "Settings",
						artist: "Aura",
						album: "Live",
						durationMs: 1,
						isLocal: false,
					},
				},
				DEFAULT_SETTINGS
			);
		}
		const scene = root.firstElementChild;

		renderer.applySettings({ ...DEFAULT_SETTINGS, fontFamily: "Arial", fontScale: 1.2, motionIntensity: 0.3, reduceMotion: true });

		expect(root.firstElementChild).toBe(scene);
		expect((scene as HTMLElement).style.fontFamily).toBe("Arial, sans-serif");
		expect((scene as HTMLElement).style.getPropertyValue("--font-scale")).toBe("1.2");
		expect((scene as HTMLElement).style.getPropertyValue("--motion-intensity")).toBe("0.3");
		expect(scene?.classList.contains("reduce-motion")).toBe(true);
	});

	test("updates context visibility live without replacing line rows", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 25,
			content: Array.from({ length: 5 }, (_, index) => ({
				type: "vocal" as const,
				text: String(index + 1),
				startTime: index * 5,
				endTime: (index + 1) * 5,
				oppositeAligned: false,
			})),
		};
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: { ...DEFAULT_SETTINGS, visibleContextLines: 0 } });
		renderer.update(11, 1 / 60);
		const rows = Array.from(root.querySelectorAll<HTMLElement>(".line-group"));
		expect(rows.map((row) => row.classList.contains("out-of-context"))).toEqual([true, true, false, true, true]);

		renderer.applySettings({ ...DEFAULT_SETTINGS, visibleContextLines: 2 });

		expect(Array.from(root.querySelectorAll(".line-group"))).toEqual(rows);
		expect(rows.every((row) => !row.classList.contains("out-of-context"))).toBe(true);
	});
	test("renders the loading track metadata once with a decorative progress line", () => {
		const root = document.createElement("div");
		const track: TrackIdentity = {
			uri: "spotify:track:loading",
			title: "Northern Lights",
			artist: "Aura",
			album: "Aurora Album",
			durationMs: 180_000,
			coverUrl: "https://example.com/aurora.jpg",
			isLocal: false,
		};
		const renderer = new LyricsRenderer();

		renderer.showTrackMetadata(root, { mode: "loading", track }, DEFAULT_SETTINGS);

		const text = root.textContent ?? "";
		expect(text.match(/LOADING/g)).toHaveLength(1);
		expect(text.match(/Aurora Album/g)).toHaveLength(1);
		expect(text).not.toContain(["NOW", "PLAYING"].join(" "));
		expect(root.querySelector(".track-metadata-title")?.textContent).toBe("Northern Lights");
		expect(root.querySelector(".track-metadata-byline")?.textContent).toBe("Aura · Aurora Album");
		expect(root.querySelector<HTMLImageElement>(".track-metadata-cover")?.src).toBe("https://example.com/aurora.jpg");
		expect(root.querySelector(".track-metadata-progress")?.getAttribute("aria-hidden")).toBe("true");
	});

	test("keeps failed track metadata without a label, progress line, or retry card", () => {
		const root = document.createElement("div");
		const track: TrackIdentity = {
			uri: "spotify:track:failed",
			title: "Quiet Signal",
			artist: "Aura",
			album: "Offline",
			durationMs: 180_000,
			isLocal: false,
		};
		const renderer = new LyricsRenderer();

		renderer.showTrackMetadata(root, { mode: "persistent", track }, DEFAULT_SETTINGS);

		expect(root.querySelector(".track-metadata-title")?.textContent).toBe("Quiet Signal");
		expect(root.querySelector(".track-metadata-byline")?.textContent).toBe("Aura · Offline");
		expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
		expect(root.querySelector(".track-metadata-progress")).toBeNull();
		expect(root.querySelector(".status-card")).toBeNull();
		expect(root.querySelector("button")).toBeNull();
	});

	test("renders intro metadata without a label or progress line", () => {
		const root = document.createElement("div");
		const track: TrackIdentity = {
			uri: "spotify:track:intro",
			title: "First Light",
			artist: "Aura",
			album: "Dawn",
			durationMs: 180_000,
			coverUrl: "https://example.com/dawn.jpg",
			isLocal: false,
		};
		const renderer = new LyricsRenderer();

		renderer.showTrackMetadata(root, { mode: "intro", track }, DEFAULT_SETTINGS);

		expect(root.querySelector(".track-metadata-scene.intro")).not.toBeNull();
		expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
		expect(root.querySelector(".track-metadata-progress")).toBeNull();
		const text = root.textContent ?? "";
		expect(text).toContain(track.title);
		expect(text.match(/Dawn/g)).toHaveLength(1);
		expect(text).not.toContain("LOADING");
		expect(text).not.toContain(["NOW", "PLAYING"].join(" "));
	});

	test("omits empty metadata separators and a missing cover while preserving the title", () => {
		const root = document.createElement("div");
		const track: TrackIdentity = {
			uri: "spotify:track:sparse",
			title: "Title Only",
			artist: "",
			album: "",
			durationMs: 0,
			isLocal: false,
		};
		const renderer = new LyricsRenderer();

		renderer.showTrackMetadata(root, { mode: "loading", track }, DEFAULT_SETTINGS);

		expect(root.querySelector(".track-metadata-title")?.textContent).toBe("Title Only");
		expect(root.querySelector(".track-metadata-byline")).toBeNull();
		expect(root.querySelector(".track-metadata-cover")).toBeNull();
		expect(root.textContent).not.toContain("·");
	});

	test("exposes synthetic timing as a localized scene description without a visible marker", () => {
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
						syllables: [{ text: "Synthesized", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
			],
		};
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: { ...DEFAULT_SETTINGS, language: "ko" }, timingSource: "synthetic" });
		const scene = root.querySelector<HTMLElement>(".aura-lyrics");
		const description = root.querySelector<HTMLElement>("[data-aura-synthetic-description]");
		const descriptionId = scene?.getAttribute("aria-describedby");

		expect(scene?.classList.contains("synthetic-timing")).toBe(true);
		expect(scene?.dataset.timingSource).toBe("synthetic");
		expect(description?.textContent).toBe("가상 노래방 싱크");
		expect(descriptionId).toBe(description?.id);
		expect(descriptionId ? root.querySelector(`#${descriptionId}`) : null).toBe(description);
		expect(root.querySelector(".aura-timing-marker")).toBeNull();
	});

	test("drives a synthetic syllable wake from the existing lyric progress without adding another DOM clock", () => {
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
						syllables: [{ text: "Wake", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
			],
		};
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: { ...DEFAULT_SETTINGS, motionIntensity: 0 }, timingSource: "synthetic" });
		const scene = root.querySelector<HTMLElement>(".aura-lyrics");
		const syllable = root.querySelector<HTMLElement>(".syllable.synced");

		for (const [timestamp, expectedProgress] of [
			[1, "25%"],
			[2, "50%"],
			[3, "75%"],
		] as const) {
			renderer.update(timestamp, 1 / 60);
			expect(syllable?.style.getPropertyValue("--gradient-progress")).toBe(expectedProgress);
		}
		expect(scene?.matches(".aura-lyrics.synthetic-timing[data-timing-source='synthetic']")).toBe(true);
		expect(scene?.style.getPropertyValue("--motion-intensity")).toBe("0");
		expect(syllable?.style.getPropertyValue("--synthetic-wake-progress")).toBe("");
		expect(root.querySelector(".synthetic-wake-halo")).toBeNull();

		renderer.applySettings({ ...DEFAULT_SETTINGS, motionEnabled: false });
		expect(scene?.classList.contains("reduce-motion")).toBe(true);
		expect(syllable?.style.getPropertyValue("--gradient-progress")).toBe("75%");

		renderer.applySettings({ ...DEFAULT_SETTINGS, reduceMotion: true });
		expect(scene?.classList.contains("reduce-motion")).toBe(true);
	});

	test("keeps native syllables on the existing gradient and spring DOM contract", () => {
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
						syllables: [{ text: "Native", startTime: 0, endTime: 4, isPartOfWord: false }],
					},
				},
			],
		};
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: DEFAULT_SETTINGS, timingSource: "native" });
		renderer.update(2, 1 / 60);
		const scene = root.querySelector<HTMLElement>(".aura-lyrics");
		const syllable = root.querySelector<HTMLElement>(".syllable.synced");

		expect(scene?.classList.contains("synthetic-timing")).toBe(false);
		expect(syllable?.style.getPropertyValue("--gradient-progress")).toBe("50%");
		expect(syllable?.style.getPropertyValue("--synthetic-wake-progress")).toBe("");
		expect(syllable?.className).not.toContain("synthetic-wake");
		expect(root.querySelector(".synthetic-wake-halo")).toBeNull();
	});

	test.each(["native", undefined] as const)("keeps %s timing free of synthetic scene state", (timingSource) => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 4,
			content: [{ type: "vocal", text: "Native", startTime: 0, endTime: 4, oppositeAligned: false }],
		};
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: DEFAULT_SETTINGS, timingSource });
		const scene = root.querySelector<HTMLElement>(".aura-lyrics");

		expect(scene?.classList.contains("synthetic-timing")).toBe(false);
		expect(scene?.dataset.timingSource).toBeUndefined();
		expect(scene?.hasAttribute("aria-describedby")).toBe(false);
		expect(root.querySelector("[data-aura-synthetic-description]")).toBeNull();
		expect(root.querySelector(".aura-timing-marker")).toBeNull();
	});

	test.each([
		["ko", "가상 노래방 싱크"],
		["en", "Synthesized karaoke sync"],
		["ja", "仮想カラオケ同期"],
	] as const)("localizes the synthetic timing scene description in %s", (language, expectedLabel) => {
		const root = document.createElement("div");
		const lyrics: StaticLyrics = { type: "static", lines: [{ text: "Synthetic" }] };
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: { ...DEFAULT_SETTINGS, language }, timingSource: "synthetic" });
		const scene = root.querySelector<HTMLElement>(".aura-lyrics");
		const descriptionId = scene?.getAttribute("aria-describedby");
		const description = descriptionId ? root.querySelector<HTMLElement>(`#${descriptionId}`) : null;

		expect(description?.matches("[data-aura-synthetic-description].aura-visually-hidden")).toBe(true);
		expect(description?.textContent).toBe(expectedLabel);
	});

	test("updates the synthetic timing description and its link on a language remount", () => {
		const root = document.createElement("div");
		const lyrics: StaticLyrics = { type: "static", lines: [{ text: "Synthetic" }] };
		const renderer = new LyricsRenderer();
		renderer.mount(root, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, language: "en" },
			timingSource: "synthetic",
		});
		const firstScene = root.querySelector<HTMLElement>(".aura-lyrics");
		const firstDescriptionId = firstScene?.getAttribute("aria-describedby");

		renderer.mount(root, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, language: "ja" },
			timingSource: "synthetic",
		});
		const remountedScene = root.querySelector<HTMLElement>(".aura-lyrics");
		const remountedDescriptionId = remountedScene?.getAttribute("aria-describedby");
		const remountedDescription = remountedDescriptionId ? root.querySelector<HTMLElement>(`#${remountedDescriptionId}`) : null;

		expect(remountedScene).not.toBe(firstScene);
		expect(remountedDescriptionId).toBe(firstDescriptionId);
		expect(remountedDescription?.textContent).toBe("仮想カラオケ同期");
		expect(remountedScene?.getAttribute("aria-describedby")).toBe(remountedDescription?.id);
	});

	test("gives synthetic descriptions unique ids across renderer instances in one document", () => {
		const rootA = document.createElement("div");
		const rootB = document.createElement("div");
		const lyrics: StaticLyrics = { type: "static", lines: [{ text: "Synthetic" }] };
		const rendererA = new LyricsRenderer();
		const rendererB = new LyricsRenderer();
		rendererA.mount(rootA, { lyrics, settings: DEFAULT_SETTINGS, timingSource: "synthetic" });
		rendererB.mount(rootB, { lyrics, settings: DEFAULT_SETTINGS, timingSource: "synthetic" });
		const sceneA = rootA.querySelector<HTMLElement>(".aura-lyrics");
		const sceneB = rootB.querySelector<HTMLElement>(".aura-lyrics");
		const descriptionIdA = sceneA?.getAttribute("aria-describedby");
		const descriptionIdB = sceneB?.getAttribute("aria-describedby");

		expect(descriptionIdA).toBeTruthy();
		expect(descriptionIdB).toBeTruthy();
		expect(descriptionIdA).not.toBe(descriptionIdB);
		expect(descriptionIdA ? rootA.querySelector(`#${descriptionIdA}`) : null).toBe(rootA.querySelector("[data-aura-synthetic-description]"));
		expect(descriptionIdB ? rootB.querySelector(`#${descriptionIdB}`) : null).toBe(rootB.querySelector("[data-aura-synthetic-description]"));
	});

	test.each([
		[
			"line",
			{
				type: "line",
				startTime: 0,
				endTime: 4,
				content: [{ type: "vocal", text: "Line", startTime: 0, endTime: 4, oppositeAligned: false }],
			} satisfies LineLyrics,
		],
		["static", { type: "static", lines: [{ text: "Static" }] } satisfies StaticLyrics],
	] as const)("exposes synthetic timing scene state for %s lyrics without a visible marker", (_type, lyrics) => {
		const root = document.createElement("div");
		const renderer = new LyricsRenderer();
		renderer.mount(root, { lyrics, settings: DEFAULT_SETTINGS, timingSource: "synthetic" });
		const scene = root.querySelector<HTMLElement>(".aura-lyrics");
		const descriptionId = scene?.getAttribute("aria-describedby");

		expect(scene?.matches(".aura-lyrics.synthetic-timing[data-timing-source='synthetic']")).toBe(true);
		expect(descriptionId ? root.querySelector(`#${descriptionId}`)?.textContent : null).toBe("Synthesized karaoke sync");
		expect(root.querySelector(".aura-timing-marker")).toBeNull();
		expect(root.querySelector(".syllable, .syllable-group, .synthetic-wake-halo")).toBeNull();
	});
	test("shows album art mode without lyric or status content", () => {
		const pipRoot = document.createElement("div");
		const root = document.createElement("main");
		pipRoot.append(root);

		const renderer = new LyricsRenderer();
		renderer.showStatus(root, { title: "Loading lyrics" }, DEFAULT_SETTINGS);

		renderer.showAlbumArt(root);

		expect(pipRoot.classList.contains("album-art-mode")).toBe(true);
		expect(root.children).toHaveLength(0);
		expect(root.querySelector(".aura-lyrics, .status-card")).toBeNull();

		renderer.showStatus(root, { title: "No synced lyrics" }, DEFAULT_SETTINGS);

		expect(pipRoot.classList.contains("album-art-mode")).toBe(false);
		expect(root.querySelector(".status-card")?.textContent).toContain("No synced lyrics");
	});

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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

		const line = root.querySelector<HTMLElement>(".line");
		expect(line?.querySelector(".lyric-parenthetical-break")).toBeNull();
		expect(line?.querySelector(".lyric-parenthetical")).toBeNull();
		expect(line?.textContent).toBe("바람아 내게 봄을 데려와 줘 (벚꽃잎이 흩날리듯이)");
	});

	test("renders line lyrics as word and token spans while preserving text content", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 10,
			content: [{ type: "vocal", text: "바람아 내게 봄", startTime: 0, endTime: 10, oppositeAligned: false }],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

		const line = root.querySelector<HTMLElement>(".line");
		const words = Array.from(line?.querySelectorAll<HTMLElement>(":scope > .word") ?? []);
		const tokens = Array.from(line?.querySelectorAll<HTMLElement>(":scope > .word > .lyric.line-token") ?? []);
		expect(line?.classList.contains("lyric")).toBe(true);
		expect(line?.textContent).toBe("바람아 내게 봄");
		expect(words).toHaveLength(3);
		expect(tokens.map((token) => token.textContent)).toEqual(["바람아", "내게", "봄"]);
		expect(root.querySelector(".line-group")?.textContent).toBe("바람아 내게 봄");
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

		const lead = root.querySelector<HTMLElement>(".vocals.lead");
		const rows = Array.from(lead?.querySelectorAll<HTMLElement>(".syllable-row") ?? []);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.querySelector(".syllable-main")?.textContent)).toEqual(["괜찮아", "언젠가"]);
		expect(rows.map((row) => row.querySelector(".syllable-echo")?.textContent)).toEqual(["괜찮아", "언젠가"]);
		expect(lead?.textContent).not.toContain("(");
		expect(lead?.textContent).not.toContain(")");
	});

	test("renders short parenthetical ad-libs as separate rows before following lyrics", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 6,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 6,
						syllables: [{ text: "피땀으로 (hey), 눈물로 (hey) 채운게 미련하다고", startTime: 0, endTime: 6, isPartOfWord: false }],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

		const lead = root.querySelector<HTMLElement>(".vocals.lead");
		const rows = Array.from(lead?.querySelectorAll<HTMLElement>(".syllable-row") ?? []);
		expect(rows).toHaveLength(5);
		expect(rows.map((row) => row.querySelector(".syllable-main")?.textContent)).toEqual(["피땀으로", "", "눈물로", "", "채운게 미련하다고"]);
		expect(rows.map((row) => row.querySelector(".syllable-echo")?.textContent)).toEqual(["", "hey", "", "hey", ""]);
		expect(rows[1].classList.contains("standalone-parenthetical")).toBe(false);
		expect(rows[3].classList.contains("standalone-parenthetical")).toBe(false);
		expect(rows[2].querySelector(".syllable-main")?.textContent?.startsWith(",")).toBe(false);
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
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, lyricsVerticalPosition: 0.4 } as typeof DEFAULT_SETTINGS);
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

		const row = root.querySelector<HTMLElement>(".syllable-row");
		expect(row?.classList.contains("parenthetical-only")).toBe(true);
		expect(row?.classList.contains("standalone-parenthetical")).toBe(true);
		expect(row?.querySelector(".syllable-main")?.textContent).toBe("");
		expect(row?.querySelector(".syllable-echo")?.textContent).toBe("괜찮아");
		expect(row?.querySelector(".parenthetical-word")).not.toBeNull();
		expect(root.textContent).not.toContain("(");
		expect(root.textContent).not.toContain(")");
	});

	test("splits a long final Korean word into a sustained tail syllable", () => {
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
							{ text: "널", startTime: 0, endTime: 0.45, isPartOfWord: false },
							{ text: "사랑해", startTime: 0.45, endTime: 4, isPartOfWord: false },
						],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);
		renderer.update(3.2, 1 / 60);

		const tailWord = root.querySelector<HTMLElement>(".word.korean-tail-word");
		expect(tailWord?.textContent).toBe("사랑해");
		expect(tailWord?.querySelector(".korean-tail-base")?.textContent).toBe("사랑");
		expect(tailWord?.querySelector(".korean-tail-sustain")?.textContent).toBe("해");
		expect(tailWord?.querySelector(".korean-tail-base")?.classList.contains("sung")).toBe(true);
		expect(tailWord?.querySelector(".korean-tail-sustain")?.classList.contains("active")).toBe(true);
	});

	test("does not split short Korean tokens or non-Korean long final words", () => {
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
						endTime: 3,
						syllables: [{ text: "좋아", startTime: 0, endTime: 0.75, isPartOfWord: false }],
					},
				},
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 3,
						endTime: 7,
						syllables: [{ text: "forever", startTime: 3, endTime: 7, isPartOfWord: false }],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

		expect(root.querySelector(".korean-tail-word")).toBeNull();
		expect(root.querySelector(".korean-tail-sustain")).toBeNull();
	});

	test("uses BPM rhythm to split shorter Korean final tails on fast tracks", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 1.75,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 0,
						endTime: 1.75,
						syllables: [
							{ text: "널", startTime: 0, endTime: 0.25, isPartOfWord: false },
							{ text: "사랑해", startTime: 0.25, endTime: 1.35, isPartOfWord: false },
						],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS, undefined, {}, { tempo: 150, beatDurationSec: 0.4, tempoSource: "track" });

		expect(root.querySelector(".korean-tail-word")?.textContent).toBe("사랑해");
		expect(root.querySelector<HTMLElement>(".aura-lyrics")?.style.getPropertyValue("--interlude-wave-cycle")).toBe("1.056s");
	});

	test("keeps very long final Korean notes in melisma sustain mode", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 180.905,
			endTime: 191.279,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					lead: {
						startTime: 180.905,
						endTime: 191.279,
						syllables: [{ text: "전체관람가", startTime: 180.905, endTime: 191.279, isPartOfWord: false }],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS, undefined, {}, { tempo: 120, beatDurationSec: 0.5, tempoSource: "beats" });
		renderer.update(187, 1 / 60);

		const tailWord = root.querySelector<HTMLElement>(".word.korean-melisma-word");
		const sustain = tailWord?.querySelector<HTMLElement>(".korean-melisma-sustain");
		expect(tailWord?.textContent).toBe("전체관람가");
		expect(tailWord?.querySelector(".korean-tail-base")?.textContent).toBe("전체관람");
		expect(sustain?.textContent).toBe("가");
		expect(sustain?.classList.contains("active")).toBe(true);
		expect(sustain?.style.getPropertyValue("--melisma-step")).toBe("3");
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

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
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, lyricsVerticalPosition: 0.4 } as typeof DEFAULT_SETTINGS);
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

	test("centers the full active lyric row when the active line wraps to multiple visual lines", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 20,
			content: [
				{ type: "vocal", text: "First", startTime: 0, endTime: 5, oppositeAligned: false },
				{
					type: "vocal",
					text: "Second lyric wraps across two visual lines",
					startTime: 5,
					endTime: 10,
					oppositeAligned: false,
				},
				{ type: "vocal", text: "Third", startTime: 10, endTime: 15, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);
		const viewport = root.querySelector<HTMLElement>(".lyrics-viewport");
		const rows = root.querySelectorAll<HTMLElement>(".vocals-group");
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		Object.defineProperty(rows[0], "offsetTop", { configurable: true, value: 0 });
		Object.defineProperty(rows[0], "clientHeight", { configurable: true, value: 80 });
		Object.defineProperty(rows[1], "offsetTop", { configurable: true, value: 180 });
		Object.defineProperty(rows[1], "clientHeight", { configurable: true, value: 160 });
		Object.defineProperty(rows[2], "offsetTop", { configurable: true, value: 420 });
		Object.defineProperty(rows[2], "clientHeight", { configurable: true, value: 80 });

		renderer.update(7, 1 / 60);

		expect(root.querySelector<HTMLElement>(".lyrics-track")?.style.transform).toBe("translate3d(0, -60px, 0)");
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS, "lrclib");
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
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, visibleContextLines: 1 });
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
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS, "lrclib");

		const rows = Array.from(root.querySelectorAll(".lyrics-track > *"));
		expect(rows.at(-1)?.classList.contains("provider-source")).toBe(true);
		expect(rows.at(-1)?.textContent).toContain("lrclib");
	});

	test("shows provider diagnostics only when debug mode is enabled", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 100,
			content: [{ type: "vocal", text: "Ending", startTime: 0, endTime: 100, oppositeAligned: false }],
		};
		const diagnostics = {
			cache: { status: "miss" as const, primaryProvider: "spotify" as const },
			attempts: [
				{ provider: "spotify" as const, status: "no-lyrics" as const, message: "No synced lyrics." },
				{ provider: "lrclib" as const, status: "success" as const },
			],
		};

		const renderer = new LyricsRenderer();
		renderer.mount(root, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, debugMode: false },
			provider: "lrclib",
			diagnostics,
		});
		expect(root.querySelector(".provider-diagnostics")).toBeNull();

		renderer.mount(root, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, debugMode: true },
			provider: "lrclib",
			source: "network",
			diagnostics,
		});

		const source = root.querySelector(".provider-source");
		const detail = root.querySelector(".provider-diagnostics");
		expect(source?.textContent).toContain("network");
		expect(detail?.textContent).toContain("cache miss");
		expect(detail?.textContent).toContain("spotify: no lyrics");
		expect(detail?.textContent).toContain("lrclib: success");
	});

	test("renders background vocals and opposite alignment for syllable vocals", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 5,
			content: [
				{
					type: "vocal",
					oppositeAligned: true,
					lead: {
						startTime: 0,
						endTime: 5,
						syllables: [{ text: "Lead", startTime: 0, endTime: 5, isPartOfWord: false }],
					},
					background: [
						{
							startTime: 1,
							endTime: 4,
							syllables: [{ text: "Echo", startTime: 1, endTime: 4, isPartOfWord: false }],
						},
					],
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);
		renderer.update(2, 1 / 60);

		const group = root.querySelector<HTMLElement>(".syllable-group");
		expect(group?.classList.contains("opposite-aligned")).toBe(true);
		expect(group?.querySelector(".vocals.lead")?.textContent).toBe("Lead");
		expect(group?.querySelector(".vocals.background")?.textContent).toBe("Echo");
		expect(group?.querySelector(".vocals.background.active")).not.toBeNull();
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
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, interludeStyle: "frame", showInterludes: false }, "spotify");
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

	test("preserves persistent interlude style classes while clearing transient frame state across scenes", () => {
		const pipRoot = document.createElement("div");
		const root = document.createElement("main");
		pipRoot.append(root);
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 10,
			content: [{ type: "interlude", startTime: 0, endTime: 10 }],
		};
		const renderer = new LyricsRenderer();
		renderer.mount(root, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, interludeStyle: "frame" },
		});
		renderer.update(5, 1 / 60);

		renderer.showStatus(root, { title: "Waiting" }, DEFAULT_SETTINGS);

		expect(root.classList.contains("interlude-style-frame")).toBe(true);
		expect(pipRoot.classList.contains("interlude-style-frame")).toBe(true);
		expect(root.classList.contains("interlude-active")).toBe(false);
		expect(pipRoot.classList.contains("interlude-frame-active")).toBe(false);
		expect(pipRoot.style.getPropertyValue("--pip-interlude-progress")).toBe("");

		renderer.mount(root, {
			lyrics,
			settings: { ...DEFAULT_SETTINGS, interludeStyle: "frame" },
		});
		renderer.showTrackMetadata(
			root,
			{
				mode: "persistent",
				track: {
					uri: "spotify:track:style",
					title: "Persistent style",
					artist: "Aura",
					album: "Frames",
					durationMs: 10_000,
					isLocal: false,
				},
			},
			DEFAULT_SETTINGS
		);

		expect(root.classList.contains("interlude-style-frame")).toBe(true);
		expect(pipRoot.classList.contains("interlude-style-frame")).toBe(true);
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
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, interludeStyle: "dots", showInterludes: true }, "spotify");
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
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, interludeStyle: "wave", showInterludes: true }, "spotify", {
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

	test("renders a translation sub-line under a line lyric", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 10,
			content: [
				{ type: "vocal", text: "Loves all of you", translatedText: "너의 모든 것을 사랑해", startTime: 0, endTime: 5, oppositeAligned: false },
				{ type: "vocal", text: "No translation here", startTime: 5, endTime: 10, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);

		const groups = Array.from(root.querySelectorAll<HTMLElement>(".line-group"));
		expect(groups[0]?.querySelector(".lyric-translation")?.textContent).toBe("너의 모든 것을 사랑해");
		expect(groups[0]?.querySelector(".line")?.textContent).toBe("Loves all of you");
		expect(groups[1]?.querySelector(".lyric-translation")).toBeNull();
	});

	test("hides translation sub-lines when showTranslation is off", () => {
		const root = document.createElement("div");
		const lyrics: LineLyrics = {
			type: "line",
			startTime: 0,
			endTime: 5,
			content: [
				{ type: "vocal", text: "Loves all of you", translatedText: "너의 모든 것을 사랑해", startTime: 0, endTime: 5, oppositeAligned: false },
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, showTranslation: false });

		expect(root.querySelector(".lyric-translation")).toBeNull();
	});

	test("renders a static translation sub-line under a syllable lyric without syncing it", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 5,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					translatedText: "너의 모든 것을 사랑해",
					lead: {
						startTime: 0,
						endTime: 5,
						syllables: [
							{ text: "Loves", startTime: 0, endTime: 2, isPartOfWord: false },
							{ text: "you", startTime: 2, endTime: 5, isPartOfWord: false },
						],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, DEFAULT_SETTINGS);
		renderer.update(1, 1 / 60);

		const group = root.querySelector<HTMLElement>(".syllable-group");
		const translation = group?.querySelector<HTMLElement>(".lyric-translation");
		expect(translation?.textContent).toBe("너의 모든 것을 사랑해");
		// The translation must never become its own scroll row or a synced syllable.
		expect(translation?.dataset.scrollRow).toBeUndefined();
		expect(translation?.querySelector(".syllable")).toBeNull();
		expect(group?.lastElementChild).toBe(translation);
	});

	test("keeps parentheses inline instead of echo-splitting when a translation is shown", () => {
		const root = document.createElement("div");
		const makeLyrics = (translatedText?: string): SyllableLyrics => ({
			type: "syllable",
			startTime: 0,
			endTime: 5,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					translatedText,
					lead: {
						startTime: 0,
						endTime: 5,
						syllables: [
							{ text: "Loves", startTime: 0, endTime: 2, isPartOfWord: false },
							{ text: "(ooh)", startTime: 2, endTime: 5, isPartOfWord: false },
						],
					},
				},
			],
		});

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, makeLyrics("사랑해 (우)"), DEFAULT_SETTINGS);

		const group = root.querySelector<HTMLElement>(".syllable-group");
		expect(group?.classList.contains("has-parenthetical")).toBe(false);
		expect(group?.querySelector(".syllable-row.has-parenthetical-echo")).toBeNull();
		expect(group?.querySelector(".parenthetical-word")).toBeNull();
		expect(group?.querySelector(".vocals.lead")?.textContent).toBe("Loves(ooh)");
		// The translation renders as one plain string; its parentheses are never split.
		expect(group?.querySelector(".lyric-translation")?.textContent).toBe("사랑해 (우)");

		mountRenderer(renderer, root, makeLyrics(undefined), DEFAULT_SETTINGS);
		expect(root.querySelector(".syllable-row.has-parenthetical-echo")).not.toBeNull();
	});

	test("carries the translation onto the line-only downgrade of syllable lyrics", () => {
		const root = document.createElement("div");
		const lyrics: SyllableLyrics = {
			type: "syllable",
			startTime: 0,
			endTime: 5,
			content: [
				{
					type: "vocal",
					oppositeAligned: false,
					translatedText: "너의 모든 것을 사랑해",
					lead: {
						startTime: 0,
						endTime: 5,
						syllables: [{ text: "Loves", startTime: 0, endTime: 5, isPartOfWord: false }],
					},
				},
			],
		};

		const renderer = new LyricsRenderer();
		mountRenderer(renderer, root, lyrics, { ...DEFAULT_SETTINGS, syncPreference: "line-only" });

		expect(root.querySelector(".line-group .lyric-translation")?.textContent).toBe("너의 모든 것을 사랑해");
	});
});
