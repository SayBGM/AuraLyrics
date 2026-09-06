import { describe, expect, test, vi } from "vitest";
import type { TrackEpoch } from "../../src/app/TrackEpoch";
import type { ReadyTrackSessionSnapshot, TrackSessionSnapshot } from "../../src/app/TrackSessionController";
import { type TrackTransitionHost, TrackTransitionPresenter } from "../../src/app/TrackTransitionPresenter";
import type { LyricsDocument, TrackIdentity } from "../../src/lyrics/types";
import type { PipSession } from "../../src/pip/DocumentPipController";
import type { LyricsRenderer } from "../../src/renderer/LyricsRenderer";
import { DEFAULT_SETTINGS } from "../../src/settings/settingsSchema";

const track = (uri: string): TrackIdentity => ({
	uri,
	title: `Track ${uri}`,
	artist: "Aura",
	album: "Transitions",
	durationMs: 180_000,
	isLocal: false,
});

const lyrics: LyricsDocument = { type: "static", lines: [{ text: "Line" }] };

const readySnapshot = (identity: TrackIdentity): ReadyTrackSessionSnapshot => ({
	loadState: {
		status: "ready",
		track: identity,
		lyrics,
		provider: "lrclib",
		source: "network",
		diagnostics: { cache: { status: "miss" }, attempts: [] },
	},
	lyrics,
	timingSource: "native",
});

const loadingSnapshot = (identity: TrackIdentity): TrackSessionSnapshot => ({
	loadState: { status: "loading", track: identity },
	timingSource: "native",
});

type Settle = (result: { generation: number; completed: boolean }) => void;

const createHarness = (overrides: Partial<TrackTransitionHost> = {}) => {
	const session = { root: document.createElement("main") } as unknown as PipSession;
	const settles: Settle[] = [];
	let generation = 0;
	const showTrackMetadata = vi.fn(() => {
		generation += 1;
		const handleGeneration = generation;
		return {
			generation: handleGeneration,
			settled: new Promise<{ generation: number; completed: boolean }>((resolve) => {
				settles.push(resolve);
			}),
		};
	});
	const renderLoadStateNow = vi.fn();
	const presentReadySnapshotNow = vi.fn();
	const resyncPlayback = vi.fn();
	const host: TrackTransitionHost = {
		renderer: { showTrackMetadata } as unknown as LyricsRenderer,
		settings: DEFAULT_SETTINGS,
		isCurrentEpoch: () => true,
		isCurrentSnapshot: () => true,
		resyncPlayback,
		renderLoadStateNow,
		presentReadySnapshotNow,
		...overrides,
	};
	const presenter = new TrackTransitionPresenter(host);
	const epoch = (uri: string, id = 1): TrackEpoch => ({ id, uri, session, themeGeneration: 1 });
	/** Resolves the Nth started transition's animation. */
	const settle = async (index: number, result: { generation: number; completed: boolean }) => {
		settles[index]?.(result);
		await Promise.resolve();
		await Promise.resolve();
	};
	return { epoch, presenter, presentReadySnapshotNow, renderLoadStateNow, resyncPlayback, session, settle, showTrackMetadata };
};

describe("TrackTransitionPresenter", () => {
	test("does not defer without an active transition", () => {
		const { presenter } = createHarness();
		const identity = track("spotify:track:a");

		expect(presenter.defer({ kind: "ready", snapshot: readySnapshot(identity) })).toBe(false);
	});

	test("begins a directional metadata scene and defers presentations for the same track", () => {
		const { epoch, presenter, showTrackMetadata } = createHarness();
		const identity = track("spotify:track:a");

		presenter.begin(identity, epoch(identity.uri), "next");

		expect(showTrackMetadata).toHaveBeenCalledWith(expect.anything(), { mode: "loading", track: identity }, DEFAULT_SETTINGS, {
			direction: "next",
			animate: true,
		});
		expect(presenter.defer({ kind: "ready", snapshot: readySnapshot(identity) })).toBe(true);
	});

	test("does not defer a presentation for a different track than the transition", () => {
		const { epoch, presenter } = createHarness();
		const identity = track("spotify:track:a");
		presenter.begin(identity, epoch(identity.uri), "next");

		expect(presenter.defer({ kind: "ready", snapshot: readySnapshot(track("spotify:track:b")) })).toBe(false);
	});

	test("does not defer once the epoch is stale", () => {
		const { epoch, presenter } = createHarness({ isCurrentEpoch: () => false });
		const identity = track("spotify:track:a");
		presenter.begin(identity, epoch(identity.uri), "next");

		expect(presenter.defer({ kind: "ready", snapshot: readySnapshot(identity) })).toBe(false);
	});

	test("renders only the newest deferred presentation when the transition completes", async () => {
		const { epoch, presenter, presentReadySnapshotNow, renderLoadStateNow, resyncPlayback, settle } = createHarness();
		const identity = track("spotify:track:a");
		const latest = readySnapshot(identity);
		presenter.begin(identity, epoch(identity.uri), "next");
		presenter.defer({ kind: "load-state", snapshot: loadingSnapshot(identity) });
		presenter.defer({ kind: "ready", snapshot: latest });

		await settle(0, { generation: 1, completed: true });

		expect(resyncPlayback).toHaveBeenCalledOnce();
		expect(renderLoadStateNow).not.toHaveBeenCalled();
		expect(presentReadySnapshotNow).toHaveBeenCalledExactlyOnceWith(latest);
		// The transition is over: later presentations render straight away.
		expect(presenter.defer({ kind: "ready", snapshot: latest })).toBe(false);
	});

	test("drops the deferred presentation when the transition is interrupted", async () => {
		const { epoch, presenter, presentReadySnapshotNow, settle } = createHarness();
		const identity = track("spotify:track:a");
		presenter.begin(identity, epoch(identity.uri), "next");
		presenter.defer({ kind: "ready", snapshot: readySnapshot(identity) });

		await settle(0, { generation: 1, completed: false });

		expect(presentReadySnapshotNow).not.toHaveBeenCalled();
		expect(presenter.defer({ kind: "ready", snapshot: readySnapshot(identity) })).toBe(false);
	});

	test("ignores a settlement from a superseded transition", async () => {
		const { epoch, presenter, presentReadySnapshotNow, settle } = createHarness();
		const identity = track("spotify:track:a");
		presenter.begin(identity, epoch(identity.uri, 1), "next");
		presenter.begin(identity, epoch(identity.uri, 2), "previous");
		const latest = readySnapshot(identity);
		presenter.defer({ kind: "ready", snapshot: latest });

		await settle(0, { generation: 1, completed: true });
		expect(presentReadySnapshotNow).not.toHaveBeenCalled();

		await settle(1, { generation: 2, completed: true });
		expect(presentReadySnapshotNow).toHaveBeenCalledExactlyOnceWith(latest);
	});

	test("drops a settlement whose snapshot is no longer the track session's", async () => {
		const { epoch, presenter, presentReadySnapshotNow, settle } = createHarness({ isCurrentSnapshot: () => false });
		const identity = track("spotify:track:a");
		presenter.begin(identity, epoch(identity.uri), "next");
		presenter.defer({ kind: "ready", snapshot: readySnapshot(identity) });

		await settle(0, { generation: 1, completed: true });

		expect(presentReadySnapshotNow).not.toHaveBeenCalled();
	});

	test("replacePending swaps only the snapshot it was parked with", () => {
		const { epoch, presenter, presentReadySnapshotNow, settle } = createHarness();
		const identity = track("spotify:track:a");
		const initial = readySnapshot(identity);
		const enriched = readySnapshot(identity);
		presenter.begin(identity, epoch(identity.uri), "next");

		// Nothing parked yet: the replacement is ignored.
		presenter.replacePending(initial, enriched);
		presenter.defer({ kind: "ready", snapshot: initial });
		presenter.replacePending(readySnapshot(identity), enriched);
		presenter.replacePending(initial, enriched);

		return settle(0, { generation: 1, completed: true }).then(() => {
			expect(presentReadySnapshotNow).toHaveBeenCalledExactlyOnceWith(enriched);
		});
	});

	test("hasActiveTransitionFor matches only the same track epoch", () => {
		const { epoch, presenter } = createHarness();
		const identity = track("spotify:track:a");
		presenter.begin(identity, epoch(identity.uri, 3), "next");

		expect(presenter.hasActiveTransitionFor(epoch(identity.uri, 3))).toBe(true);
		expect(presenter.hasActiveTransitionFor(epoch(identity.uri, 4))).toBe(false);
		expect(presenter.hasActiveTransitionFor(epoch("spotify:track:b", 3))).toBe(false);

		presenter.discard();
		expect(presenter.hasActiveTransitionFor(epoch(identity.uri, 3))).toBe(false);
	});

	test("discard clears a parked presentation so a settlement cannot render it", async () => {
		const { epoch, presenter, presentReadySnapshotNow, settle } = createHarness();
		const identity = track("spotify:track:a");
		presenter.begin(identity, epoch(identity.uri), "next");
		presenter.defer({ kind: "ready", snapshot: readySnapshot(identity) });
		presenter.discard();

		await settle(0, { generation: 1, completed: true });

		expect(presentReadySnapshotNow).not.toHaveBeenCalled();
	});
});
