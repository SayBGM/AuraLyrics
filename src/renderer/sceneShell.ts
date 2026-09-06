import type { ExtensionSettings } from "../settings/SettingsStore";
import { translate } from "../settings/settingsTranslations";

export type LyricsSceneShell = {
	container: HTMLDivElement;
	lyricsViewport: HTMLDivElement;
	lyricsTrack: HTMLDivElement;
};

/**
 * Builds the DOM scaffold every lyrics scene starts from: the scene container, the viewport
 * and the track that `buildLyricsScene` fills, plus the visually hidden description that
 * announces synthesized (pseudo-karaoke) timing.
 *
 * Pure element construction only — settings/rhythm/theme writes stay with the renderer.
 */
export const buildSceneShell = (
	ownerDocument: Document,
	settings: ExtensionSettings,
	timingSource: "native" | "synthetic",
	instanceId: number
): LyricsSceneShell => {
	const container = ownerDocument.createElement("div");
	container.className = "aura-lyrics";
	const lyricsViewport = ownerDocument.createElement("div");
	lyricsViewport.className = "lyrics-viewport";
	const lyricsTrack = ownerDocument.createElement("div");
	lyricsTrack.className = `lyrics-track align-${settings.alignmentMode}`;
	lyricsViewport.append(lyricsTrack);
	container.append(lyricsViewport);
	if (timingSource === "synthetic") {
		const description = ownerDocument.createElement("span");
		description.id = `aura-synthetic-timing-description-${instanceId}`;
		description.className = "aura-visually-hidden";
		description.dataset.auraSyntheticDescription = "true";
		description.textContent = syntheticTimingLabel(settings.language);
		container.classList.add("synthetic-timing");
		container.dataset.timingSource = "synthetic";
		container.setAttribute("aria-describedby", description.id);
		container.append(description);
	}
	return { container, lyricsViewport, lyricsTrack };
};

/** The live region timed scenes use to announce the focused row. Detached; the caller appends it. */
export const createSceneAnnouncer = (ownerDocument: Document): HTMLSpanElement => {
	const announcer = ownerDocument.createElement("span");
	announcer.className = "aura-visually-hidden";
	announcer.setAttribute("role", "status");
	announcer.setAttribute("aria-live", "polite");
	announcer.setAttribute("aria-atomic", "true");
	return announcer;
};

export const syntheticTimingLabel = (language: ExtensionSettings["language"]): string => translate("syntheticTimingAriaLabel", language);

export const staticLyricsLabel = (language: ExtensionSettings["language"]): string => translate("staticLyricsAriaLabel", language);
