import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AudioAnalysisData } from "../../src/audio/types";
import type { TrackIdentity } from "../../src/lyrics/types";
import { AudioAnalysisWaveformService } from "../../src/renderer/AudioAnalysisWaveformService";

const track: TrackIdentity = {
	uri: "spotify:track:test",
	title: "Wave",
	artist: "Artist",
	album: "Album",
	durationMs: 120000,
	isLocal: false,
};

const usableAnalysis = (start = 0): AudioAnalysisData => ({
	segments: [{ start, duration: 1, loudness_max: -12 }],
});

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

describe("AudioAnalysisWaveformService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("extracts a rhythm profile from track tempo", async () => {
		const service = new AudioAnalysisWaveformService(
			vi.fn(async () => ({
				track: { tempo: 150, tempo_confidence: 0.88 },
				segments: [{ start: 0, duration: 1, loudness_max: -12 }],
			}))
		);

		const profile = await service.loadProfile(track);

		expect(profile.tempo).toBe(150);
		expect(profile.beatDurationSec).toBe(0.4);
		expect(profile.tempoConfidence).toBe(0.88);
		expect(profile.tempoSource).toBe("track");
	});

	test("derives rhythm from beat starts when track tempo is unavailable", async () => {
		const service = new AudioAnalysisWaveformService(
			vi.fn(async () => ({
				beats: [
					{ start: 0, duration: 0.48 },
					{ start: 0.5, duration: 0.48 },
					{ start: 1, duration: 0.48 },
					{ start: 1.5, duration: 0.48 },
				],
			}))
		);

		const profileResult = service.loadProfile(track);
		await vi.advanceTimersByTimeAsync(1600);
		const profile = await profileResult;

		expect(profile.source).toBe("seeded");
		expect(profile.tempo).toBe(120);
		expect(profile.beatDurationSec).toBe(0.5);
		expect(profile.tempoSource).toBe("beats");
	});

	test("builds interlude waveform bars from overlapping audio analysis segments", async () => {
		const service = new AudioAnalysisWaveformService(
			vi.fn(async () => ({
				segments: [
					{ start: 8, duration: 1, loudness_max: -42 },
					{ start: 10, duration: 1, loudness_max: -34 },
					{ start: 11, duration: 1, loudness_max: -18 },
					{ start: 12, duration: 1, loudness_max: -8 },
					{ start: 13, duration: 1, loudness_max: -3 },
					{ start: 18, duration: 1, loudness_max: -3 },
				],
			}))
		);

		const profile = await service.loadProfile(track);
		const waveform = service.waveformForInterlude(profile, { startTime: 10, endTime: 14, type: "interlude" }, 4);

		expect(waveform.source).toBe("audio-analysis");
		expect(waveform.bars).toHaveLength(4);
		expect(waveform.bars[0]).toBeLessThan(waveform.bars.at(-1) ?? 0);
		expect(waveform.bars.every((bar) => bar >= 0.14 && bar <= 1)).toBe(true);
	});

	test("falls back to deterministic seeded bars when audio analysis is unavailable", async () => {
		const service = new AudioAnalysisWaveformService(vi.fn(async () => undefined));

		const profileResult = service.loadProfile(track);
		await vi.advanceTimersByTimeAsync(1600);
		const profile = await profileResult;
		const first = service.waveformForInterlude(profile, { startTime: 10, endTime: 20, type: "interlude" }, 8);
		const second = service.waveformForInterlude(profile, { startTime: 10, endTime: 20, type: "interlude" }, 8);

		expect(first.source).toBe("seeded");
		expect(first.bars).toEqual(second.bars);
		expect(first.bars).toHaveLength(8);
	});

	test("normalizes bars within the interlude window so quiet local changes remain visible", async () => {
		const service = new AudioAnalysisWaveformService(
			vi.fn(async () => ({
				segments: [
					{ start: 10, duration: 1, loudness_max: -11.2 },
					{ start: 11, duration: 1, loudness_max: -10.9 },
					{ start: 12, duration: 1, loudness_max: -10.4 },
					{ start: 13, duration: 1, loudness_max: -9.8 },
				],
			}))
		);

		const profile = await service.loadProfile(track);
		const waveform = service.waveformForInterlude(profile, { startTime: 10, endTime: 14, type: "interlude" }, 4);

		expect(waveform.source).toBe("audio-analysis");
		expect(Math.max(...waveform.bars) - Math.min(...waveform.bars)).toBeGreaterThan(0.6);
	});

	test("retries undefined analysis with bounded delays and positively caches usable analysis", async () => {
		const analysis = usableAnalysis();
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(analysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const result = service.getAnalysis(track);
		expect(getAudioData).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(399);
		expect(getAudioData).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(getAudioData).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1199);
		expect(getAudioData).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);
		await expect(result).resolves.toBe(analysis);
		expect(getAudioData).toHaveBeenCalledTimes(3);

		await expect(service.getAnalysis(track)).resolves.toBe(analysis);
		expect(getAudioData).toHaveBeenCalledTimes(3);
	});

	test("retries analysis with empty segments and later accepts usable segments", async () => {
		const analysis = usableAnalysis();
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockResolvedValueOnce({ segments: [] })
			.mockResolvedValueOnce(analysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const result = service.getAnalysis(track);
		await vi.advanceTimersByTimeAsync(400);

		await expect(result).resolves.toBe(analysis);
		expect(getAudioData).toHaveBeenCalledTimes(2);
	});

	test("retries exceptions while concurrent consumers share one acquisition cycle", async () => {
		const analysis = usableAnalysis();
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockRejectedValueOnce(new Error("transient"))
			.mockResolvedValueOnce(analysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const first = service.getAnalysis(track);
		const second = service.getAnalysis(track);
		expect(getAudioData).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(400);
		await expect(Promise.all([first, second])).resolves.toEqual([analysis, analysis]);
		expect(getAudioData).toHaveBeenCalledTimes(2);
	});

	test("uses a five-second negative cache after three failed attempts before starting a new cycle", async () => {
		const analysis = usableAnalysis();
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(analysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const exhausted = service.getAnalysis(track);
		await vi.advanceTimersByTimeAsync(1600);
		await expect(exhausted).resolves.toBeUndefined();
		expect(getAudioData).toHaveBeenCalledTimes(3);

		await expect(service.getAnalysis(track)).resolves.toBeUndefined();
		expect(getAudioData).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(4999);
		await expect(service.getAnalysis(track)).resolves.toBeUndefined();
		expect(getAudioData).toHaveBeenCalledTimes(3);

		await vi.advanceTimersByTimeAsync(1);
		await expect(service.getAnalysis(track)).resolves.toBe(analysis);
		expect(getAudioData).toHaveBeenCalledTimes(4);
	});

	test("returns the latest partial analysis after exhaustion so profiles can retain rhythm", async () => {
		const latestPartial: AudioAnalysisData = {
			track: { tempo: 128, tempo_confidence: 0.72 },
			segments: [],
		};
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockResolvedValueOnce({ beats: [{ start: 0 }, { start: 0.5 }] })
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(latestPartial);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const analysisResult = service.getAnalysis(track);
		await vi.advanceTimersByTimeAsync(1600);
		await expect(analysisResult).resolves.toBe(latestPartial);

		const profile = await service.loadProfile(track);
		expect(profile.source).toBe("seeded");
		expect(profile.tempo).toBe(128);
		expect(profile.tempoSource).toBe("track");
		expect(getAudioData).toHaveBeenCalledTimes(3);
	});

	test("invalidates a positive cache and starts a fresh underlying request", async () => {
		const cachedAnalysis = usableAnalysis(1);
		const freshAnalysis = usableAnalysis(6);
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockResolvedValueOnce(cachedAnalysis)
			.mockResolvedValueOnce(freshAnalysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		await expect(service.getAnalysis(track)).resolves.toBe(cachedAnalysis);
		await expect(service.getAnalysis(track)).resolves.toBe(cachedAnalysis);
		expect(getAudioData).toHaveBeenCalledTimes(1);

		service.invalidateAnalysis(track.uri);

		await expect(service.getAnalysis(track)).resolves.toBe(freshAnalysis);
		expect(getAudioData).toHaveBeenCalledTimes(2);
	});

	test("invalidates an unexpired negative cache and immediately starts a fresh acquisition cycle", async () => {
		const freshAnalysis = usableAnalysis(9);
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(freshAnalysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const exhausted = service.getAnalysis(track);
		await vi.advanceTimersByTimeAsync(1600);
		await expect(exhausted).resolves.toBeUndefined();
		await expect(service.getAnalysis(track)).resolves.toBeUndefined();
		expect(getAudioData).toHaveBeenCalledTimes(3);

		service.invalidateAnalysis(track.uri);

		await expect(service.getAnalysis(track)).resolves.toBe(freshAnalysis);
		expect(getAudioData).toHaveBeenCalledTimes(4);
	});

	test("starts a fresh request when analysis is invalidated during an unresolved cycle", async () => {
		const oldRequest = deferred<AudioAnalysisData | undefined>();
		const oldAnalysis = usableAnalysis(2);
		const freshAnalysis = usableAnalysis(4);
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockImplementationOnce(() => oldRequest.promise)
			.mockResolvedValueOnce(freshAnalysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const oldResult = service.getAnalysis(track);
		service.invalidateAnalysis(track.uri);
		const freshResult = service.getAnalysis(track);

		expect(getAudioData).toHaveBeenCalledTimes(2);
		await expect(freshResult).resolves.toBe(freshAnalysis);
		oldRequest.resolve(oldAnalysis);
		await expect(oldResult).resolves.toBe(oldAnalysis);
	});

	test("does not let an invalidated cycle overwrite a newer positive cache", async () => {
		const oldRequest = deferred<AudioAnalysisData | undefined>();
		const oldAnalysis = usableAnalysis(1);
		const freshAnalysis = usableAnalysis(8);
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockImplementationOnce(() => oldRequest.promise)
			.mockResolvedValueOnce(freshAnalysis);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const oldResult = service.getAnalysis(track);
		service.invalidateAnalysis(track.uri);
		await expect(service.getAnalysis(track)).resolves.toBe(freshAnalysis);

		oldRequest.resolve(oldAnalysis);
		await expect(oldResult).resolves.toBe(oldAnalysis);
		await expect(service.getAnalysis(track)).resolves.toBe(freshAnalysis);
		expect(getAudioData).toHaveBeenCalledTimes(2);
	});

	test("does not let an invalidated cycle delete the newer in-flight entry", async () => {
		const oldRequest = deferred<AudioAnalysisData | undefined>();
		const freshRequest = deferred<AudioAnalysisData | undefined>();
		const freshAnalysis = usableAnalysis(12);
		const getAudioData = vi
			.fn<() => Promise<AudioAnalysisData | undefined>>()
			.mockImplementationOnce(() => oldRequest.promise)
			.mockImplementationOnce(() => freshRequest.promise);
		const service = new AudioAnalysisWaveformService(getAudioData);

		const oldResult = service.getAnalysis(track);
		service.invalidateAnalysis(track.uri);
		const freshResult = service.getAnalysis(track);

		oldRequest.resolve(usableAnalysis(2));
		await oldResult;
		const concurrentFreshResult = service.getAnalysis(track);
		expect(getAudioData).toHaveBeenCalledTimes(2);

		freshRequest.resolve(freshAnalysis);
		await expect(Promise.all([freshResult, concurrentFreshResult])).resolves.toEqual([freshAnalysis, freshAnalysis]);
	});
});
