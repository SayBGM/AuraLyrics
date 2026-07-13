import { describe, expect, test } from "vitest";
import { OutroPresentationController } from "../../src/app/OutroPresentationController";
import type { ReadyTrackSessionSnapshot } from "../../src/app/TrackSessionController";
import type { LineLyrics, LyricsDocument, SyllableLyrics, TrackIdentity } from "../../src/lyrics/types";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../src/settings/settingsSchema";

const settings = (overrides: Partial<ExtensionSettings> = {}): ExtensionSettings => ({
	...DEFAULT_SETTINGS,
	...overrides,
});

const track = (uri: string, durationMs = 12_000): TrackIdentity => ({
	uri,
	title: `Track ${uri}`,
	artist: "Aura",
	album: "Epoch",
	durationMs,
	isLocal: false,
});

const lineLyrics = (lastVocalEndSec = 8): LineLyrics => ({
	type: "line",
	startTime: 0,
	endTime: lastVocalEndSec + 4,
	content: [
		{
			type: "vocal",
			startTime: Math.max(0, lastVocalEndSec - 4),
			endTime: lastVocalEndSec,
			text: "Last line",
			oppositeAligned: false,
		},
		{ type: "interlude", startTime: lastVocalEndSec, endTime: lastVocalEndSec + 4, generated: true },
	],
});

const interludeOnlyLyrics: LineLyrics = {
	type: "line",
	startTime: 0,
	endTime: 12,
	content: [{ type: "interlude", startTime: 0, endTime: 12 }],
};

const staticLyrics: LyricsDocument = {
	type: "static",
	lines: [{ text: "Untimed lyrics" }],
};

const syllableLyricsWithLateBackground = (): SyllableLyrics => ({
	type: "syllable",
	startTime: 0,
	endTime: 10,
	content: [
		{
			type: "vocal",
			oppositeAligned: false,
			lead: {
				startTime: 4,
				endTime: 8,
				syllables: [{ text: "Lead", startTime: 4, endTime: 8, isPartOfWord: false }],
			},
			background: [
				{
					startTime: 8,
					endTime: 10,
					syllables: [{ text: "Echo", startTime: 8, endTime: 10, isPartOfWord: false }],
				},
			],
		},
	],
});

const readySnapshot = (
	lyrics: LyricsDocument,
	options: { uri?: string; durationMs?: number; source?: "cache" | "network" } = {}
): ReadyTrackSessionSnapshot => {
	const currentTrack = track(options.uri ?? "spotify:track:a", options.durationMs);
	return {
		loadState: {
			status: "ready",
			track: currentTrack,
			lyrics,
			provider: "lrclib",
			source: options.source ?? "network",
			diagnostics: { cache: { status: "miss" }, attempts: [] },
		},
		lyrics,
		timingSource: "native",
	};
};

describe("OutroPresentationController", () => {
	test("ignores snapshots and playback updates before an epoch begins", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lineLyrics());

		expect(controller.accept(snapshot, DEFAULT_SETTINGS, 10)).toEqual({ kind: "none" });
		expect(controller.evaluate(10)).toEqual({ kind: "none" });
		expect(controller.currentKind()).toBe("inactive");
	});

	test("emits each forward crossing once and re-arms after a backward seek", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lineLyrics(8));

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 9.999)).toEqual({ kind: "show-lyrics", snapshot });
		expect(controller.currentKind()).toBe("lyrics");
		expect(controller.evaluate(10)).toEqual({ kind: "show-metadata", snapshot });
		expect(controller.currentKind()).toBe("metadata");
		expect(controller.evaluate(11)).toEqual({ kind: "none" });

		expect(controller.evaluate(9)).toEqual({ kind: "show-lyrics", snapshot });
		expect(controller.evaluate(9.5)).toEqual({ kind: "none" });
		expect(controller.evaluate(10)).toEqual({ kind: "show-metadata", snapshot });
	});

	test("shows only metadata when the first snapshot arrives at the threshold", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lineLyrics(8));

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 10)).toEqual({ kind: "show-metadata", snapshot });
		expect(controller.currentKind()).toBe("metadata");
		expect(controller.evaluate(10)).toEqual({ kind: "none" });
	});

	test.each([
		{ name: "static lyrics", lyrics: staticLyrics, durationMs: 12_000 },
		{ name: "interlude-only lyrics", lyrics: interludeOnlyLyrics, durationMs: 12_000 },
		{ name: "a threshold beyond duration", lyrics: lineLyrics(8), durationMs: 9_999 },
	])("keeps showing lyrics forever for $name", ({ lyrics, durationMs }) => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lyrics, { durationMs });

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 100)).toEqual({ kind: "show-lyrics", snapshot });
		expect(controller.evaluate(1_000)).toEqual({ kind: "none" });
		expect(controller.currentKind()).toBe("lyrics");
	});

	test("includes an outro threshold exactly equal to the track duration", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lineLyrics(8), { durationMs: 10_000 });

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 10)).toEqual({ kind: "show-metadata", snapshot });
	});

	test("recalculates the threshold when a refreshed snapshot moves the final vocal", () => {
		const controller = new OutroPresentationController();
		const initialSnapshot = readySnapshot(lineLyrics(8), { durationMs: 15_000 });
		const laterSnapshot = readySnapshot(lineLyrics(12), { durationMs: 15_000, source: "cache" });
		const earlierSnapshot = readySnapshot(lineLyrics(8), { durationMs: 15_000, source: "cache" });

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(initialSnapshot, settings(), 11)).toEqual({ kind: "show-metadata", snapshot: initialSnapshot });
		expect(controller.accept(laterSnapshot, settings(), 11)).toEqual({ kind: "show-lyrics", snapshot: laterSnapshot });
		expect(controller.accept(earlierSnapshot, settings(), 11)).toEqual({ kind: "show-metadata", snapshot: earlierSnapshot });
	});

	test("recalculates the threshold when the sync preference changes", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(syllableLyricsWithLateBackground());

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings({ syncPreference: "prefer-syllable" }), 11)).toEqual({ kind: "show-lyrics", snapshot });
		expect(controller.accept(snapshot, settings({ syncPreference: "line-only" }), 11)).toEqual({ kind: "show-metadata", snapshot });
		expect(controller.accept(snapshot, settings({ syncPreference: "prefer-syllable" }), 11)).toEqual({ kind: "show-lyrics", snapshot });
	});

	test("keeps the latest accepted snapshot for later threshold crossings", () => {
		const controller = new OutroPresentationController();
		const initialSnapshot = readySnapshot(lineLyrics(7));
		const latestSnapshot = readySnapshot(lineLyrics(8), { source: "cache" });

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(initialSnapshot, settings(), 0)).toEqual({ kind: "show-lyrics", snapshot: initialSnapshot });
		expect(controller.accept(latestSnapshot, settings(), 0)).toEqual({ kind: "show-lyrics", snapshot: latestSnapshot });
		expect(controller.evaluate(0)).toEqual({ kind: "none" });
		expect(controller.evaluate(10)).toEqual({ kind: "show-metadata", snapshot: latestSnapshot });
	});

	test("starts a completely fresh epoch even when the URI is unchanged", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lineLyrics(8));

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 10).kind).toBe("show-metadata");

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.currentKind()).toBe("inactive");
		expect(controller.evaluate(10)).toEqual({ kind: "none" });
		expect(controller.accept(snapshot, settings(), 0)).toEqual({ kind: "show-lyrics", snapshot });
	});

	test("ignores a snapshot for another URI without replacing the active session", () => {
		const controller = new OutroPresentationController();
		const activeSnapshot = readySnapshot(lineLyrics(8));
		const wrongSnapshot = readySnapshot(lineLyrics(20), { uri: "spotify:track:b", durationMs: 30_000 });

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(activeSnapshot, settings(), 0).kind).toBe("show-lyrics");
		expect(controller.accept(wrongSnapshot, settings(), 10)).toEqual({ kind: "none" });
		expect(controller.evaluate(10)).toEqual({ kind: "show-metadata", snapshot: activeSnapshot });
	});

	test("discardSession clears presentation while preserving the active epoch URI", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lineLyrics(8));

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 0).kind).toBe("show-lyrics");
		controller.discardSession();

		expect(controller.currentKind()).toBe("inactive");
		expect(controller.evaluate(10)).toEqual({ kind: "none" });
		expect(controller.accept(snapshot, settings(), 10)).toEqual({ kind: "show-metadata", snapshot });
	});

	test("endTrackEpoch rejects updates until another epoch begins", () => {
		const controller = new OutroPresentationController();
		const snapshot = readySnapshot(lineLyrics(8));

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 0).kind).toBe("show-lyrics");
		controller.endTrackEpoch();

		expect(controller.currentKind()).toBe("inactive");
		expect(controller.accept(snapshot, settings(), 10)).toEqual({ kind: "none" });
		expect(controller.evaluate(10)).toEqual({ kind: "none" });

		controller.beginTrackEpoch("spotify:track:a");
		expect(controller.accept(snapshot, settings(), 10)).toEqual({ kind: "show-metadata", snapshot });
	});
});
