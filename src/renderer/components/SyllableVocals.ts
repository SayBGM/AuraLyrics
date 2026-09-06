import type { Syllable, SyllableVocal } from "../../lyrics/types";
import type { ExtensionSettings } from "../../settings/SettingsStore";
import { clamp } from "../../shared/math";
import type { RhythmProfile } from "../AudioAnalysisWaveformService";
import { createHighlightMotionSample, sampleHighlightMotionInto } from "../animation/highlightMotion";
import { Spring } from "../animation/Spring";
import { SPRING_PROFILES, springTuningForSoftness } from "../animation/springTuning";
import { HighlightDecorationTrack, type HighlightDecorationTrackProvider } from "../highlight/HighlightDecorationLayout";
import {
	applyLifecycleClasses,
	createHighlightStyleCache,
	createLifecycleCache,
	type HighlightStyleCache,
	type LifecycleClassCache,
	lifecycleUnchanged,
	writeHighlightStyles,
} from "../highlight/highlightStyleWriter";
import { melismaBoostForProgress } from "../lyrics/koreanTail";
import { buildSyllableRows, type SyllableRowsOptions, type SyllableVisualGroup } from "../lyrics/syllableRows";

type LiveSyllable = {
	metadata: Syllable;
	element: HTMLSpanElement;
	scale: Spring;
	yOffset: Spring;
	glow: Spring;
	index: number;
	highlightUnits: number;
	progress: number;
	isMelisma: boolean;
	classes: LifecycleClassCache;
	styles: HighlightStyleCache;
	melismaStep?: string;
	lastProgress: number;
	lastImmediate?: boolean;
	lastStyleVersion: number;
};

type LiveHighlightTrack = {
	element: HTMLSpanElement;
	syllables: LiveSyllable[];
	startTime: number;
	endTime: number;
	decoration: HighlightDecorationTrack;
	classes: LifecycleClassCache;
};

type LiveRow = {
	element: HTMLSpanElement;
	startTime: number;
	endTime: number;
	holdEndTime: number;
	classes: LifecycleClassCache;
};

type SyllableRow = {
	element: HTMLSpanElement;
	main: HTMLSpanElement;
	echo: HTMLSpanElement;
};

export class SyllableVocals implements HighlightDecorationTrackProvider {
	public readonly element: HTMLDivElement;
	public hasParenthetical = false;
	private readonly liveSyllables: LiveSyllable[] = [];
	private readonly liveHighlightTracks: LiveHighlightTrack[] = [];
	private readonly liveRows: LiveRow[] = [];
	private motionIntensity = 1;
	private glowStrength = 0.8;
	private highlightMotion: ExtensionSettings["highlightMotion"] = "spring";
	private readonly elementClasses = createLifecycleCache();
	private readonly motionSample = createHighlightMotionSample();
	private styleVersion = 0;
	private settled = false;

	public constructor(
		private readonly vocal: SyllableVocal,
		private readonly isBackground: boolean,
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
		applyLifecycleClasses(this.element, { active, sung, idle: !active && !sung }, this.elementClasses);

		for (const row of this.liveRows) {
			const rowActive = timestamp >= row.startTime && timestamp < row.holdEndTime;
			const rowSung = timestamp >= row.holdEndTime;
			applyLifecycleClasses(row.element, { active: rowActive, sung: rowSung, idle: !rowActive && !rowSung }, row.classes);
		}

		let settled = true;
		for (const live of this.liveSyllables) {
			const progress = clamp((timestamp - live.metadata.startTime) / Math.max(live.metadata.endTime - live.metadata.startTime, 0.001), 0, 1);
			const state = {
				active: progress > 0 && progress < 1,
				sung: timestamp >= live.metadata.endTime,
				idle: timestamp <= live.metadata.startTime,
			};
			const sleeping = live.scale.isSleeping() && live.yOffset.isSleeping() && live.glow.isSleeping();
			// Nothing observable can differ from the previous frame: identical progress and
			// settings, settled springs, and the same lifecycle classes already on the element.
			if (
				sleeping &&
				live.lastProgress === progress &&
				live.lastImmediate === immediate &&
				live.lastStyleVersion === this.styleVersion &&
				lifecycleUnchanged(live.classes, state)
			) {
				continue;
			}
			const motion = sampleHighlightMotionInto(this.motionSample, this.highlightMotion, progress, live.index, this.motionIntensity, immediate);
			const scale = motion.scale;
			const yOffset = motion.yOffset;
			const glow = motion.glow;
			if (immediate || deltaTime <= 0) {
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
			if (live.isMelisma) {
				const melisma = melismaBoostForProgress(progress);
				nextScale += melisma.scale * this.motionIntensity;
				nextYOffset += melisma.yOffset * this.motionIntensity;
				nextGlow = Math.max(nextGlow, melisma.glow);
				const step = String(melisma.step);
				if (live.melismaStep !== step) {
					live.element.style.setProperty("--melisma-step", step);
					live.melismaStep = step;
				}
			}
			applyLifecycleClasses(live.element, state, live.classes);
			writeHighlightStyles(
				live.element,
				live.element,
				{
					scale: nextScale,
					scaleX: motion.scaleX,
					scaleY: motion.scaleY,
					yOffset: nextYOffset,
					rotationDeg: motion.rotationDeg,
					glow: nextGlow,
					ripple: motion.ripple,
					progress,
				},
				this.glowStrength,
				live.styles
			);
			live.progress = progress;
			live.lastProgress = progress;
			live.lastImmediate = immediate;
			live.lastStyleVersion = this.styleVersion;
			if (!(live.scale.isSleeping() && live.yOffset.isSleeping() && live.glow.isSleeping())) {
				settled = false;
			}
		}
		this.settled = settled;

		for (const track of this.liveHighlightTracks) {
			track.decoration.updateProgressFromPieces();
			const progress = track.decoration.getProgress();
			applyLifecycleClasses(
				track.element,
				{ active: progress > 0 && progress < 1, sung: timestamp >= track.endTime, idle: timestamp <= track.startTime },
				track.classes
			);
		}
	}

	/** True once every live spring has come to rest, so the group can leave the animated window. */
	public isSettled(): boolean {
		return this.settled;
	}

	public getHighlightDecorationTracks(): readonly HighlightDecorationTrack[] {
		return this.liveHighlightTracks.map((track) => track.decoration);
	}

	public applySettings(settings: ExtensionSettings): void {
		// Invalidate the per-frame dirty check: the same timestamp can now produce different motion.
		this.styleVersion += 1;
		const backgroundScale = this.isBackground ? 0.72 : 1;
		this.motionIntensity = Math.max(0, settings.motionIntensity) * backgroundScale;
		this.glowStrength = Math.max(0, settings.glowStrength) * backgroundScale;
		this.highlightMotion = settings.highlightMotion;
		const scaleTuning = springTuningForSoftness(SPRING_PROFILES.scale, settings.springSoftness);
		const yOffsetTuning = springTuningForSoftness(SPRING_PROFILES.yOffset, settings.springSoftness);
		const glowTuning = springTuningForSoftness(SPRING_PROFILES.glow, settings.springSoftness);
		for (const live of this.liveSyllables) {
			live.scale.configure(scaleTuning.dampingRatio, scaleTuning.frequency);
			live.yOffset.configure(yOffsetTuning.dampingRatio, yOffsetTuning.frequency);
			live.glow.configure(glowTuning.dampingRatio, glowTuning.frequency);
		}
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
			row.element.setAttribute("aria-label", syllableRowLabel(rowModel.main, rowModel.echo));
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
				classes: createLifecycleCache(),
			});
			this.element.append(row.element);
		}
		this.applySettings(settings);
	}

	private appendGroup(parent: HTMLSpanElement, group: SyllableVisualGroup): void {
		const syllables: LiveSyllable[] = [];
		for (const wordModel of group.words) {
			const word = createWord(wordModel.isParenthetical, this.ownerDocument);
			for (const className of wordModel.extraClasses) {
				word.classList.add(className);
			}
			for (const token of wordModel.tokens) {
				syllables.push(this.appendLiveSyllable(word, token.text, token.metadata, token.isParenthetical, token.extraClasses));
			}
			parent.append(word);
		}
		if (syllables.length === 0) {
			return;
		}
		parent.classList.add("syllable-highlight-track", "idle");
		parent.dir = "auto";
		const decoration = new HighlightDecorationTrack({
			host: parent,
			pieces: syllables.map((syllable) => ({
				element: syllable.element,
				getProgress: () => syllable.progress,
				fallbackWeight: syllable.highlightUnits,
			})),
		});
		let startTime = Number.POSITIVE_INFINITY;
		let endTime = Number.NEGATIVE_INFINITY;
		for (const syllable of syllables) {
			startTime = Math.min(startTime, syllable.metadata.startTime);
			endTime = Math.max(endTime, syllable.metadata.endTime);
		}
		this.liveHighlightTracks.push({
			element: parent,
			syllables,
			startTime,
			endTime,
			decoration,
			classes: createLifecycleCache(),
		});
	}

	private appendLiveSyllable(
		word: HTMLSpanElement,
		text: string,
		metadata: Syllable,
		isParenthetical: boolean,
		extraClasses: string[] = []
	): LiveSyllable {
		const span = this.ownerDocument.createElement("span");
		span.className = "lyric syllable synced highlight-target highlight-glyph-target idle";
		span.textContent = text;
		span.classList.toggle("parenthetical-syllable", isParenthetical);
		for (const className of extraClasses) {
			span.classList.add(className);
		}
		word.append(span);
		const live = {
			metadata,
			element: span,
			scale: new Spring(1, SPRING_PROFILES.scale.dampingRatio, SPRING_PROFILES.scale.frequency),
			yOffset: new Spring(0, SPRING_PROFILES.yOffset.dampingRatio, SPRING_PROFILES.yOffset.frequency),
			glow: new Spring(0, SPRING_PROFILES.glow.dampingRatio, SPRING_PROFILES.glow.frequency),
			index: this.liveSyllables.length,
			highlightUnits: textUnits(text),
			progress: 0,
			isMelisma: span.classList.contains("korean-melisma-sustain"),
			classes: createLifecycleCache(),
			styles: createHighlightStyleCache(),
			lastProgress: Number.NaN,
			lastStyleVersion: -1,
		} satisfies LiveSyllable;
		this.liveSyllables.push(live);
		return live;
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

const syllableRowLabel = (main: SyllableVisualGroup, echo: SyllableVisualGroup): string =>
	[main, echo]
		.map((group) =>
			group.words
				.map((word) =>
					word.tokens
						.map((token) => token.text)
						.join("")
						.trim()
				)
				.filter(Boolean)
				.join(" ")
		)
		.filter(Boolean)
		.join(" ");

const createWord = (isParenthetical: boolean, ownerDocument: Document): HTMLSpanElement => {
	const word = ownerDocument.createElement("span");
	word.className = `word${isParenthetical ? " parenthetical-word" : ""}`;
	return word;
};

const textUnits = (text: string): number => Math.max([...text].length, 1);
