import type { LineVocal } from "../../lyrics/types";
import type { ExtensionSettings } from "../../settings/SettingsStore";
import { sampleHighlightMotion } from "../animation/highlightMotion";
import { clamp } from "../animation/Spline";
import { createTranslationElement } from "../lyricsTrackHelpers";

export class LineVocals {
	public readonly element: HTMLDivElement;
	public readonly startTime: number;
	public readonly endTime: number;
	private holdEndTime: number;
	private readonly lineElement: HTMLSpanElement;
	private highlightMotion: ExtensionSettings["highlightMotion"] = "spring";
	private motionIntensity = 1;
	private glowStrength = 0.8;
	private reducedMotion = false;

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
		this.lineElement.className = "lyric line highlight-target";
		this.lineElement.dir = "auto";
		appendLineTokens(this.lineElement, line.text, this.ownerDocument);
		this.element.append(this.lineElement);
		if (settings.showTranslation && line.translatedText) {
			this.element.append(createTranslationElement(line.translatedText, this.ownerDocument));
		}
		this.applySettings(settings);
	}

	public setHoldEndTime(endTime: number): void {
		this.holdEndTime = Math.max(this.line.endTime, endTime);
	}

	public animate(timestamp: number): void {
		const active = timestamp >= this.line.startTime && timestamp < this.holdEndTime;
		const sung = timestamp >= this.holdEndTime;
		const progress = clamp((timestamp - this.line.startTime) / Math.max(this.line.endTime - this.line.startTime, 0.001), 0, 1);
		const motion = sampleHighlightMotion(this.highlightMotion, progress, 0, this.motionIntensity, this.reducedMotion);
		this.element.classList.toggle("active", active);
		this.element.classList.toggle("sung", sung);
		this.element.classList.toggle("idle", !active && !sung);
		this.lineElement.classList.toggle("active", progress > 0 && progress < 1);
		this.lineElement.classList.toggle("sung", timestamp >= this.line.endTime);
		this.lineElement.classList.toggle("idle", timestamp <= this.line.startTime);
		this.lineElement.style.scale = String(motion.scale);
		this.lineElement.style.transform = `translateY(calc(var(--lyrics-size) * ${motion.yOffset})) rotate(${motion.rotationDeg}deg) scaleX(${motion.scaleX}) scaleY(${motion.scaleY})`;
		this.lineElement.style.setProperty("--highlight-progress", `${progress * 100}%`);
		this.lineElement.style.setProperty("--highlight-progress-ratio", String(progress));
		this.lineElement.style.setProperty("--gradient-progress", `${progress * 100}%`);
		this.lineElement.style.setProperty("--line-progress", `${progress * 100}%`);
		this.lineElement.style.setProperty("--highlight-ripple", String(motion.ripple));
		const effectiveGlow = motion.glow * (this.glowStrength / 0.8);
		this.lineElement.style.setProperty("--text-shadow-opacity", `${effectiveGlow * 100}%`);
		this.lineElement.style.setProperty("--text-shadow-blur-radius", `${4 + effectiveGlow * 8}px`);
	}

	public applySettings(settings: ExtensionSettings): void {
		this.highlightMotion = settings.highlightMotion;
		this.motionIntensity = Math.max(0, settings.motionIntensity);
		this.glowStrength = Math.max(0, settings.glowStrength);
		this.reducedMotion = settings.reduceMotion || !settings.motionEnabled;
		this.element.style.setProperty("--font-scale", String(settings.fontScale));
	}
}

const appendLineTokens = (line: HTMLSpanElement, text: string, ownerDocument: Document): void => {
	const parts = text.match(/\S+|\s+/gu) ?? [];
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
	}
};
