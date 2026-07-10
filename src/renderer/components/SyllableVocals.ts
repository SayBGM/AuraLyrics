import type { Syllable, SyllableVocal } from "../../lyrics/types";
import type { ExtensionSettings } from "../../settings/SettingsStore";
import type { RhythmProfile } from "../AudioAnalysisWaveformService";
import { glowCurve, scaleCurve, yOffsetCurve } from "../animation/curves";
import { clamp } from "../animation/Spline";
import { Spring } from "../animation/Spring";
import { melismaBoostForProgress } from "../lyrics/koreanTail";
import { buildSyllableRows, type SyllableRowsOptions, type SyllableVisualGroup } from "../lyrics/syllableRows";

type LiveSyllable = {
	metadata: Syllable;
	element: HTMLSpanElement;
	scale: Spring;
	yOffset: Spring;
	glow: Spring;
};

type LiveRow = {
	element: HTMLSpanElement;
	startTime: number;
	endTime: number;
	holdEndTime: number;
};

type SyllableRow = {
	element: HTMLSpanElement;
	main: HTMLSpanElement;
	echo: HTMLSpanElement;
};

export class SyllableVocals {
	public readonly element: HTMLDivElement;
	public hasParenthetical = false;
	private readonly liveSyllables: LiveSyllable[] = [];
	private readonly liveRows: LiveRow[] = [];
	private motionIntensity = 1;
	private glowStrength = 0.8;

	public constructor(
		private readonly vocal: SyllableVocal,
		isBackground: boolean,
		settings: ExtensionSettings,
		private readonly rhythm?: RhythmProfile,
		private readonly rowsOptions?: SyllableRowsOptions,
		private readonly ownerDocument: Document = document
	) {
		this.element = this.ownerDocument.createElement("div");
		this.element.className = `vocals ${isBackground ? "background" : "lead"}`;
		this.build(settings);
	}

	public animate(timestamp: number, deltaTime: number, immediate = false): void {
		const active = timestamp >= this.vocal.startTime && timestamp <= this.vocal.endTime;
		const sung = timestamp > this.vocal.endTime;
		this.element.classList.toggle("active", active);
		this.element.classList.toggle("sung", sung);
		this.element.classList.toggle("idle", !active && !sung);

		for (const row of this.liveRows) {
			const rowActive = timestamp >= row.startTime && timestamp < row.holdEndTime;
			const rowSung = timestamp >= row.holdEndTime;
			row.element.classList.toggle("active", rowActive);
			row.element.classList.toggle("sung", rowSung);
			row.element.classList.toggle("idle", !rowActive && !rowSung);
		}

		for (const live of this.liveSyllables) {
			const progress = clamp((timestamp - live.metadata.startTime) / Math.max(live.metadata.endTime - live.metadata.startTime, 0.001), 0, 1);
			const scale = 1 + (scaleCurve.at(progress) - 1) * this.motionIntensity;
			const yOffset = yOffsetCurve.at(progress) * this.motionIntensity;
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
			let nextScale = live.scale.update(deltaTime);
			let nextYOffset = live.yOffset.update(deltaTime);
			let nextGlow = live.glow.update(deltaTime);
			if (live.element.classList.contains("korean-melisma-sustain")) {
				const melisma = melismaBoostForProgress(progress);
				nextScale += melisma.scale * this.motionIntensity;
				nextYOffset += melisma.yOffset * this.motionIntensity;
				nextGlow = Math.max(nextGlow, melisma.glow);
				live.element.style.setProperty("--melisma-step", String(melisma.step));
			}
			live.element.classList.toggle("active", progress > 0 && progress < 1);
			live.element.classList.toggle("sung", timestamp > live.metadata.endTime);
			live.element.style.scale = nextScale.toString();
			live.element.style.transform = `translateY(calc(var(--lyrics-size) * ${nextYOffset}))`;
			const effectiveGlow = nextGlow * (this.glowStrength / 0.8);
			live.element.style.setProperty("--text-shadow-opacity", `${effectiveGlow * 100}%`);
			live.element.style.setProperty("--text-shadow-blur-radius", `${4 + effectiveGlow * 8}px`);
			live.element.style.setProperty("--gradient-progress", `${progress * 100}%`);
		}
	}

	public applySettings(settings: ExtensionSettings): void {
		this.motionIntensity = Math.max(0, settings.motionIntensity);
		this.glowStrength = Math.max(0, settings.glowStrength);
		this.element.style.setProperty("--font-scale", String(settings.fontScale));
		this.element.style.setProperty("--glow-strength", String(settings.glowStrength));
	}

	private build(settings: ExtensionSettings): void {
		const model = buildSyllableRows(this.vocal, this.rhythm, this.rowsOptions);
		this.hasParenthetical = model.hasParenthetical;
		this.element.classList.toggle("has-parenthetical", this.hasParenthetical);
		for (const rowModel of model.rows) {
			const row = createSyllableRow(this.ownerDocument);
			row.element.dataset.scrollRow = "true";
			for (const className of rowModel.rowClasses) {
				row.element.classList.add(className);
			}
			this.appendGroup(row.main, rowModel.main);
			this.appendGroup(row.echo, rowModel.echo);
			this.liveRows.push({
				element: row.element,
				startTime: rowModel.startTime,
				endTime: rowModel.endTime,
				holdEndTime: rowModel.holdEndTime,
			});
			this.element.append(row.element);
		}
		this.applySettings(settings);
	}

	private appendGroup(parent: HTMLSpanElement, group: SyllableVisualGroup): void {
		for (const wordModel of group.words) {
			const word = createWord(wordModel.isParenthetical, this.ownerDocument);
			for (const className of wordModel.extraClasses) {
				word.classList.add(className);
			}
			for (const token of wordModel.tokens) {
				this.appendLiveSyllable(word, token.text, token.metadata, token.isParenthetical, token.extraClasses);
			}
			parent.append(word);
		}
	}

	private appendLiveSyllable(word: HTMLSpanElement, text: string, metadata: Syllable, isParenthetical: boolean, extraClasses: string[] = []): void {
		const span = this.ownerDocument.createElement("span");
		span.className = "lyric syllable synced";
		span.textContent = text;
		span.classList.toggle("parenthetical-syllable", isParenthetical);
		for (const className of extraClasses) {
			span.classList.add(className);
		}
		word.append(span);
		this.liveSyllables.push({
			metadata,
			element: span,
			scale: new Spring(1, 0.6, 0.7),
			yOffset: new Spring(0, 0.4, 1.25),
			glow: new Spring(0, 0.5, 1),
		});
	}
}

const createSyllableRow = (ownerDocument: Document): SyllableRow => {
	const row = ownerDocument.createElement("span");
	row.className = "syllable-row";
	const main = ownerDocument.createElement("span");
	main.className = "syllable-main";
	const echo = ownerDocument.createElement("span");
	echo.className = "syllable-echo";
	row.append(main, echo);
	return { element: row, main, echo };
};

const createWord = (isParenthetical: boolean, ownerDocument: Document): HTMLSpanElement => {
	const word = ownerDocument.createElement("span");
	word.className = `word${isParenthetical ? " parenthetical-word" : ""}`;
	return word;
};
