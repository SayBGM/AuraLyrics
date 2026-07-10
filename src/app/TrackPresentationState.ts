import type { TrackIdentity } from "../lyrics/types";
import type { ReadyTrackSessionSnapshot, TrackSessionSnapshot } from "./TrackSessionController";

export type TrackPresentationState =
	| { kind: "loading"; track: TrackIdentity }
	| { kind: "lyrics"; snapshot: ReadyTrackSessionSnapshot }
	| {
			kind: "metadata";
			track: TrackIdentity;
			reason: "error" | "no-lyrics" | "unsupported-local";
			message?: string;
	  }
	| { kind: "instrumental"; track: TrackIdentity };

export const presentationStateForSnapshot = (snapshot: TrackSessionSnapshot): TrackPresentationState | undefined => {
	const state = snapshot.loadState;
	if (state.status === "idle") {
		return undefined;
	}
	if (state.status === "loading") {
		return { kind: "loading", track: state.track };
	}
	if (state.status === "ready") {
		return { kind: "lyrics", snapshot: snapshot as ReadyTrackSessionSnapshot };
	}
	if (state.status === "error") {
		return { kind: "metadata", track: state.track, reason: "error", message: state.message };
	}
	if (state.reason === "instrumental") {
		return { kind: "instrumental", track: state.track };
	}
	return { kind: "metadata", track: state.track, reason: state.reason };
};
