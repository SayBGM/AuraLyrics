import type { LineVocal } from "../../lyrics/types";
import type { ExtensionSettings } from "../../settings/SettingsStore";
import { clamp } from "../../shared/math";
import { createHighlightMotionSample, sampleHighlightMotionInto } from "../animation/highlightMotion";
import { HighlightDecorationTrack, type HighlightDecorationTrackProvider } from "../highlight/HighlightDecorationLayout";
import {
	applyLifecycleClasses,
	createHighlightStyleCache,
	createLifecycleCache,
	lifecycleUnchanged,
	writeHighlightStyles,
} from "../highlight/highlightStyleWriter";
import { createTranslationElement } from "../lyricsTrackHelpers";

// Whole-line highlighting is sampled straight from the motion curves: unlike SyllableVocals
// there are no per-glyph springs here, so `springSoftness` deliberately has no effect on it.
export class LineVocals implements HighlightDecorationTrackProvider {
	public readonly element: HTMLDivElement;
	public readonly startTime: number;
	public readonly endTime: number;
	private holdEndTime: number;
	private readonly lineElement: HTMLSpanElement;
	private readonly glyphLayer: HTMLSpanElement;
	private readonly highlightDecorationTrack: HighlightDecorationTrack;
	private highlightMotion: ExtensionSettings["highlightMotion"] = "spring";
	private motionIntensity = 1;
	private glowStrength = 0.8;
	private reducedMotion = false;
	private readonly groupClasses = createLifecycleCache();
	private readonly lineClasses = createLifecycleCache();
	private readonly glyphClasses = createLifecycleCache();
	private readonly styles = createHighlightStyleCache();
	private readonly motionSample = createHighlightMotionSample();
	private styleVersion = 0;
	private lastStyleVersion = -1;
	private lastProgress = Number.NaN;

	public constructor(
		private readonly line: LineVocal,
		settings: ExtensionSettings,
		private readonly ownerDocument: Document = document
	) {
		this.startTime = line.startTime;
		this.endTime = line.endTime;
		this.holdEndTime = line.endTime;
		this.element = this.ownerDocument.createElement("div");
		this.element.className = "vocals-group line-group";
		this.element.classList.toggle("opposite-aligned", line.oppositeAligned);
		this.element.dataset.startTime = String(line.startTime);
		this.element.dataset.endTime = String(line.endTime);
		this.lineElement = this.ownerDocument.createElement("span");
		this.lineElement.className = "lyric line highlight-layout-host idle";
		this.lineElement.dir = "auto";
		this.glyphLayer = this.ownerDocument.createElement("span");
		this.glyphLayer.className = "highlight-glyph-layer highlight-target idle";
		const tokens = appendLineTokens(this.glyphLayer, line.text, this.ownerDocument);
		this.lineElement.append(this.glyphLayer);
		this.highlightDecorationTrack = new HighlightDecorationTrack({
			host: this.lineElement,
			pieces: tokens.map((element) => ({ element })),
		});
		this.element.append(this.lineElement);
		if (settings.showTranslation && line.translatedText) {
			this.element.append(createTranslationElement(line.translatedText, this.ownerDocument));
		}
		this.applySettings(settings);
	}

	public setHoldEndTime(endTime: number): void {
		this.holdEndTime = Math.max(this.line.endTime, endTime);
	}

	public getHighlightDecorationTracks(): readonly HighlightDecorationTrack[] {
		return [this.highlightDecorationTrack];
	}

	public animate(timestamp: number): void {
		const active = timestamp >= this.line.startTime && timestamp < this.holdEndTime;
		const sung = timestamp >= this.holdEndTime;
		const groupState = { active, sung, idle: !active && !sung };
		const progress = clamp((timestamp - this.line.startTime) / Math.max(this.line.endTime - this.line.startTime, 0.001), 0, 1);
		const highlightState = {
			active: progress > 0 && progress < 1,
			sung: timestamp >= this.line.endTime,
			idle: timestamp <= this.line.startTime,
		};
		if (
			this.lastProgress === progress &&
			this.lastStyleVersion === this.styleVersion &&
			lifecycleUnchanged(this.groupClasses, groupState) &&
			lifecycleUnchanged(this.lineClasses, highlightState)
		) {
			return;
		}
		const motion = sampleHighlightMotionInto(this.motionSample, this.highlightMotion, progress, 0, this.motionIntensity, this.reducedMotion);
		applyLifecycleClasses(this.element, groupState, this.groupClasses);
		applyLifecycleClasses(this.lineElement, highlightState, this.lineClasses);
		applyLifecycleClasses(this.glyphLayer, highlightState, this.glyphClasses);
		writeHighlightStyles(
			this.lineElement,
			this.glyphLayer,
			{
				scale: motion.scale,
				scaleX: motion.scaleX,
				scaleY: motion.scaleY,
				yOffset: motion.yOffset,
				rotationDeg: motion.rotationDeg,
				glow: motion.glow,
				ripple: motion.ripple,
				progress,
			},
			this.glowStrength,
			this.styles
		);
		this.highlightDecorationTrack.setProgress(progress);
		this.lastProgress = progress;
		this.lastStyleVersion = this.styleVersion;
	}

	public applySettings(settings: ExtensionSettings): void {
		// Invalidate the per-frame dirty check: the same timestamp can now produce different motion.
		this.styleVersion += 1;
		this.highlightMotion = settings.highlightMotion;
		this.motionIntensity = Math.max(0, settings.motionIntensity);
		this.glowStrength = Math.max(0, settings.glowStrength);
		this.reducedMotion = settings.reduceMotion || !settings.motionEnabled;
		this.element.style.setProperty("--font-scale", String(settings.fontScale));
	}
}

const appendLineTokens = (line: HTMLSpanElement, text: string, ownerDocument: Document): HTMLElement[] => {
	const parts = text.match(/\S+|\s+/gu) ?? [];
	const tokens: HTMLElement[] = [];
	for (const part of parts) {
		if (/^\s+$/u.test(part)) {
			line.append(ownerDocument.createTextNode(part));
			continue;
		}
		const word = ownerDocument.createElement("span");
		word.className = "word";
		const token = ownerDocument.createElement("span");
		token.className = "lyric line-token";
		token.textContent = part;
		word.append(token);
		line.append(word);
		tokens.push(token);
	}
	return tokens;
};
