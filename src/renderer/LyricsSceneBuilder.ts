import type { Interlude, LyricsDocument } from "../lyrics/types";
import type { ExtensionSettings } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import type { RhythmProfile } from "./AudioAnalysisWaveformService";
import { InterludeView } from "./components/Interlude";
import { LineVocals } from "./components/LineVocals";
import { SyllableVocals } from "./components/SyllableVocals";
import { interludeKey } from "./interludeProgress";
import type { InterludeWaveformMap } from "./interludeWaveforms";
import { applyHoldTiming, createTranslationElement, syllableToLine } from "./lyricsTrackHelpers";

export type LyricsScene = {
	groups: AnimatedGroup[];
};

export type LyricsSceneOptions = {
	lyrics: LyricsDocument;
	settings: ExtensionSettings;
	waveforms?: InterludeWaveformMap;
	rhythm?: RhythmProfile;
};

export const buildLyricsScene = (lyricsTrack: HTMLElement, { lyrics, settings, waveforms = {}, rhythm }: LyricsSceneOptions): LyricsScene => {
	const groups: AnimatedGroup[] = [];
	const ownerDocument = lyricsTrack.ownerDocument;
	if (lyrics.type === "static") {
		for (const line of lyrics.lines) {
			const row = ownerDocument.createElement("div");
			row.className = "vocals-group static";
			row.textContent = line.romanizedText ?? line.text;
			if (settings.showTranslation && line.translatedText) {
				row.append(createTranslationElement(line.translatedText, ownerDocument));
			}
			lyricsTrack.append(row);
		}
		return { groups };
	}

	if (lyrics.type === "line") {
		for (const item of lyrics.content) {
			if (item.type === "interlude") {
				appendInterlude(groups, lyricsTrack, item, settings, waveforms);
				continue;
			}
			const line = new LineVocals(item, settings, ownerDocument);
			groups.push(line);
			lyricsTrack.append(line.element);
		}
		applyHoldTiming(groups);
		return { groups };
	}

	for (const item of lyrics.content) {
		if (item.type === "interlude") {
			appendInterlude(groups, lyricsTrack, item, settings, waveforms);
			continue;
		}
		if (settings.syncPreference === "line-only") {
			const line = new LineVocals(syllableToLine(item), settings, ownerDocument);
			groups.push(line);
			lyricsTrack.append(line.element);
			continue;
		}
		const group = ownerDocument.createElement("div");
		group.className = "vocals-group syllable-group";
		group.classList.toggle("opposite-aligned", item.oppositeAligned);
		// A translation occupies the echo row, so parentheticals stay inline when it is visible.
		const translatedText = settings.showTranslation ? item.translatedText : undefined;
		const vocalOptions = { splitParentheticals: !translatedText };
		const lead = new SyllableVocals(item.lead, false, settings, rhythm, vocalOptions, ownerDocument);
		const backgrounds = (item.background ?? []).map(
			(background) => new SyllableVocals(background, true, settings, rhythm, vocalOptions, ownerDocument)
		);
		const vocalRanges = [item.lead, ...(item.background ?? [])];
		const startTime = Math.min(...vocalRanges.map((vocal) => vocal.startTime));
		const endTime = Math.max(...vocalRanges.map((vocal) => vocal.endTime));
		group.classList.toggle("has-parenthetical", lead.hasParenthetical);
		group.append(lead.element, ...backgrounds.map((background) => background.element));
		if (translatedText) {
			group.append(createTranslationElement(translatedText, ownerDocument));
		}
		let liveSettings = settings;
		const animated: AnimatedGroup = {
			element: group,
			startTime,
			endTime,
			setHoldEndTime: (holdEndTime) => {
				animated.endTime = Math.max(holdEndTime, ...vocalRanges.map((vocal) => vocal.endTime));
			},
			animate: (timestamp, deltaTime) => {
				lead.animate(timestamp, deltaTime, liveSettings.reduceMotion || !liveSettings.motionEnabled);
				for (const background of backgrounds) {
					background.animate(timestamp, deltaTime, liveSettings.reduceMotion || !liveSettings.motionEnabled);
				}
				const active = timestamp >= startTime && timestamp < animated.endTime;
				group.classList.toggle("active", active);
				group.classList.toggle("sung", timestamp >= animated.endTime);
				group.classList.toggle("idle", timestamp < startTime);
			},
			applySettings: (nextSettings) => {
				liveSettings = nextSettings;
				lead.applySettings(nextSettings);
				for (const background of backgrounds) {
					background.applySettings(nextSettings);
				}
			},
		};
		groups.push(animated);
		lyricsTrack.append(group);
	}
	applyHoldTiming(groups);
	return { groups };
};

const appendInterlude = (
	groups: AnimatedGroup[],
	lyricsTrack: HTMLElement,
	item: Interlude,
	settings: ExtensionSettings,
	waveforms: InterludeWaveformMap
): void => {
	const interlude = new InterludeView(item, settings.interludeStyle, waveforms[interludeKey(item)], lyricsTrack.ownerDocument);
	groups.push(interlude);
	if (settings.showInterludes && settings.interludeStyle !== "frame") {
		lyricsTrack.append(interlude.element);
	}
};
