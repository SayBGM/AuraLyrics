import type { ExtensionSettings } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import type { HighlightDecorationLayoutController } from "./highlight/HighlightDecorationLayout";
import type { InterludeFrameController } from "./InterludeFrameController";
import type { LyricsViewportController } from "./LyricsViewportController";
import { SceneTransitionController, type SceneTransitionDirection, type SceneTransitionHandle } from "./SceneTransitionController";

export type ScenePresentationOptions = {
	direction?: SceneTransitionDirection;
	animate?: boolean;
};

/** Everything one presented scene owns: its DOM, its animated groups and its controllers. */
export type SceneResources = {
	scene: HTMLDivElement;
	container?: HTMLDivElement;
	lyricsViewport?: HTMLDivElement;
	lyricsTrack?: HTMLDivElement;
	groups: AnimatedGroup[];
	viewportController?: LyricsViewportController;
	highlightLayoutController?: HighlightDecorationLayoutController;
	interludeFrameController?: InterludeFrameController;
	layoutSettings?: Pick<ExtensionSettings, "alignmentMode" | "fontFamily" | "fontScale">;
	layoutFrame?: number;
	cleaned: boolean;
	/** Indices animated on the previous frame, so leaving groups still get one settling pass. */
	animatedIndices?: Set<number>;
	lastAnimatedTimestamp?: number;
};

const ROOT_PRESENTATION_CLASSES = [
	"interlude-active",
	"interlude-frame-active",
	"interlude-style-frame",
	"interlude-style-dots",
	"interlude-style-wave",
] as const;

/**
 * Owns the scene lifecycle: which scene is current, which are still fading out, and when each
 * one's controllers and DOM are released. `LyricsRenderer` builds scenes and hands them here;
 * everything after `present()` — retiring the previous scene, waiting for the transition,
 * cleanup, and the presentation classes left on the host root — belongs to this class.
 */
export class ScenePresenter {
	private hostRoot?: HTMLElement;
	private transitionController?: SceneTransitionController;
	private activeScene?: SceneResources;
	private readonly retiredScenes = new Set<SceneResources>();

	/** The scene currently on screen, or `undefined` before the first `present()`/after `destroy()`. */
	public get current(): SceneResources | undefined {
		return this.activeScene;
	}

	/** Cuts a running transition short (used when motion is turned off mid-transition). */
	public finishTransition(): void {
		this.transitionController?.finish();
	}

	public present(
		root: HTMLElement,
		scene: SceneResources,
		presentation: ScenePresentationOptions | undefined,
		animate: boolean,
		albumArtMode: boolean
	): SceneTransitionHandle {
		this.ensurePresenter(root);
		const previous = this.activeScene;
		const animatedReplacement = previous !== undefined && root.firstElementChild !== null && animate && presentation?.direction !== undefined;
		this.activeScene = scene;
		this.setAlbumArtMode(root, albumArtMode);
		const handle = this.transitionController?.present(scene.scene, {
			direction: presentation?.direction,
			animate,
		});
		if (!handle) {
			throw new Error("Scene transition controller was not initialized.");
		}
		if (previous) {
			this.deactivateInterludeFrame(previous);
			this.deactivateHighlightLayout(previous);
			// The retired scene is still in the DOM for the transition: stop it from reacting
			// to resizes (and forcing layout) while it fades out.
			previous.viewportController?.pause();
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

	public destroy(): void {
		const root = this.hostRoot;
		const controller = this.transitionController;
		const scenes = new Set(this.retiredScenes);
		if (this.activeScene) {
			scenes.add(this.activeScene);
		}
		this.hostRoot = undefined;
		this.transitionController = undefined;
		this.activeScene = undefined;
		this.retiredScenes.clear();
		controller?.destroy();
		for (const scene of scenes) {
			this.cleanupScene(scene);
		}
		this.setAlbumArtMode(root, false);
		this.clearRootPresentationState(root);
	}

	/** Defers the first viewport pass to the next frame, for scenes without a highlight layout. */
	public scheduleLayoutUpdate(scene: SceneResources): void {
		const hostWindow = scene.scene.ownerDocument.defaultView;
		if (!hostWindow?.requestAnimationFrame || !scene.viewportController) {
			return;
		}
		scene.layoutFrame = hostWindow.requestAnimationFrame(() => {
			scene.layoutFrame = undefined;
			if (!scene.cleaned && this.activeScene === scene) {
				scene.viewportController?.update();
			}
		});
	}

	/** Runs a pending `scheduleLayoutUpdate` synchronously, so settings land in the same tick. */
	public finishLayoutUpdate(scene: SceneResources): void {
		if (scene.layoutFrame === undefined) {
			return;
		}
		scene.scene.ownerDocument.defaultView?.cancelAnimationFrame?.(scene.layoutFrame);
		scene.layoutFrame = undefined;
		scene.viewportController?.update();
	}

	private ensurePresenter(root: HTMLElement): void {
		if (this.hostRoot === root && this.transitionController) {
			return;
		}
		if (this.hostRoot || this.transitionController || this.activeScene || this.retiredScenes.size > 0) {
			this.destroy();
		}
		this.hostRoot = root;
		this.transitionController = new SceneTransitionController(root);
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
		const hostWindow = scene.scene.ownerDocument.defaultView;
		if (scene.layoutFrame !== undefined) {
			hostWindow?.cancelAnimationFrame?.(scene.layoutFrame);
			scene.layoutFrame = undefined;
		}
		this.deactivateInterludeFrame(scene);
		this.deactivateHighlightLayout(scene);
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

	private deactivateHighlightLayout(scene: SceneResources): void {
		const controller = scene.highlightLayoutController;
		scene.highlightLayoutController = undefined;
		controller?.destroy();
	}

	private reapplyCurrentInterludeFrame(root: HTMLElement): void {
		if (this.hostRoot === root && this.activeScene && !this.activeScene.cleaned) {
			this.activeScene.interludeFrameController?.update();
		}
	}

	private setAlbumArtMode(root: HTMLElement | undefined, enabled: boolean): void {
		if (!root) {
			return;
		}
		root.classList.toggle("album-art-mode", enabled);
		root.parentElement?.classList.toggle("album-art-mode", enabled);
	}

	private clearRootPresentationState(root: HTMLElement | undefined): void {
		if (!root) {
			return;
		}
		root.classList.remove(...ROOT_PRESENTATION_CLASSES);
		root.parentElement?.classList.remove(...ROOT_PRESENTATION_CLASSES);
	}
}
