import type { LyricsDocument, LyricsLoadDiagnostics } from "../lyrics/types";
import type { ExtensionSettings } from "../settings/SettingsStore";
import { clamp } from "../shared/math";
import { applySharedRootSettings } from "../shared/settingsCssProperties";
import type { AnimatedGroup } from "./AnimatedGroup";
import type { RhythmProfile } from "./AudioAnalysisWaveformService";
import { createStatusScene, type StatusViewModel } from "./components/StatusScene";
import { createTrackMetadataScene, type TrackMetadataViewModel } from "./components/TrackMetadata";
import { HighlightDecorationLayoutController } from "./highlight/HighlightDecorationLayout";
import { InterludeFrameController } from "./InterludeFrameController";
import type { InterludeWaveformMap } from "./interludeWaveforms";
import { buildLyricsScene } from "./LyricsSceneBuilder";
import { LyricsViewportController } from "./LyricsViewportController";
import { type ScenePresentationOptions, ScenePresenter, type SceneResources } from "./ScenePresenter";
import type { SceneTransitionHandle } from "./SceneTransitionController";
import { buildSceneShell, createSceneAnnouncer, staticLyricsLabel } from "./sceneShell";

export type { StatusViewModel } from "./components/StatusScene";
export { interludeKey } from "./interludeProgress";
export type { InterludeWaveformMap } from "./interludeWaveforms";
export type { ScenePresentationOptions } from "./ScenePresenter";

let nextRendererInstanceId = 0;

export type LyricsRendererMountOptions = {
	lyrics: LyricsDocument;
	settings: ExtensionSettings;
	timingSource?: "native" | "synthetic";
	provider?: string;
	source?: "cache" | "network";
	diagnostics?: LyricsLoadDiagnostics;
	waveforms?: InterludeWaveformMap;
	rhythm?: RhythmProfile;
};

// Groups are visited in a window around the playhead: far enough ahead that a group is
// already idle before it can matter, and far enough behind that it has settled into `sung`.
const ANIMATION_LOOKAHEAD_SEC = 4;
const ANIMATION_SETTLE_SEC = 4;
// Anything larger than a plausible frame delta is a seek and forces a full pass.
const ANIMATION_SEEK_THRESHOLD_SEC = 1;

/**
 * Public face of the renderer: builds scenes (lyrics, status, metadata, album art), drives the
 * per-frame animation window, and pushes settings into the live scene. The scene lifecycle
 * itself — transitions, retirement and cleanup — lives in `ScenePresenter`.
 */
export class LyricsRenderer {
	private readonly rendererInstanceId = ++nextRendererInstanceId;
	private readonly presenter = new ScenePresenter();

	public mount(
		root: HTMLElement,
		{ lyrics, settings, timingSource = "native", provider, source, diagnostics, waveforms = {}, rhythm }: LyricsRendererMountOptions,
		presentation?: ScenePresentationOptions
	): SceneTransitionHandle {
		const ownerDocument = root.ownerDocument;
		const { container, lyricsViewport, lyricsTrack } = buildSceneShell(ownerDocument, settings, timingSource, this.rendererInstanceId);
		this.applyRootSettings(container, settings);
		this.applyRhythmProfile(container, rhythm);
		const scene = buildLyricsScene(lyricsTrack, {
			lyrics,
			settings,
			provider,
			loadSource: source,
			diagnostics,
			waveforms,
			rhythm,
		});
		const groups = scene.groups;
		container.classList.toggle("static-lyrics", scene.mode === "static");
		lyricsViewport.classList.toggle("static-lyrics-viewport", scene.mode === "static");
		lyricsTrack.classList.toggle("static-lyrics-track", scene.mode === "static");
		let viewportController: LyricsViewportController | undefined;
		let highlightLayoutController: HighlightDecorationLayoutController | undefined;
		let interludeFrameController: InterludeFrameController | undefined;
		if (scene.mode === "static") {
			lyricsViewport.tabIndex = 0;
			lyricsViewport.setAttribute("aria-label", staticLyricsLabel(settings.language));
		} else {
			const announcer = createSceneAnnouncer(ownerDocument);
			container.append(announcer);
			viewportController = new LyricsViewportController(
				lyricsTrack,
				lyricsViewport,
				container,
				settings,
				groups,
				announcer,
				scene.highlightTracks.length === 0
			);
			if (scene.highlightTracks.length > 0) {
				highlightLayoutController = new HighlightDecorationLayoutController(lyricsViewport, scene.highlightTracks, {
					onLayout: () => viewportController?.update(true),
				});
			}
			if (settings.showInterludes) {
				interludeFrameController = new InterludeFrameController(root, container, settings.interludeStyle, groups);
			}
		}
		const resources: SceneResources = {
			scene: container,
			container,
			lyricsViewport,
			lyricsTrack,
			groups,
			viewportController,
			highlightLayoutController,
			interludeFrameController,
			layoutSettings: layoutSettingsFor(settings),
			cleaned: false,
		};
		const handle = this.presenter.present(
			root,
			resources,
			presentation,
			this.shouldAnimate(presentation, settings.motionEnabled && !settings.reduceMotion),
			false
		);
		if (highlightLayoutController) {
			highlightLayoutController.start();
			highlightLayoutController.flush();
		} else {
			this.presenter.scheduleLayoutUpdate(resources);
		}
		return handle;
	}

	public showStatus(
		root: HTMLElement,
		status: StatusViewModel,
		settings: ExtensionSettings,
		presentation?: ScenePresentationOptions
	): SceneTransitionHandle {
		const ownerDocument = root.ownerDocument;
		const container = createStatusScene(ownerDocument, status);
		this.applyRootSettings(container, settings);
		return this.presenter.present(
			root,
			{ scene: container, container, groups: [], cleaned: false },
			presentation,
			this.shouldAnimate(presentation, settings.motionEnabled && !settings.reduceMotion),
			false
		);
	}

	public showTrackMetadata(
		root: HTMLElement,
		metadata: TrackMetadataViewModel,
		settings: ExtensionSettings,
		presentation?: ScenePresentationOptions
	): SceneTransitionHandle {
		const container = createTrackMetadataScene(root.ownerDocument, metadata);
		this.applyRootSettings(container, settings);
		return this.presenter.present(
			root,
			{ scene: container, container, groups: [], cleaned: false },
			presentation,
			this.shouldAnimate(presentation, settings.motionEnabled && !settings.reduceMotion),
			false
		);
	}

	public showAlbumArt(root: HTMLElement, presentation?: ScenePresentationOptions): SceneTransitionHandle {
		const scene = root.ownerDocument.createElement("div");
		scene.className = "album-art-scene";
		scene.dataset.scene = "album-art";
		scene.setAttribute("aria-hidden", "true");
		return this.presenter.present(
			root,
			{ scene, groups: [], cleaned: false },
			presentation,
			this.shouldAnimate(presentation, !this.hasReducedMotion(root)),
			true
		);
	}

	public update(timestamp: number, deltaTime: number): void {
		const scene = this.presenter.current;
		if (!scene || scene.cleaned) {
			return;
		}
		this.animateGroups(scene, timestamp, deltaTime);
		scene.interludeFrameController?.update();
		scene.viewportController?.update();
	}

	public applySettings(settings: ExtensionSettings): void {
		if (settings.reduceMotion || !settings.motionEnabled) {
			this.presenter.finishTransition();
		}
		const scene = this.presenter.current;
		if (!scene || scene.cleaned) {
			return;
		}
		if (scene.container) {
			this.applyRootSettings(scene.container, settings);
		}
		if (scene.lyricsTrack) {
			for (const alignment of ["natural", "center", "left"] as const) {
				scene.lyricsTrack.classList.toggle(`align-${alignment}`, settings.alignmentMode === alignment);
			}
		}
		const layoutChanged = !sameLayoutSettings(scene.layoutSettings, settings);
		// New settings can change what any group renders, so the next frame runs a full pass.
		scene.animatedIndices = undefined;
		scene.lastAnimatedTimestamp = undefined;
		this.presenter.finishLayoutUpdate(scene);
		scene.viewportController?.applySettings(settings);
		for (const group of scene.groups) {
			group.applySettings?.(settings);
		}
		scene.layoutSettings = layoutSettingsFor(settings);
		if (layoutChanged && scene.highlightLayoutController) {
			scene.highlightLayoutController.invalidate();
		} else {
			scene.highlightLayoutController?.flush();
			scene.viewportController?.update();
		}
	}

	public destroy(): void {
		this.presenter.destroy();
	}

	private animateGroups(scene: SceneResources, timestamp: number, deltaTime: number): void {
		const groups = scene.groups;
		if (groups.length === 0) {
			return;
		}
		const previous = scene.animatedIndices;
		const lastTimestamp = scene.lastAnimatedTimestamp;
		scene.lastAnimatedTimestamp = timestamp;
		if (previous === undefined || lastTimestamp === undefined || Math.abs(timestamp - lastTimestamp) > ANIMATION_SEEK_THRESHOLD_SEC) {
			// First frame after mount, or a seek: every group has to re-derive its state.
			for (const group of groups) {
				group.animate(timestamp, deltaTime);
			}
			scene.animatedIndices = windowIndices(groups, timestamp);
			return;
		}
		const next = windowIndices(groups, timestamp);
		for (const index of next) {
			groups[index].animate(timestamp, deltaTime);
		}
		for (const index of previous) {
			if (next.has(index)) {
				continue;
			}
			// One final pass so the group settles into its idle/sung end state.
			const group = groups[index];
			group.animate(timestamp, deltaTime);
			if (group.isSettled?.() === false) {
				next.add(index);
			}
		}
		scene.animatedIndices = next;
	}

	private shouldAnimate(presentation: ScenePresentationOptions | undefined, motionEnabled: boolean): boolean {
		return presentation?.animate === true && motionEnabled;
	}

	private hasReducedMotion(root: HTMLElement): boolean {
		return root.classList.contains("reduce-motion") || root.parentElement?.classList.contains("reduce-motion") === true;
	}

	private applyRootSettings(root: HTMLElement, settings: ExtensionSettings): void {
		applySharedRootSettings(root, settings);
		root.style.setProperty("--spring-softness", String(settings.springSoftness));
		root.style.fontFamily = `${settings.fontFamily}, sans-serif`;
		root.dataset.highlightEffect = settings.highlightEffect;
		root.dataset.highlightMotion = settings.highlightMotion;
	}

	private applyRhythmProfile(root: HTMLElement, rhythm: RhythmProfile | undefined): void {
		const beatDuration = rhythm?.beatDurationSec;
		if (!beatDuration || !Number.isFinite(beatDuration)) {
			return;
		}
		root.style.setProperty("--interlude-wave-cycle", `${roundSeconds(clamp(beatDuration * 2.64, 0.84, 1.9))}s`);
		root.style.setProperty("--interlude-dot-cycle", `${roundSeconds(clamp(beatDuration * 2.2, 0.72, 1.55))}s`);
		root.style.setProperty("--interlude-pill-cycle", `${roundSeconds(clamp(beatDuration * 2.9, 0.95, 2.05))}s`);
	}
}

/**
 * Indices of the groups that can change appearance at `timestamp`. `groups` is ordered by
 * `startTime`, so the upper edge is a binary search; the lower edge walks back over the few
 * groups that started earlier but have not finished settling yet.
 */
const windowIndices = (groups: AnimatedGroup[], timestamp: number): Set<number> => {
	const indices = new Set<number>();
	const latestStart = timestamp + ANIMATION_LOOKAHEAD_SEC;
	const earliestEnd = timestamp - ANIMATION_SETTLE_SEC;
	const last = firstIndexAfter(groups, latestStart) - 1;
	if (last < 0) {
		return indices;
	}
	let first = firstIndexAtOrAfter(groups, earliestEnd);
	while (first > 0 && groups[first - 1].endTime >= earliestEnd) {
		first -= 1;
	}
	for (let index = first; index <= last; index += 1) {
		indices.add(index);
	}
	return indices;
};

/** First index whose `startTime` is strictly greater than `time`. */
const firstIndexAfter = (groups: AnimatedGroup[], time: number): number => {
	let low = 0;
	let high = groups.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (groups[middle].startTime > time) {
			high = middle;
		} else {
			low = middle + 1;
		}
	}
	return low;
};

/** First index whose `startTime` is greater than or equal to `time`. */
const firstIndexAtOrAfter = (groups: AnimatedGroup[], time: number): number => {
	let low = 0;
	let high = groups.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (groups[middle].startTime >= time) {
			high = middle;
		} else {
			low = middle + 1;
		}
	}
	return low;
};

const roundSeconds = (value: number): number => Number(value.toFixed(3));

const layoutSettingsFor = (settings: ExtensionSettings): Pick<ExtensionSettings, "alignmentMode" | "fontFamily" | "fontScale"> => ({
	alignmentMode: settings.alignmentMode,
	fontFamily: settings.fontFamily,
	fontScale: settings.fontScale,
});

const sameLayoutSettings = (previous: SceneResources["layoutSettings"], next: ExtensionSettings): boolean =>
	previous?.alignmentMode === next.alignmentMode && previous.fontFamily === next.fontFamily && previous.fontScale === next.fontScale;
