import type { LineVocal } from "../../lyrics/types";
import type { ExtensionSettings } from "../../settings/SettingsStore";

export class LineVocals {
	public readonly element: HTMLDivElement;
	public readonly startTime: number;
	public readonly endTime: number;
	private holdEndTime: number;

	public constructor(
		private readonly line: LineVocal,
		settings: ExtensionSettings
	) {
		this.startTime = line.startTime;
		this.endTime = line.endTime;
		this.holdEndTime = line.endTime;
		this.element = document.createElement("div");
		this.element.className = "vocals-group line-group";
		this.element.classList.toggle("opposite-aligned", line.oppositeAligned);
		this.element.dataset.startTime = String(line.startTime);
		this.element.dataset.endTime = String(line.endTime);
		const span = document.createElement("span");
		span.className = "lyric line";
		appendLineTokens(span, line.romanizedText ?? line.text);
		this.element.append(span);
		this.applySettings(settings);
	}

	public setHoldEndTime(endTime: number): void {
		this.holdEndTime = Math.max(this.line.endTime, endTime);
	}

	public animate(timestamp: number): void {
		const active = timestamp >= this.line.startTime && timestamp < this.holdEndTime;
		const sung = timestamp >= this.holdEndTime;
		this.element.classList.toggle("active", active);
		this.element.classList.toggle("sung", sung);
		this.element.classList.toggle("idle", !active && !sung);
	}

	public applySettings(settings: ExtensionSettings): void {
		this.element.style.setProperty("--font-scale", String(settings.fontScale));
	}
}

const appendLineTokens = (line: HTMLSpanElement, text: string): void => {
	const parts = text.match(/\S+|\s+/gu) ?? [];
	for (const part of parts) {
		if (/^\s+$/u.test(part)) {
			line.append(document.createTextNode(part));
			continue;
		}
		const word = document.createElement("span");
		word.className = "word";
		const token = document.createElement("span");
		token.className = "lyric line-token";
		token.textContent = part;
		word.append(token);
		line.append(word);
	}
};
