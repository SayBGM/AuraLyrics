import type { Interlude, LyricsDocument, LyricsLoadDiagnostics } from "../lyrics/types";
import type { ExtensionSettings } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import type { RhythmProfile } from "./AudioAnalysisWaveformService";
import { clamp } from "./animation/Spline";
import { InterludeView } from "./components/Interlude";
import { LineVocals } from "./components/LineVocals";
import { SyllableVocals } from "./components/SyllableVocals";
import { createTrackMetadataScene, type TrackMetadataViewModel } from "./components/TrackMetadata";
import type { FrameProgressDimensions } from "./interludeProgress";
import { frameSizeForViewport, interludeKey, progressPercent, splitFrameProgress } from "./interludeProgress";
import type { InterludeWaveformMap } from "./interludeWaveforms";
import {
	appendProviderSource,
	applyHoldTiming,
	createTranslationElement,
	scrollActiveIntoView,
	syllableToLine,
	updateContextVisibility,
} from "./lyricsTrackHelpers";

export { interludeKey } from "./interludeProgress";
export type { InterludeWaveformMap } from "./interludeWaveforms";

export type StatusViewModel = {
	title: string;
	detail?: string;
	tone?: "neutral" | "danger";
	actionLabel?: string;
	onAction?: () => void;
};

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
	private settings?: ExtensionSettings;

	public mount(
		root: HTMLElement,
		{ lyrics, settings, timingSource = "native", provider, source, diagnostics, waveforms = {}, rhythm }: LyricsRendererMountOptions
	): void {
		this.destroy();
		this.hostRoot = root;
		this.container = document.createElement("div");
		this.container.className = "aura-lyrics";
		this.applyRootSettings(this.container, settings);
		this.applyRhythmProfile(this.container, rhythm);
		this.settings = settings;
		this.lyricsViewport = document.createElement("div");
		this.lyricsViewport.className = "lyrics-viewport";
		this.lyricsTrack = document.createElement("div");
		this.lyricsTrack.className = `lyrics-track align-${settings.alignmentMode}`;
		this.lyricsViewport.append(this.lyricsTrack);
		this.container.append(this.lyricsViewport);
		root.replaceChildren(this.container);
		if (timingSource === "synthetic") {
			const marker = document.createElement("span");
			marker.className = "aura-timing-marker";
			marker.dataset.auraTimingMarker = "true";
			marker.setAttribute("role", "img");
			marker.setAttribute("aria-label", timingMarkerLabel(settings.language));
			marker.title = timingMarkerLabel(settings.language);
			this.container.append(marker);
		}
		this.buildLyrics(lyrics, settings, waveforms, rhythm);
		appendProviderSource(this.lyricsTrack, { provider, source, diagnostics, showDiagnostics: settings.debugMode });
	}

	public showStatus(root: HTMLElement, status: StatusViewModel, settings: ExtensionSettings): void {
		this.destroy();
		this.setAlbumArtMode(root, false);
		this.container = document.createElement("div");
		this.container.className = `aura-lyrics status ${status.tone ?? "neutral"}`;
		this.applyRootSettings(this.container, settings);
		const card = document.createElement("div");
		card.className = "status-card";
		const title = document.createElement("strong");
		title.textContent = status.title;
		card.append(title);
		if (status.detail) {
			const detail = document.createElement("span");
			detail.textContent = status.detail;
			card.append(detail);
		}
		if (status.actionLabel && status.onAction) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = status.actionLabel;
			button.addEventListener("click", status.onAction);
			card.append(button);
		}
		this.container.append(card);
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
		this.applyInterludeProgress();
		if (!this.lyricsTrack || !this.lyricsViewport) {
			return;
		}
		const interludePreviewRow = this.settings?.interludeStyle === "frame" ? this.getInterludePreviewRow() : undefined;
		updateContextVisibility(this.lyricsTrack, Math.max(0, Math.round(this.settings?.visibleContextLines ?? 1)), interludePreviewRow);
		scrollActiveIntoView(this.lyricsTrack, this.lyricsViewport, this.container, interludePreviewRow);
	}

	public destroy(): void {
		this.setAlbumArtMode(this.hostRoot, false);
		this.groups = [];
		this.container?.remove();
		this.hostRoot = undefined;
		this.container = undefined;
		this.lyricsViewport = undefined;
		this.lyricsTrack = undefined;
		this.settings = undefined;
	}

	private buildLyrics(lyrics: LyricsDocument, settings: ExtensionSettings, waveforms: InterludeWaveformMap, rhythm?: RhythmProfile): void {
		if (!this.lyricsTrack) {
			return;
		}
		if (lyrics.type === "static") {
			for (const line of lyrics.lines) {
				const row = document.createElement("div");
				row.className = "vocals-group static";
				row.textContent = line.romanizedText ?? line.text;
				if (settings.showTranslation && line.translatedText) {
					row.append(createTranslationElement(line.translatedText));
				}
				this.lyricsTrack.append(row);
			}
			return;
		}
		if (lyrics.type === "line") {
			for (const item of lyrics.content) {
				if (item.type === "interlude") {
					this.appendInterlude(item, settings, waveforms);
					continue;
				}
				const line = new LineVocals(item, settings);
				this.groups.push(line);
				this.lyricsTrack.append(line.element);
			}
			applyHoldTiming(this.groups);
			return;
		}
		for (const item of lyrics.content) {
			if (item.type === "interlude") {
				this.appendInterlude(item, settings, waveforms);
				continue;
			}
			if (settings.syncPreference === "line-only") {
				const line = new LineVocals(syllableToLine(item), settings);
				this.groups.push(line);
				this.lyricsTrack.append(line.element);
				continue;
			}
			const group = document.createElement("div");
			group.className = "vocals-group syllable-group";
			group.classList.toggle("opposite-aligned", item.oppositeAligned);
			// When a translation is shown, the parenthetical echo would land exactly where the
			// translation goes, so parentheses stay inline and the translation style wins.
			const translatedText = settings.showTranslation ? item.translatedText : undefined;
			const vocalOptions = { splitParentheticals: !translatedText };
			const lead = new SyllableVocals(item.lead, false, settings, rhythm, vocalOptions);
			const backgrounds = (item.background ?? []).map((background) => new SyllableVocals(background, true, settings, rhythm, vocalOptions));
			const vocalRanges = [item.lead, ...(item.background ?? [])];
			const startTime = Math.min(...vocalRanges.map((vocal) => vocal.startTime));
			const endTime = Math.max(...vocalRanges.map((vocal) => vocal.endTime));
			group.classList.toggle("has-parenthetical", lead.hasParenthetical);
			group.append(lead.element, ...backgrounds.map((background) => background.element));
			if (translatedText) {
				group.append(createTranslationElement(translatedText));
			}
			const animated: AnimatedGroup = {
				element: group,
				startTime,
				endTime,
				setHoldEndTime: (endTime) => {
					animated.endTime = Math.max(endTime, ...vocalRanges.map((vocal) => vocal.endTime));
				},
				animate: (timestamp, deltaTime) => {
					lead.animate(timestamp, deltaTime, settings.reduceMotion);
					for (const background of backgrounds) {
						background.animate(timestamp, deltaTime, settings.reduceMotion);
					}
					const active = timestamp >= startTime && timestamp < animated.endTime;
					group.classList.toggle("active", active);
					group.classList.toggle("sung", timestamp >= animated.endTime);
					group.classList.toggle("idle", timestamp < startTime);
				},
			};
			this.groups.push(animated);
			this.lyricsTrack.append(group);
		}
		applyHoldTiming(this.groups);
	}

	private appendInterlude(item: Interlude, settings: ExtensionSettings, waveforms: InterludeWaveformMap): void {
		const interlude = new InterludeView(item, settings.interludeStyle, waveforms[interludeKey(item)]);
		this.groups.push(interlude);
		if (this.lyricsTrack && settings.showInterludes && settings.interludeStyle !== "frame") {
			this.lyricsTrack.append(interlude.element);
		}
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

	private getInterludePreviewRow(): HTMLElement | undefined {
		const activeInterludeIndex = this.groups.findIndex(isActiveInterlude);
		if (activeInterludeIndex < 0) {
			return undefined;
		}
		const nextVocal = this.groups
			.slice(activeInterludeIndex + 1)
			.find((group) => !(group instanceof InterludeView) && group.element.parentElement === this.lyricsTrack);
		return nextVocal?.element.querySelector<HTMLElement>("[data-scroll-row='true']") ?? nextVocal?.element;
	}

	private applyInterludeProgress(): void {
		const activeInterlude = this.groups.find(isActiveInterlude);
		const settings = this.settings;
		const frameActive = activeInterlude !== undefined && settings?.interludeStyle === "frame";
		this.container?.classList.toggle("interlude-active", frameActive);
		for (const element of [this.hostRoot, this.hostRoot?.parentElement].filter(
			(value): value is HTMLElement => value !== undefined && value !== null
		)) {
			element.classList.toggle("interlude-active", frameActive);
			element.classList.toggle("interlude-style-frame", settings?.interludeStyle === "frame");
			element.classList.toggle("interlude-style-dots", settings?.interludeStyle === "dots");
			element.classList.toggle("interlude-style-wave", settings?.interludeStyle === "wave");
			element.classList.toggle("interlude-frame-active", frameActive);
			if (frameActive && activeInterlude) {
				element.style.setProperty("--pip-interlude-progress", String(activeInterlude.progress));
				element.style.setProperty("--pip-interlude-progress-percent", progressPercent(activeInterlude.progress));
				const sides = splitFrameProgress(activeInterlude.progress, measureFrameProgressDimensions(element));
				element.style.setProperty("--pip-frame-progress-top", String(sides.top));
				element.style.setProperty("--pip-frame-progress-right", String(sides.right));
				element.style.setProperty("--pip-frame-progress-bottom", String(sides.bottom));
				element.style.setProperty("--pip-frame-progress-left", String(sides.left));
			} else {
				element.style.removeProperty("--pip-interlude-progress");
				element.style.removeProperty("--pip-interlude-progress-percent");
				element.style.removeProperty("--pip-frame-progress-top");
				element.style.removeProperty("--pip-frame-progress-right");
				element.style.removeProperty("--pip-frame-progress-bottom");
				element.style.removeProperty("--pip-frame-progress-left");
			}
		}
	}
}

const isActiveInterlude = (group: AnimatedGroup): group is InterludeView => group instanceof InterludeView && group.isActive;

const roundSeconds = (value: number): number => Number(value.toFixed(3));

const timingMarkerLabel = (language: ExtensionSettings["language"]): string => {
	if (language === "ko") return "가상 노래방 싱크";
	if (language === "ja") return "仮想カラオケ同期";
	return "Synthesized karaoke sync";
};

const measureFrameProgressDimensions = (element: HTMLElement): FrameProgressDimensions | undefined => {
	const rect = element.getBoundingClientRect();
	const width = element.clientWidth || rect.width;
	const height = element.clientHeight || rect.height;
	if (width <= 0 || height <= 0) {
		return undefined;
	}
	return {
		width,
		height,
		frameSize: frameSizeForViewport({ width, height }),
	};
};
