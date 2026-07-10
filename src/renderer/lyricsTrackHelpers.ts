import type { LyricsLoadDiagnostics, ProviderAttemptStatus, SyllableVocalSet } from "../lyrics/types";
import type { AnimatedGroup } from "./AnimatedGroup";

export const applyHoldTiming = (groups: AnimatedGroup[]): void => {
	for (let index = 0; index < groups.length; index += 1) {
		const group = groups[index];
		const next = groups.slice(index + 1).find((item) => item.startTime > group.startTime);
		if (next) {
			group.setHoldEndTime?.(next.startTime);
		}
	}
};

export const syllableToLine = (item: SyllableVocalSet) => ({
	type: "vocal" as const,
	text: item.lead.syllables.map((syllable, index) => `${index > 0 && !syllable.isPartOfWord ? " " : ""}${syllable.text}`).join(""),
	translatedText: item.translatedText,
	startTime: item.lead.startTime,
	endTime: item.lead.endTime,
	oppositeAligned: item.oppositeAligned,
});

// Translations render as one plain block of text — parentheses inside a translation are
// never split into segments; the translation style takes priority over parenthetical styling.
export const createTranslationElement = (text: string, ownerDocument: Document = document): HTMLSpanElement => {
	const translation = ownerDocument.createElement("span");
	translation.className = "lyric-translation";
	translation.textContent = text;
	return translation;
};

type ProviderSourceOptions = {
	provider: string | undefined;
	source?: "cache" | "network";
	diagnostics?: LyricsLoadDiagnostics;
	showDiagnostics?: boolean;
};

export const appendProviderSource = (
	ownerDocument: Document,
	lyricsTrack: HTMLElement,
	{ provider, source: loadSource, diagnostics, showDiagnostics = false }: ProviderSourceOptions
): void => {
	if (!provider) {
		return;
	}
	const sourceElement = ownerDocument.createElement("div");
	sourceElement.className = "provider-source";
	sourceElement.textContent = `Source: ${provider}${showDiagnostics && loadSource ? ` · ${loadSource}` : ""}`;
	lyricsTrack.append(sourceElement);
	if (!showDiagnostics || !diagnostics) {
		return;
	}
	const detail = ownerDocument.createElement("div");
	detail.className = "provider-diagnostics";
	detail.textContent = providerDiagnosticsText(diagnostics);
	lyricsTrack.append(detail);
};

const providerDiagnosticsText = (diagnostics: LyricsLoadDiagnostics): string => {
	const cache = diagnostics.cache;
	const cacheDetail =
		cache.status === "hit" || cache.status === "provider-mismatch"
			? `cache ${cache.status.replace("-", " ")} (${cache.provider})`
			: `cache ${cache.status.replace("-", " ")}`;
	const attempts = diagnostics.attempts.map((attempt) => `${attempt.provider}: ${attemptStatusLabel(attempt.status)}`).join(" -> ");
	return attempts ? `${cacheDetail} · ${attempts}` : cacheDetail;
};

const attemptStatusLabel = (status: ProviderAttemptStatus): string => status.replace("-", " ");
