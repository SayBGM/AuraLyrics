import type { Interlude, LyricsDocument } from "../lyrics/types";
import type { InterludeStyle } from "../settings/SettingsStore";
import type { InterludeWaveform, TrackWaveformProfile } from "./AudioAnalysisWaveformService";
import { interludeKey } from "./interludeProgress";

export type InterludeWaveformMap = Record<string, InterludeWaveform>;

export type BuildInterludeWaveformMapInput = {
	lyrics: LyricsDocument;
	profile?: TrackWaveformProfile;
	interludeStyle: InterludeStyle;
	waveformForInterlude: (profile: TrackWaveformProfile, interlude: Interlude) => InterludeWaveform;
};

export const buildInterludeWaveformMap = ({
	lyrics,
	profile,
	interludeStyle,
	waveformForInterlude,
}: BuildInterludeWaveformMapInput): InterludeWaveformMap => {
	if (!profile || interludeStyle !== "wave" || lyrics.type === "static") {
		return {};
	}
	const waveforms: InterludeWaveformMap = {};
	for (const item of lyrics.content) {
		if (item.type === "interlude") {
			waveforms[interludeKey(item)] = waveformForInterlude(profile, item);
		}
	}
	return waveforms;
};
