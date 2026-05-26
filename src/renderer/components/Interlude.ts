import type { Interlude as InterludeMetadata } from "../../lyrics/types";
import type { InterludeStyle } from "../../settings/SettingsStore";
import type { InterludeWaveform } from "../AudioAnalysisWaveformService";

export class InterludeView {
	public readonly element: HTMLDivElement;
	public readonly startTime: number;
	public readonly endTime: number;
	public isActive = false;
	public progress = 0;
	private readonly bars: HTMLSpanElement[] = [];

	public constructor(
		private readonly interlude: InterludeMetadata,
		private readonly style: InterludeStyle,
		waveform?: InterludeWaveform
	) {
		this.startTime = interlude.startTime;
		this.endTime = interlude.endTime;
		this.element = document.createElement("div");
		this.element.className = `vocals-group interlude interlude-style-${style}`;
		this.element.setAttribute("aria-label", "Instrumental break");
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
		this.element.classList.toggle("active", active);
		this.element.classList.toggle("sung", timestamp > this.interlude.endTime);
		this.element.classList.toggle("idle", timestamp < this.interlude.startTime);
		const duration = Math.max(0.001, this.interlude.endTime - this.interlude.startTime);
		const progress = Math.min(1, Math.max(0, (timestamp - this.interlude.startTime) / duration));
		this.progress = progress;
		this.element.style.setProperty("--interlude-progress", `${Math.round(progress * 10000) / 100}%`);
		if (this.style === "wave") {
			this.updateBarProgress(progress);
		}
	}

	private createWaveform(bars: number[]): HTMLSpanElement {
		const wrapper = document.createElement("span");
		wrapper.className = "interlude-wave";
		for (const [index, height] of bars.entries()) {
			const bar = document.createElement("span");
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
		for (const [index, bar] of this.bars.entries()) {
			const fill = Math.min(1, Math.max(0, progress * count - index));
			bar.style.setProperty("--bar-fill-ratio", String(Math.round(fill * 1000) / 1000));
		}
	}
}

const fallbackBars = (): number[] => [0.24, 0.52, 0.8, 0.42, 0.68, 0.34, 0.58, 0.86, 0.46, 0.64, 0.3, 0.72];
