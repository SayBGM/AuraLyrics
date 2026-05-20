import type { Interlude, LyricsDocument } from "../lyrics/types";
import type { ExtensionSettings } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import { InterludeView } from "./components/Interlude";
import { LineVocals } from "./components/LineVocals";
import { SyllableVocals } from "./components/SyllableVocals";
import { appendProviderSource, applyHoldTiming, scrollActiveIntoView, syllableToLine, updateContextVisibility } from "./lyricsTrackHelpers";

export type StatusViewModel = {
	title: string;
	detail?: string;
	tone?: "neutral" | "danger";
	actionLabel?: string;
	onAction?: () => void;
};

export class LyricsRenderer {
	private container?: HTMLDivElement;
	private lyricsViewport?: HTMLDivElement;
	private lyricsTrack?: HTMLDivElement;
	private groups: AnimatedGroup[] = [];
	private settings?: ExtensionSettings;

	public mount(root: HTMLElement, lyrics: LyricsDocument, settings: ExtensionSettings, provider?: string): void {
		this.destroy();
		this.container = document.createElement("div");
		this.container.className = "aura-lyrics";
		this.applyRootSettings(this.container, settings);
		this.settings = settings;
		this.lyricsViewport = document.createElement("div");
		this.lyricsViewport.className = "lyrics-viewport";
		this.lyricsTrack = document.createElement("div");
		this.lyricsTrack.className = `lyrics-track align-${settings.alignmentMode}`;
		this.lyricsViewport.append(this.lyricsTrack);
		this.container.append(this.lyricsViewport);
		root.replaceChildren(this.container);
		this.buildLyrics(lyrics, settings);
		appendProviderSource(this.lyricsTrack, provider);
	}

	public showStatus(root: HTMLElement, status: StatusViewModel, settings: ExtensionSettings): void {
		this.destroy();
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

	public update(timestamp: number, deltaTime: number): void {
		for (const group of this.groups) {
			group.animate(timestamp, deltaTime);
		}
		if (!this.lyricsTrack || !this.lyricsViewport) {
			return;
		}
		updateContextVisibility(this.lyricsTrack, Math.max(0, Math.round(this.settings?.visibleContextLines ?? 1)));
		scrollActiveIntoView(this.lyricsTrack, this.lyricsViewport, this.container, this.settings);
	}

	public destroy(): void {
		this.groups = [];
		this.container?.remove();
		this.container = undefined;
		this.lyricsViewport = undefined;
		this.lyricsTrack = undefined;
		this.settings = undefined;
	}

	private buildLyrics(lyrics: LyricsDocument, settings: ExtensionSettings): void {
		if (!this.lyricsTrack) {
			return;
		}
		if (lyrics.type === "static") {
			for (const line of lyrics.lines) {
				const row = document.createElement("div");
				row.className = "vocals-group static";
				row.textContent = line.romanizedText ?? line.text;
				this.lyricsTrack.append(row);
			}
			return;
		}
		if (lyrics.type === "line") {
			for (const item of lyrics.content) {
				if (item.type === "interlude") {
					this.appendInterlude(item, settings);
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
				this.appendInterlude(item, settings);
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
			const lead = new SyllableVocals(item.lead, false, settings);
			group.append(lead.element);
			const animated: AnimatedGroup = {
				element: group,
				startTime: item.lead.startTime,
				endTime: item.lead.endTime,
				setHoldEndTime: (endTime) => {
					animated.endTime = Math.max(item.lead.endTime, endTime);
				},
				animate: (timestamp, deltaTime) => {
					lead.animate(timestamp, deltaTime, settings.reduceMotion);
					const active = timestamp >= item.lead.startTime && timestamp < animated.endTime;
					group.classList.toggle("active", active);
					group.classList.toggle("sung", timestamp >= animated.endTime);
					group.classList.toggle("idle", timestamp < item.lead.startTime);
				},
			};
			this.groups.push(animated);
			this.lyricsTrack.append(group);
		}
		applyHoldTiming(this.groups);
	}

	private appendInterlude(item: Interlude, settings: ExtensionSettings): void {
		if (!this.lyricsTrack || !settings.showInterludes) {
			return;
		}
		const interlude = new InterludeView(item);
		this.groups.push(interlude);
		this.lyricsTrack.append(interlude.element);
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
}
