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
import { appendProviderSource } from "./lyricsTrackHelpers";

export type { StatusViewModel } from "./components/StatusScene";
export { interludeKey } from "./interludeProgress";
export type { InterludeWaveformMap } from "./interludeWaveforms";

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

export class LyricsRenderer {
	private hostRoot?: HTMLElement;
	private container?: HTMLDivElement;
	private lyricsViewport?: HTMLDivElement;
	private lyricsTrack?: HTMLDivElement;
	private groups: AnimatedGroup[] = [];
	private viewportController?: LyricsViewportController;
	private interludeFrameController?: InterludeFrameController;

	public mount(
		root: HTMLElement,
		{ lyrics, settings, timingSource = "native", provider, source, diagnostics, waveforms = {}, rhythm }: LyricsRendererMountOptions
	): void {
		this.destroy();
		this.hostRoot = root;
		const ownerDocument = root.ownerDocument;
		this.container = ownerDocument.createElement("div");
		this.container.className = "aura-lyrics";
		this.applyRootSettings(this.container, settings);
		this.applyRhythmProfile(this.container, rhythm);
		this.lyricsViewport = ownerDocument.createElement("div");
		this.lyricsViewport.className = "lyrics-viewport";
		this.lyricsTrack = ownerDocument.createElement("div");
		this.lyricsTrack.className = `lyrics-track align-${settings.alignmentMode}`;
		this.lyricsViewport.append(this.lyricsTrack);
		this.container.append(this.lyricsViewport);
		root.replaceChildren(this.container);
		if (timingSource === "synthetic") {
			const marker = ownerDocument.createElement("span");
			marker.className = "aura-timing-marker";
			marker.dataset.auraTimingMarker = "true";
			marker.setAttribute("role", "img");
			marker.setAttribute("aria-label", timingMarkerLabel(settings.language));
			marker.title = timingMarkerLabel(settings.language);
			this.container.append(marker);
		}
		this.groups = buildLyricsScene(this.lyricsTrack, { lyrics, settings, waveforms, rhythm }).groups;
		this.viewportController = new LyricsViewportController(this.lyricsTrack, this.lyricsViewport, this.container, settings, this.groups);
		this.interludeFrameController = new InterludeFrameController(root, this.container, settings.interludeStyle, this.groups);
		appendProviderSource(ownerDocument, this.lyricsTrack, { provider, source, diagnostics, showDiagnostics: settings.debugMode });
	}

	public showStatus(root: HTMLElement, status: StatusViewModel, settings: ExtensionSettings): void {
		this.destroy();
		this.hostRoot = root;
		this.setAlbumArtMode(root, false);
		const ownerDocument = root.ownerDocument;
		this.container = createStatusScene(ownerDocument, status);
		this.applyRootSettings(this.container, settings);
		root.replaceChildren(this.container);
	}

	public showTrackMetadata(root: HTMLElement, metadata: TrackMetadataViewModel, settings: ExtensionSettings): void {
		this.destroy();
		this.hostRoot = root;
		this.setAlbumArtMode(root, false);
		this.container = createTrackMetadataScene(root.ownerDocument, metadata);
		this.applyRootSettings(this.container, settings);
		root.replaceChildren(this.container);
	}

	public showAlbumArt(root: HTMLElement): void {
		this.destroy();
		this.hostRoot = root;
		this.setAlbumArtMode(root, true);
		root.replaceChildren();
	}

	public update(timestamp: number, deltaTime: number): void {
		for (const group of this.groups) {
			group.animate(timestamp, deltaTime);
		}
		this.interludeFrameController?.update();
		this.viewportController?.update();
	}

	public destroy(): void {
		this.interludeFrameController?.destroy();
		this.setAlbumArtMode(this.hostRoot, false);
		this.groups = [];
		this.container?.remove();
		this.hostRoot = undefined;
		this.container = undefined;
		this.lyricsViewport = undefined;
		this.lyricsTrack = undefined;
		this.viewportController = undefined;
		this.interludeFrameController = undefined;
	}

	private applyRootSettings(root: HTMLElement, settings: ExtensionSettings): void {
		root.style.setProperty("--font-scale", String(settings.fontScale));
		root.style.setProperty("--background-blur", `${settings.backgroundBlurPx}px`);
		root.style.setProperty("--background-dim", String(settings.backgroundDim));
		root.style.setProperty("--background-saturation", String(settings.backgroundSaturation));
		root.style.setProperty("--vignette-strength", String(settings.vignetteStrength));
		root.style.setProperty("--inactive-blur", `${settings.inactiveBlurPx}px`);
		root.style.setProperty("--motion-intensity", String(settings.motionIntensity));
		root.style.fontFamily = `${settings.fontFamily}, sans-serif`;
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

const timingMarkerLabel = (language: ExtensionSettings["language"]): string => {
	if (language === "ko") return "가상 노래방 싱크";
	if (language === "ja") return "仮想カラオケ同期";
	return "Synthesized karaoke sync";
};
