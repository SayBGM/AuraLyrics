import { describe, expect, test } from "vitest";
import { presentationStateForSnapshot } from "../../src/app/TrackPresentationState";
import type { ReadyTrackSessionSnapshot, TrackSessionSnapshot } from "../../src/app/TrackSessionController";
import type { LyricsLoadDiagnostics, TrackIdentity } from "../../src/lyrics/types";

const track: TrackIdentity = {
	uri: "spotify:track:test",
	title: "Title",
	artist: "Artist",
	album: "Album",
	durationMs: 1000,
	isLocal: false,
};

const diagnostics: LyricsLoadDiagnostics = { cache: { status: "bypassed" }, attempts: [] };

describe("presentationStateForSnapshot", () => {
	test("maps idle load state to undefined (nothing to present yet)", () => {
		const snapshot: TrackSessionSnapshot = { loadState: { status: "idle" }, lyrics: undefined, timingSource: "native", waveformProfile: undefined };
		expect(presentationStateForSnapshot(snapshot)).toBeUndefined();
	});

	test("maps loading load state to the loading presentation kind", () => {
		const snapshot: TrackSessionSnapshot = {
			loadState: { status: "loading", track },
			lyrics: undefined,
			timingSource: "native",
			waveformProfile: undefined,
		};
		expect(presentationStateForSnapshot(snapshot)).toEqual({ kind: "loading", track });
	});

	test("maps ready load state to the lyrics presentation kind, carrying the full snapshot", () => {
		const snapshot: ReadyTrackSessionSnapshot = {
			loadState: { status: "ready", track, lyrics: { type: "static", lines: [] }, provider: "lrclib", source: "network", diagnostics },
			lyrics: { type: "static", lines: [] },
			timingSource: "native",
		};
		expect(presentationStateForSnapshot(snapshot)).toEqual({ kind: "lyrics", snapshot });
	});

	test("maps error load state to a metadata presentation with the error reason and message", () => {
		const snapshot: TrackSessionSnapshot = {
			loadState: { status: "error", track, message: "boom", diagnostics },
			lyrics: undefined,
			timingSource: "native",
			waveformProfile: undefined,
		};
		expect(presentationStateForSnapshot(snapshot)).toEqual({ kind: "metadata", track, reason: "error", message: "boom", diagnostics });
	});

	test("maps an empty/instrumental load state to the instrumental presentation kind", () => {
		const snapshot: TrackSessionSnapshot = {
			loadState: { status: "empty", track, reason: "instrumental" },
			lyrics: undefined,
			timingSource: "native",
			waveformProfile: undefined,
		};
		expect(presentationStateForSnapshot(snapshot)).toEqual({ kind: "instrumental", track });
	});

	test("maps other empty load states (no-lyrics, unsupported-local) to metadata without a message", () => {
		const noLyrics: TrackSessionSnapshot = {
			loadState: { status: "empty", track, reason: "no-lyrics", diagnostics },
			lyrics: undefined,
			timingSource: "native",
			waveformProfile: undefined,
		};
		expect(presentationStateForSnapshot(noLyrics)).toEqual({ kind: "metadata", track, reason: "no-lyrics", diagnostics });

		const unsupportedLocal: TrackSessionSnapshot = {
			loadState: { status: "empty", track, reason: "unsupported-local" },
			lyrics: undefined,
			timingSource: "native",
			waveformProfile: undefined,
		};
		expect(presentationStateForSnapshot(unsupportedLocal)).toEqual({ kind: "metadata", track, reason: "unsupported-local" });
	});
});
