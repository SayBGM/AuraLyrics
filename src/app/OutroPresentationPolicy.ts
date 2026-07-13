import type { LyricsDocument } from "../lyrics/types";
import type { SyncPreference } from "../settings/settingsSchema";

export const OUTRO_METADATA_DELAY_SEC = 2;
export const NATURAL_END_TOLERANCE_SEC = 2;

export type PreviousTrackProgress = {
	previousProgressSec?: number;
	previousDurationSec?: number;
};

export const lastRenderedVocalEndSec = (lyrics: LyricsDocument, syncPreference: SyncPreference): number | undefined => {
	if (lyrics.type === "static") {
		return undefined;
	}

	const endTimes: number[] = [];
	if (lyrics.type === "line") {
		for (const item of lyrics.content) {
			if (item.type === "vocal") {
				endTimes.push(item.endTime);
			}
		}
		return endTimes.length > 0 ? Math.max(...endTimes) : undefined;
	}

	for (const item of lyrics.content) {
		if (item.type === "interlude") {
			continue;
		}
		endTimes.push(item.lead.endTime);
		if (syncPreference === "prefer-syllable") {
			endTimes.push(...(item.background ?? []).map((vocal) => vocal.endTime));
		}
	}

	return endTimes.length > 0 ? Math.max(...endTimes) : undefined;
};

export const outroMetadataThresholdSec = (lyrics: LyricsDocument, syncPreference: SyncPreference, durationSec: number): number | undefined => {
	const lastVocalEndSec = lastRenderedVocalEndSec(lyrics, syncPreference);
	if (lastVocalEndSec === undefined) {
		return undefined;
	}

	const thresholdSec = lastVocalEndSec + OUTRO_METADATA_DELAY_SEC;
	return thresholdSec <= durationSec ? thresholdSec : undefined;
};

export const isNaturalTrackEnd = ({ previousProgressSec, previousDurationSec }: PreviousTrackProgress = {}): boolean =>
	previousProgressSec !== undefined && previousDurationSec !== undefined && previousProgressSec >= previousDurationSec - NATURAL_END_TOLERANCE_SEC;
