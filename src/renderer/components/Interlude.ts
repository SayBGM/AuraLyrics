import type { Interlude as InterludeMetadata } from "../../lyrics/types";
import type { InterludeStyle } from "../../settings/SettingsStore";
import type { UiLanguage } from "../../settings/settingsSchema";
import type { AnimatedGroup } from "../AnimatedGroup";
import type { InterludeWaveform } from "../AudioAnalysisWaveformService";
import { applyLifecycleClasses, createLifecycleCache } from "../highlight/highlightStyleWriter";
import { interludeProgressAt, progressPercent } from "../interludeProgress";

export class InterludeView {
	public readonly element: HTMLDivElement;
	public readonly startTime: number;
	public readonly endTime: number;
	public isActive = false;
	public progress = 0;
	/** Frame-style interludes stay out of the lyrics track, so their element never needs styling. */
	public attached = true;
	private readonly bars: HTMLSpanElement[] = [];
	private readonly classes = createLifecycleCache();
	private lastProgressValue?: string;
	private lastBarProgress = Number.NaN;

	public constructor(
		private readonly interlude: InterludeMetadata,
		private readonly style: InterludeStyle,
		language: UiLanguage,
		waveform?: InterludeWaveform,
		private readonly ownerDocument: Document = document
	) {
		this.startTime = interlude.startTime;
		this.endTime = interlude.endTime;
		this.element = this.ownerDocument.createElement("div");
		this.element.className = `vocals-group interlude interlude-style-${style}`;
		this.element.setAttribute("aria-label", interludeLabel(language));
		this.element.dataset.interludeStyle = style;
		if (style === "dots") {
			this.element.innerHTML =
				'<span class="interlude-pill"><span class="interlude-dot"></span><span class="interlude-dot"></span><span class="interlude-dot"></span></span>';
		}
		if (style === "wave") {
			this.element.dataset.waveformSource = waveform?.source ?? "seeded";
			this.element.append(this.createWaveform(waveform?.bars ?? fallbackBars()));
		}
	}

	public animate(timestamp: number): void {
		const active = timestamp >= this.interlude.startTime && timestamp <= this.interlude.endTime;
		this.isActive = active;
		const progress = interludeProgressAt(timestamp, this.interlude.startTime, this.interlude.endTime);
		this.progress = progress;
		if (!this.attached) {
			return;
		}
		applyLifecycleClasses(
			this.element,
			{ active, sung: timestamp > this.interlude.endTime, idle: timestamp < this.interlude.startTime },
			this.classes
		);
		const percent = progressPercent(progress);
		if (this.lastProgressValue !== percent) {
			this.element.style.setProperty("--interlude-progress", percent);
			this.lastProgressValue = percent;
		}
		if (this.style === "wave" && this.lastBarProgress !== progress) {
			this.updateBarProgress(progress);
			this.lastBarProgress = progress;
		}
	}

	private createWaveform(bars: number[]): HTMLSpanElement {
		const wrapper = this.ownerDocument.createElement("span");
		wrapper.className = "interlude-wave";
		for (const [index, height] of bars.entries()) {
			const bar = this.ownerDocument.createElement("span");
			bar.className = "interlude-wave-bar";
			bar.style.setProperty("--bar-index", String(index));
			bar.style.setProperty("--bar-height", String(Math.min(1, Math.max(0.14, height))));
			bar.style.setProperty("--bar-fill-ratio", "0");
			this.bars.push(bar);
			wrapper.append(bar);
		}
		return wrapper;
	}

	private updateBarProgress(progress: number): void {
		const count = this.bars.length;
		if (count === 0) {
			return;
		}
		for (let index = 0; index < count; index += 1) {
			const bar = this.bars[index];
			const fill = Math.min(1, Math.max(0, progress * count - index));
			const value = String(Math.round(fill * 1000) / 1000);
			if (bar.style.getPropertyValue("--bar-fill-ratio") !== value) {
				bar.style.setProperty("--bar-fill-ratio", value);
			}
		}
	}
}

export const isActiveInterlude = (group: AnimatedGroup): group is InterludeView => group instanceof InterludeView && group.isActive;

const fallbackBars = (): number[] => [0.24, 0.52, 0.8, 0.42, 0.68, 0.34, 0.58, 0.86, 0.46, 0.64, 0.3, 0.72];

const interludeLabel = (language: UiLanguage): string => {
	if (language === "ko") return "연주 구간";
	if (language === "ja") return "間奏";
	return "Instrumental break";
};
