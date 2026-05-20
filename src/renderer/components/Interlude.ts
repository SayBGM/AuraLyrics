import type { Interlude as InterludeMetadata } from "../../lyrics/types";

export class InterludeView {
	public readonly element: HTMLDivElement;
	public readonly startTime: number;
	public readonly endTime: number;

	public constructor(private readonly interlude: InterludeMetadata) {
		this.startTime = interlude.startTime;
		this.endTime = interlude.endTime;
		this.element = document.createElement("div");
		this.element.className = "vocals-group interlude";
		this.element.setAttribute("aria-label", "Instrumental break");
		this.element.innerHTML =
			'<span class="interlude-pill"><span class="interlude-dot"></span><span class="interlude-dot"></span><span class="interlude-dot"></span></span>';
	}

	public animate(timestamp: number): void {
		const active = timestamp >= this.interlude.startTime && timestamp <= this.interlude.endTime;
		this.element.classList.toggle("active", active);
		this.element.classList.toggle("sung", timestamp > this.interlude.endTime);
		this.element.classList.toggle("idle", timestamp < this.interlude.startTime);
	}
}
