import type { Syllable, SyllableVocal } from "../../lyrics/types";
import type { ExtensionSettings } from "../../settings/SettingsStore";
import { glowCurve, scaleCurve, yOffsetCurve } from "../animation/curves";
import { clamp } from "../animation/Spline";
import { Spring } from "../animation/Spring";

type LiveSyllable = {
	metadata: Syllable;
	element: HTMLSpanElement;
	scale: Spring;
	yOffset: Spring;
	glow: Spring;
};

export class SyllableVocals {
	public readonly element: HTMLDivElement;
	private readonly liveSyllables: LiveSyllable[] = [];

	public constructor(
		private readonly vocal: SyllableVocal,
		isBackground: boolean,
		settings: ExtensionSettings
	) {
		this.element = document.createElement("div");
		this.element.className = `vocals ${isBackground ? "background" : "lead"}`;
		this.build(settings);
	}

	public animate(timestamp: number, deltaTime: number, immediate = false): void {
		const active = timestamp >= this.vocal.startTime && timestamp <= this.vocal.endTime;
		const sung = timestamp > this.vocal.endTime;
		this.element.classList.toggle("active", active);
		this.element.classList.toggle("sung", sung);
		this.element.classList.toggle("idle", !active && !sung);

		for (const live of this.liveSyllables) {
			const progress = clamp((timestamp - live.metadata.startTime) / Math.max(live.metadata.endTime - live.metadata.startTime, 0.001), 0, 1);
			const scale = scaleCurve.at(progress);
			const yOffset = yOffsetCurve.at(progress);
			const glow = glowCurve.at(progress);
			if (immediate) {
				live.scale.set(scale);
				live.yOffset.set(yOffset);
				live.glow.set(glow);
			} else {
				live.scale.setTarget(scale);
				live.yOffset.setTarget(yOffset);
				live.glow.setTarget(glow);
			}
			const nextScale = live.scale.update(deltaTime);
			const nextYOffset = live.yOffset.update(deltaTime);
			const nextGlow = live.glow.update(deltaTime);
			live.element.classList.toggle("active", progress > 0 && progress < 1);
			live.element.classList.toggle("sung", timestamp > live.metadata.endTime);
			live.element.style.scale = nextScale.toString();
			live.element.style.transform = `translateY(calc(var(--lyrics-size) * ${nextYOffset}))`;
			live.element.style.setProperty("--text-shadow-opacity", `${nextGlow * 100}%`);
			live.element.style.setProperty("--text-shadow-blur-radius", `${4 + nextGlow * 8}px`);
			live.element.style.setProperty("--gradient-progress", `${progress * 100}%`);
		}
	}

	public applySettings(settings: ExtensionSettings): void {
		this.element.style.setProperty("--font-scale", String(settings.fontScale));
		this.element.style.setProperty("--glow-strength", String(settings.glowStrength));
	}

	private build(settings: ExtensionSettings): void {
		let word: HTMLSpanElement | undefined;
		for (const syllable of this.vocal.syllables) {
			if (!word) {
				word = document.createElement("span");
				word.className = "word";
				this.element.append(word);
			}
			const span = document.createElement("span");
			span.className = "lyric syllable synced";
			span.textContent = syllable.romanizedText ?? syllable.text;
			word.append(span);
			this.liveSyllables.push({
				metadata: syllable,
				element: span,
				scale: new Spring(1, 0.6, 0.7),
				yOffset: new Spring(0, 0.4, 1.25),
				glow: new Spring(0, 0.5, 1),
			});
			if (!syllable.isPartOfWord) {
				word = undefined;
			}
		}
		this.applySettings(settings);
	}
}
