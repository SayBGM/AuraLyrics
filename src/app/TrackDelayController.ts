import type { TrackIdentity } from "../lyrics/types";
import type { ExtensionSettings } from "../settings/settingsSchema";
import type { CurrentTrackLyricsDelayState } from "../settings/settingsViewTypes";
import type { TrackLyricsDelayStore } from "../settings/TrackLyricsDelayStore";
import type { OutroRenderOutcome } from "./PresentationController";

/**
 * What the delay controller needs from the presentation side to reflect a delay change immediately.
 * Kept deliberately narrow so the controller can be unit-tested without a PiP session.
 */
export type TrackDelayPresentation = {
	/** Re-reads the player clock and returns the corrected timestamp, or `undefined` with no PiP session. */
	resyncTimestampSec(): number | undefined;
	resumeIntro(timestampSec: number): OutroRenderOutcome;
	evaluateOutro(timestampSec: number): OutroRenderOutcome;
	/** Repaints the mounted lyrics scene without advancing motion; no-op when lyrics are not mounted. */
	repaintMountedLyrics(timestampSec: number): void;
};

export type TrackDelayHost = {
	/**
	 * Read live from the player, not from `ExtensionApp.currentTrack`: the settings panel must reflect
	 * what is actually playing even before a track change has been processed.
	 */
	readonly playingTrack: TrackIdentity | undefined;
	readonly settings: ExtensionSettings;
	/** Re-reads the current track into the settings panel's per-track delay card. */
	refreshSettingsView(): void;
	readonly presentation: TrackDelayPresentation;
};

/**
 * Owns the per-track lyrics delay: the value the playback synchronizer offsets by, the state the
 * settings panel renders, and the immediate re-render that makes a nudge visible without waiting for
 * the next frame.
 */
export class TrackDelayController {
	public constructor(
		private readonly delays: TrackLyricsDelayStore,
		private readonly host: TrackDelayHost
	) {}

	/** Delay in ms applied when reading the player timestamp: the per-track override, else the global default. */
	public resolvedLyricsDelayMs(): number {
		return this.delays.resolve(this.host.playingTrack?.uri, this.host.settings.lyricsDelayMs);
	}

	public currentTrackLyricsDelayState(): CurrentTrackLyricsDelayState | undefined {
		const track = this.host.playingTrack;
		if (!track) {
			return undefined;
		}
		const defaultDelayMs = this.host.settings.lyricsDelayMs;
		const override = this.delays.get(track.uri);
		return {
			artist: track.artist,
			delayMs: override ?? defaultDelayMs,
			defaultDelayMs,
			hasOverride: override !== undefined,
			title: track.title,
			uri: track.uri,
		};
	}

	/** Nudges the override for `uri` by `deltaMs`. Returns whether the new value persisted. */
	public adjustCurrentTrackLyricsDelay(uri: string, deltaMs: number): boolean {
		const state = this.currentTrackLyricsDelayState();
		if (!state || state.uri !== uri) {
			this.host.refreshSettingsView();
			return false;
		}
		const result = this.delays.set(uri, state.delayMs + deltaMs);
		this.refreshLyricsTiming();
		return result.persisted;
	}

	/** Drops the override for `uri`, falling back to the global delay. Returns whether that persisted. */
	public resetCurrentTrackLyricsDelay(uri: string): boolean {
		if (this.host.playingTrack?.uri !== uri) {
			this.host.refreshSettingsView();
			return false;
		}
		const persisted = this.delays.delete(uri);
		this.refreshLyricsTiming();
		return persisted;
	}

	/**
	 * Re-runs the intro gate and outro switch at the corrected timestamp so a delay change is visible
	 * right away, repainting the mounted lyrics only when neither gate already did.
	 */
	private refreshLyricsTiming(): void {
		const presentation = this.host.presentation;
		const timestampSec = presentation.resyncTimestampSec();
		if (timestampSec === undefined) {
			return;
		}
		const introOutcome = presentation.resumeIntro(timestampSec);
		const outroOutcome = presentation.evaluateOutro(timestampSec);
		if (introOutcome === "none" && outroOutcome === "none") {
			presentation.repaintMountedLyrics(timestampSec);
		}
	}
}
