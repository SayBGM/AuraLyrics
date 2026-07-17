import type { LyricsDocument, LyricsLoadDiagnostics } from "../lyrics/types";
import type { ExtensionSettings } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import type { RhythmProfile } from "./AudioAnalysisWaveformService";
import { clamp } from "./animation/Spline";
import { createStatusScene, type StatusViewModel } from "./components/StatusScene";
import { createTrackMetadataScene, type TrackMetadataViewModel } from "./components/TrackMetadata";
import { InterludeFrameController } from "./InterludeFrameController";
import type { InterludeWaveformMap } from "./interludeWaveforms";
import { buildLyricsScene } from "./LyricsSceneBuilder";
import { LyricsViewportController } from "./LyricsViewportController";
import { SceneTransitionController, type SceneTransitionDirection, type SceneTransitionHandle } from "./SceneTransitionController";

export type { StatusViewModel } from "./components/StatusScene";
export { interludeKey } from "./interludeProgress";
export type { InterludeWaveformMap } from "./interludeWaveforms";

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

export type ScenePresentationOptions = {
	direction?: SceneTransitionDirection;
	animate?: boolean;
};

type SceneResources = {
	scene: HTMLDivElement;
	container?: HTMLDivElement;
	lyricsViewport?: HTMLDivElement;
	lyricsTrack?: HTMLDivElement;
	groups: AnimatedGroup[];
	viewportController?: LyricsViewportController;
	interludeFrameController?: InterludeFrameController;
	cleaned: boolean;
};

const ROOT_PRESENTATION_CLASSES = [
	"interlude-active",
	"interlude-frame-active",
	"interlude-style-frame",
	"interlude-style-dots",
	"interlude-style-wave",
] as const;

export class LyricsRenderer {
	private readonly rendererInstanceId = ++nextRendererInstanceId;
	private hostRoot?: HTMLElement;
	private sceneTransitionController?: SceneTransitionController;
	private currentScene?: SceneResources;
	private readonly retiredScenes = new Set<SceneResources>();

	public mount(
		root: HTMLElement,
		{ lyrics, settings, timingSource = "native", provider, source, diagnostics, waveforms = {}, rhythm }: LyricsRendererMountOptions,
		presentation?: ScenePresentationOptions
	): SceneTransitionHandle {
		const ownerDocument = root.ownerDocument;
		const container = ownerDocument.createElement("div");
		container.className = "aura-lyrics";
		this.applyRootSettings(container, settings);
		this.applyRhythmProfile(container, rhythm);
		const lyricsViewport = ownerDocument.createElement("div");
		lyricsViewport.className = "lyrics-viewport";
		const lyricsTrack = ownerDocument.createElement("div");
		lyricsTrack.className = `lyrics-track align-${settings.alignmentMode}`;
		lyricsViewport.append(lyricsTrack);
		container.append(lyricsViewport);
		if (timingSource === "synthetic") {
			const description = ownerDocument.createElement("span");
			description.id = `aura-synthetic-timing-description-${this.rendererInstanceId}`;
			description.className = "aura-visually-hidden";
			description.dataset.auraSyntheticDescription = "true";
			description.textContent = syntheticTimingLabel(settings.language);
			container.classList.add("synthetic-timing");
			container.dataset.timingSource = "synthetic";
			container.setAttribute("aria-describedby", description.id);
			container.append(description);
		}
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
		let interludeFrameController: InterludeFrameController | undefined;
		if (scene.mode === "static") {
			lyricsViewport.tabIndex = 0;
			lyricsViewport.setAttribute("aria-label", staticLyricsLabel(settings.language));
		} else {
			const announcer = ownerDocument.createElement("span");
			announcer.className = "aura-visually-hidden";
			announcer.setAttribute("role", "status");
			announcer.setAttribute("aria-live", "polite");
			announcer.setAttribute("aria-atomic", "true");
			container.append(announcer);
			viewportController = new LyricsViewportController(lyricsTrack, lyricsViewport, container, settings, groups, announcer);
			if (settings.showInterludes) {
				interludeFrameController = new InterludeFrameController(root, container, settings.interludeStyle, groups);
			}
		}
		return this.presentScene(
			root,
			{
				scene: container,
				container,
				lyricsViewport,
				lyricsTrack,
				groups,
				viewportController,
				interludeFrameController,
				cleaned: false,
			},
			presentation,
			this.shouldAnimate(presentation, settings.motionEnabled && !settings.reduceMotion),
			false
		);
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
		return this.presentScene(
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
		return this.presentScene(
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
		return this.presentScene(
			root,
			{ scene, groups: [], cleaned: false },
			presentation,
			this.shouldAnimate(presentation, !this.hasReducedMotion(root)),
			true
		);
	}

	public update(timestamp: number, deltaTime: number): void {
		const scene = this.currentScene;
		if (!scene || scene.cleaned) {
			return;
		}
		for (const group of scene.groups) {
			group.animate(timestamp, deltaTime);
		}
		scene.interludeFrameController?.update();
		scene.viewportController?.update();
	}

	public applySettings(settings: ExtensionSettings): void {
		if (settings.reduceMotion || !settings.motionEnabled) {
			this.sceneTransitionController?.finish();
		}
		const scene = this.currentScene;
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
		scene.viewportController?.applySettings(settings);
		scene.viewportController?.update();
		for (const group of scene.groups) {
			group.applySettings?.(settings);
		}
	}

	public destroy(): void {
		const root = this.hostRoot;
		const controller = this.sceneTransitionController;
		const scenes = new Set(this.retiredScenes);
		if (this.currentScene) {
			scenes.add(this.currentScene);
		}
		this.hostRoot = undefined;
		this.sceneTransitionController = undefined;
		this.currentScene = undefined;
		this.retiredScenes.clear();
		controller?.destroy();
		for (const scene of scenes) {
			this.cleanupScene(scene);
		}
		this.setAlbumArtMode(root, false);
		this.clearRootPresentationState(root);
	}

	private presentScene(
		root: HTMLElement,
		scene: SceneResources,
		presentation: ScenePresentationOptions | undefined,
		animate: boolean,
		albumArtMode: boolean
	): SceneTransitionHandle {
		this.ensurePresenter(root);
		const previous = this.currentScene;
		const animatedReplacement = previous !== undefined && root.firstElementChild !== null && animate && presentation?.direction !== undefined;
		this.currentScene = scene;
		this.setAlbumArtMode(root, albumArtMode);
		const handle = this.sceneTransitionController?.present(scene.scene, {
			direction: presentation?.direction,
			animate,
		});
		if (!handle) {
			throw new Error("Scene transition controller was not initialized.");
		}
		if (previous) {
			this.deactivateInterludeFrame(previous);
			if (animatedReplacement) {
				this.retiredScenes.add(previous);
				void handle.settled.then(() => this.releaseRetiredScene(previous, root));
			} else {
				this.cleanupScene(previous);
			}
			this.reapplyCurrentInterludeFrame(root);
		}
		return handle;
	}

	private ensurePresenter(root: HTMLElement): void {
		if (this.hostRoot === root && this.sceneTransitionController) {
			return;
		}
		if (this.hostRoot || this.sceneTransitionController || this.currentScene || this.retiredScenes.size > 0) {
			this.destroy();
		}
		this.hostRoot = root;
		this.sceneTransitionController = new SceneTransitionController(root);
	}

	private releaseRetiredScene(scene: SceneResources, root: HTMLElement): void {
		this.retiredScenes.delete(scene);
		this.cleanupScene(scene);
		this.reapplyCurrentInterludeFrame(root);
	}

	private cleanupScene(scene: SceneResources): void {
		if (scene.cleaned) {
			return;
		}
		scene.cleaned = true;
		this.deactivateInterludeFrame(scene);
		scene.viewportController?.destroy();
		scene.scene.remove();
		scene.groups.length = 0;
		scene.container = undefined;
		scene.lyricsViewport = undefined;
		scene.lyricsTrack = undefined;
		scene.viewportController = undefined;
	}

	private deactivateInterludeFrame(scene: SceneResources): void {
		const controller = scene.interludeFrameController;
		scene.interludeFrameController = undefined;
		controller?.destroy();
	}

	private reapplyCurrentInterludeFrame(root: HTMLElement): void {
		if (this.hostRoot === root && this.currentScene && !this.currentScene.cleaned) {
			this.currentScene.interludeFrameController?.update();
		}
	}

	private shouldAnimate(presentation: ScenePresentationOptions | undefined, motionEnabled: boolean): boolean {
		return presentation?.animate === true && motionEnabled;
	}

	private hasReducedMotion(root: HTMLElement): boolean {
		return root.classList.contains("reduce-motion") || root.parentElement?.classList.contains("reduce-motion") === true;
	}

	private clearRootPresentationState(root: HTMLElement | undefined): void {
		if (!root) {
			return;
		}
		root.classList.remove(...ROOT_PRESENTATION_CLASSES);
		root.parentElement?.classList.remove(...ROOT_PRESENTATION_CLASSES);
	}

	private applyRootSettings(root: HTMLElement, settings: ExtensionSettings): void {
		root.style.setProperty("--font-scale", String(settings.fontScale));
		root.style.setProperty("--background-blur", `${settings.backgroundBlurPx}px`);
		root.style.setProperty("--background-dim", String(settings.backgroundDim));
		root.style.setProperty("--background-saturation", String(settings.backgroundSaturation));
		root.style.setProperty("--vignette-strength", String(settings.vignetteStrength));
		root.style.setProperty("--inactive-blur", `${settings.inactiveBlurPx}px`);
		root.style.setProperty("--motion-intensity", String(settings.motionIntensity));
		root.style.setProperty("--spring-softness", String(settings.springSoftness));
		root.style.fontFamily = `${settings.fontFamily}, sans-serif`;
		root.classList.toggle("reduce-motion", settings.reduceMotion || !settings.motionEnabled);
		root.classList.toggle("motion-disabled", !settings.motionEnabled);
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

	private setAlbumArtMode(root: HTMLElement | undefined, enabled: boolean): void {
		if (!root) {
			return;
		}
		root.classList.toggle("album-art-mode", enabled);
		root.parentElement?.classList.toggle("album-art-mode", enabled);
	}
}

const roundSeconds = (value: number): number => Number(value.toFixed(3));

const syntheticTimingLabel = (language: ExtensionSettings["language"]): string => {
	if (language === "ko") return "가상 노래방 싱크";
	if (language === "ja") return "仮想カラオケ同期";
	return "Synthesized karaoke sync";
};

const staticLyricsLabel = (language: ExtensionSettings["language"]): string => {
	if (language === "ko") return "정적 가사 문서";
	if (language === "ja") return "静的歌詞ドキュメント";
	return "Static lyrics document";
};
