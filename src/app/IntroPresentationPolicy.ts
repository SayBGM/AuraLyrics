import type { LyricsDocument } from "../lyrics/types";
import type { SyncPreference } from "../settings/settingsSchema";

export const INTRO_IMMEDIATE_THRESHOLD_SEC = 2;

export const firstRenderedVocalStartSec = (lyrics: LyricsDocument, syncPreference: SyncPreference): number | undefined => {
	if (lyrics.type === "static") {
		return undefined;
	}

	const startTimes: number[] = [];
	if (lyrics.type === "line") {
		for (const item of lyrics.content) {
			if (item.type === "vocal") {
				startTimes.push(item.startTime);
			}
		}
		return startTimes.length > 0 ? Math.min(...startTimes) : undefined;
	}

	for (const item of lyrics.content) {
		if (item.type === "interlude") {
			continue;
		}
		startTimes.push(item.lead.startTime);
		if (syncPreference === "prefer-syllable") {
			startTimes.push(...(item.background ?? []).map((vocal) => vocal.startTime));
		}
	}

	return startTimes.length > 0 ? Math.min(...startTimes) : undefined;
};

export const introDecision = ({
	firstVocalStartSec,
	timestampSec,
	applyImmediateThreshold,
}: {
	firstVocalStartSec: number | undefined;
	timestampSec: number;
	applyImmediateThreshold: boolean;
}): "hold" | "reveal" => {
	if (firstVocalStartSec === undefined) {
		return "reveal";
	}
	const thresholdSec = applyImmediateThreshold ? INTRO_IMMEDIATE_THRESHOLD_SEC : 0;
	return firstVocalStartSec - timestampSec <= thresholdSec ? "reveal" : "hold";
};
