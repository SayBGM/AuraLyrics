import { describe, expect, test } from "vitest";
import { IntroPresentationGate } from "../../src/app/IntroPresentationGate";
import type { ReadyTrackSessionSnapshot } from "../../src/app/TrackSessionController";
import type { LyricsDocument, TrackIdentity } from "../../src/lyrics/types";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../src/settings/settingsSchema";

const track: TrackIdentity = {
	uri: "spotify:track:intro-gate",
	title: "Long Introduction",
	artist: "Aura",
	album: "Epoch",
	durationMs: 180_000,
	isLocal: false,
};

const settings = (overrides: Partial<ExtensionSettings> = {}): ExtensionSettings => ({
	...DEFAULT_SETTINGS,
	...overrides,
});

const lineLyricsAt = (firstVocalStartSec: number): LyricsDocument => ({
	type: "line",
	startTime: 0,
	endTime: firstVocalStartSec + 4,
	content: [
		{ type: "interlude", startTime: 0, endTime: firstVocalStartSec, generated: true },
		{
			type: "vocal",
			startTime: firstVocalStartSec,
			endTime: firstVocalStartSec + 4,
			text: "First vocal",
			oppositeAligned: false,
		},
	],
});

const syllableLyricsWithBackground = (leadStartSec: number, backgroundStartSec: number): LyricsDocument => ({
	type: "syllable",
	startTime: 0,
	endTime: leadStartSec + 4,
	content: [
		{
			type: "vocal",
			oppositeAligned: false,
			lead: {
				startTime: leadStartSec,
				endTime: leadStartSec + 2,
				syllables: [{ text: "Lead", startTime: leadStartSec, endTime: leadStartSec + 2, isPartOfWord: false }],
			},
			background: [
				{
					startTime: backgroundStartSec,
					endTime: backgroundStartSec + 2,
					syllables: [{ text: "Echo", startTime: backgroundStartSec, endTime: backgroundStartSec + 2, isPartOfWord: false }],
				},
			],
		},
	],
});

const readySnapshot = (lyrics: LyricsDocument, source: "cache" | "network" = "network"): ReadyTrackSessionSnapshot => ({
	loadState: {
		status: "ready",
		track,
		lyrics,
		provider: "lrclib",
		source,
		diagnostics: { cache: { status: "miss" }, attempts: [] },
	},
	lyrics,
	timingSource: "native",
});

describe("IntroPresentationGate hold/reveal lifecycle", () => {
	test("holds a long intro and reveals a fast vocal immediately", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));
		const snapshotAt2 = readySnapshot(lineLyricsAt(2));

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt10, settings(), 0)).toEqual({
			kind: "hold",
			snapshot: snapshotAt10,
			firstVocalStartSec: 10,
		});
		expect(gate.isHolding()).toBe(true);

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt2, settings(), 0)).toEqual({ kind: "reveal", snapshot: snapshotAt2 });
		expect(gate.isHolding()).toBe(false);
	});

	test("does not apply the two-second threshold to ordinary ticks and reveals exactly once at the first vocal", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");
		expect(gate.tick(8.5)).toEqual({ kind: "none" });
		expect(gate.tick(10)).toEqual({ kind: "reveal", snapshot: snapshotAt10 });
		expect(gate.tick(10)).toEqual({ kind: "none" });
	});

	test("applies the two-second threshold when playback resumes", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");
		expect(gate.resume(7.9)).toEqual({ kind: "none" });
		expect(gate.resume(8)).toEqual({ kind: "reveal", snapshot: snapshotAt10 });
	});

	test("never returns to hold after reveal, including for an earlier timestamp or refreshed snapshot", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));
		const refreshedSnapshotAt10 = readySnapshot(lineLyricsAt(10), "cache");

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt10, settings(), 8)).toEqual({ kind: "reveal", snapshot: snapshotAt10 });
		expect(gate.tick(0)).toEqual({ kind: "none" });
		expect(gate.accept(refreshedSnapshotAt10, settings(), 0)).toEqual({ kind: "reveal", snapshot: refreshedSnapshotAt10 });
	});
});

describe("IntroPresentationGate pending replacement", () => {
	test("reveals the latest snapshot when its first vocal moves into the past", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));
		const latestSnapshotAt4 = readySnapshot(lineLyricsAt(4), "cache");

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");
		expect(gate.accept(latestSnapshotAt4, settings(), 5)).toEqual({ kind: "reveal", snapshot: latestSnapshotAt4 });
	});

	test("reveals the latest snapshot when its first vocal moves within two seconds", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));
		const latestSnapshotAt9 = readySnapshot(lineLyricsAt(9), "cache");

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");
		expect(gate.accept(latestSnapshotAt9, settings(), 7)).toEqual({ kind: "reveal", snapshot: latestSnapshotAt9 });
	});

	test("extends the hold and preserves the latest snapshot when the first vocal moves later", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));
		const latestSnapshotAt15 = readySnapshot(lineLyricsAt(15), "cache");

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");
		expect(gate.accept(latestSnapshotAt15, settings(), 5)).toEqual({
			kind: "hold",
			snapshot: latestSnapshotAt15,
			firstVocalStartSec: 15,
		});
		expect(gate.tick(10)).toEqual({ kind: "none" });
		expect(gate.tick(15)).toEqual({ kind: "reveal", snapshot: latestSnapshotAt15 });
	});

	test("recalculates an earlier background vocal when sync preference changes", () => {
		const gate = new IntroPresentationGate();
		const initialSnapshot = readySnapshot(syllableLyricsWithBackground(10, 4));
		const latestSnapshot = readySnapshot(syllableLyricsWithBackground(10, 4), "cache");

		gate.beginTrackEpoch();
		expect(gate.accept(initialSnapshot, settings({ syncPreference: "line-only" }), 0)).toEqual({
			kind: "hold",
			snapshot: initialSnapshot,
			firstVocalStartSec: 10,
		});
		expect(gate.accept(latestSnapshot, settings({ syncPreference: "prefer-syllable" }), 3)).toEqual({
			kind: "reveal",
			snapshot: latestSnapshot,
		});
	});
});

describe("IntroPresentationGate session and epoch lifecycle", () => {
	test("discards only the pending session before reveal and keeps the playback epoch active", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));

		gate.beginTrackEpoch();
		expect(gate.hasActiveEpoch()).toBe(true);
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");

		gate.discardPendingSession();

		expect(gate.hasActiveEpoch()).toBe(true);
		expect(gate.isHolding()).toBe(false);
		expect(gate.tick(10)).toEqual({ kind: "none" });
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");
	});

	test("preserves the revealed latch when the pending session is discarded", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt2 = readySnapshot(lineLyricsAt(2));
		const refreshedSnapshotAt10 = readySnapshot(lineLyricsAt(10), "cache");

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt2, settings(), 0).kind).toBe("reveal");

		gate.discardPendingSession();

		expect(gate.hasActiveEpoch()).toBe(true);
		expect(gate.accept(refreshedSnapshotAt10, settings(), 0)).toEqual({ kind: "reveal", snapshot: refreshedSnapshotAt10 });
	});

	test("creates a fresh latch after an epoch ends and a new epoch begins", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt2 = readySnapshot(lineLyricsAt(2));
		const snapshotAt10 = readySnapshot(lineLyricsAt(10));

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt2, settings(), 0).kind).toBe("reveal");

		gate.endTrackEpoch();
		expect(gate.hasActiveEpoch()).toBe(false);
		expect(gate.isHolding()).toBe(false);

		gate.beginTrackEpoch();
		expect(gate.hasActiveEpoch()).toBe(true);
		expect(gate.accept(snapshotAt10, settings(), 0).kind).toBe("hold");
	});

	test("resets a revealed epoch when playback transitions to no track", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt2 = readySnapshot(lineLyricsAt(2));

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt2, settings(), 0).kind).toBe("reveal");

		gate.endTrackEpoch();

		expect(gate.hasActiveEpoch()).toBe(false);
		expect(gate.tick(2)).toEqual({ kind: "none" });
	});

	test("starts a fresh epoch for a repeat playback event with the same URI", () => {
		const gate = new IntroPresentationGate();
		const snapshotAt2 = readySnapshot(lineLyricsAt(2));
		const repeatedSnapshotAt10 = readySnapshot(lineLyricsAt(10), "cache");

		gate.beginTrackEpoch();
		expect(gate.accept(snapshotAt2, settings(), 0).kind).toBe("reveal");

		gate.beginTrackEpoch();

		expect(gate.accept(repeatedSnapshotAt10, settings(), 0)).toEqual({
			kind: "hold",
			snapshot: repeatedSnapshotAt10,
			firstVocalStartSec: 10,
		});
	});
});
