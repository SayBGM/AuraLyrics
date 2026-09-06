import type { PipSession } from "../pip/DocumentPipController";

/**
 * Staleness token for work scoped to "this track, in this PiP session".
 *
 * Replaces the parallel `session` / `playbackTrackEpoch` / `currentTrack.uri` / `themeGeneration`
 * comparisons that every async continuation in `ExtensionApp` used to repeat by hand.
 *
 * - `id` advances once per track change (`ExtensionApp.playbackTrackEpoch`), so a repeat of the same
 *   URI still produces a new epoch.
 * - `themeGeneration` advances once per `loadCurrentTrack` call, so a manual refresh of the same
 *   track supersedes the previous in-flight theme extraction while leaving the track epoch intact
 *   (an active track transition must survive a refresh).
 */
export type TrackEpoch = {
	readonly id: number;
	readonly uri: string;
	readonly session: PipSession;
	readonly themeGeneration: number;
};

/** True when both epochs address the same track change in the same PiP session. */
export const sameTrackEpoch = (a: TrackEpoch, b: TrackEpoch): boolean => a.session === b.session && a.id === b.id && a.uri === b.uri;
