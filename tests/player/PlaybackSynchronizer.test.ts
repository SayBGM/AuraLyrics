import { describe, expect, test, vi } from "vitest";
import { PlaybackSynchronizer } from "../../src/player/PlaybackSynchronizer";

describe("PlaybackSynchronizer", () => {
	test("advances only while playback is active", () => {
		const playerTimestampSec = 10;
		const readPlayerTimestamp = vi.fn(() => playerTimestampSec);
		const synchronizer = new PlaybackSynchronizer(readPlayerTimestamp);
		synchronizer.resync();
		readPlayerTimestamp.mockClear();

		synchronizer.update(0.1, true);
		synchronizer.update(20, false);

		expect(synchronizer.timestampSec).toBeCloseTo(10.1);
		expect(readPlayerTimestamp).not.toHaveBeenCalled();
	});

	test("probes at exactly 0.25 seconds and snaps at exactly a 1.25 second difference", () => {
		let playerTimestampSec = 10;
		const readPlayerTimestamp = vi.fn(() => playerTimestampSec);
		const synchronizer = new PlaybackSynchronizer(readPlayerTimestamp);
		synchronizer.resync();
		playerTimestampSec = 11.5;
		readPlayerTimestamp.mockClear();

		synchronizer.update(0.25, true);

		expect(readPlayerTimestamp).toHaveBeenCalledOnce();
		expect(synchronizer.timestampSec).toBe(11.5);
	});

	test("keeps the estimate when a seek probe differs by less than 1.25 seconds", () => {
		let playerTimestampSec = 10;
		const readPlayerTimestamp = vi.fn(() => playerTimestampSec);
		const synchronizer = new PlaybackSynchronizer(readPlayerTimestamp);
		synchronizer.resync();
		playerTimestampSec = 11.499;

		synchronizer.update(0.25, true);

		expect(synchronizer.timestampSec).toBeCloseTo(10.25);
	});

	test("force-resyncs at exactly 20 seconds", () => {
		let playerTimestampSec = 10;
		const readPlayerTimestamp = vi.fn(() => playerTimestampSec);
		const synchronizer = new PlaybackSynchronizer(readPlayerTimestamp);
		synchronizer.resync();
		playerTimestampSec = 5;
		readPlayerTimestamp.mockClear();

		synchronizer.update(20, true);

		expect(readPlayerTimestamp).toHaveBeenCalledOnce();
		expect(synchronizer.timestampSec).toBe(5);
	});

	test("resync resets the seek probe timer", () => {
		let playerTimestampSec = 10;
		const readPlayerTimestamp = vi.fn(() => playerTimestampSec);
		const synchronizer = new PlaybackSynchronizer(readPlayerTimestamp);
		synchronizer.resync();
		synchronizer.update(0.24, true);
		playerTimestampSec = 7;
		synchronizer.resync();
		readPlayerTimestamp.mockClear();

		synchronizer.update(0.24, true);

		expect(readPlayerTimestamp).not.toHaveBeenCalled();
		expect(synchronizer.timestampSec).toBeCloseTo(7.24);
	});

	test("resync resets the periodic resync timer", () => {
		let playerTimestampSec = 0;
		const readPlayerTimestamp = vi.fn(() => playerTimestampSec);
		const synchronizer = new PlaybackSynchronizer(readPlayerTimestamp);
		synchronizer.resync();
		playerTimestampSec = 19.9;
		synchronizer.update(19.9, true);
		playerTimestampSec = 10;
		synchronizer.resync();
		playerTimestampSec = 11;
		readPlayerTimestamp.mockClear();

		synchronizer.update(0.1, true);

		expect(readPlayerTimestamp).not.toHaveBeenCalled();
		expect(synchronizer.timestampSec).toBeCloseTo(10.1);
	});

	test("a seek snap resets the periodic resync timer", () => {
		let playerTimestampSec = 0;
		const readPlayerTimestamp = vi.fn(() => playerTimestampSec);
		const synchronizer = new PlaybackSynchronizer(readPlayerTimestamp);
		synchronizer.resync();
		playerTimestampSec = 19;
		synchronizer.update(19, true);
		playerTimestampSec = 30.25;
		synchronizer.update(0.25, true);
		playerTimestampSec = 30.5;

		synchronizer.update(0.75, true);

		expect(synchronizer.timestampSec).toBe(31);
	});
});
