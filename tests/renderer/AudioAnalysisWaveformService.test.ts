import { describe, expect, test, vi } from "vitest";
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

describe("AudioAnalysisWaveformService", () => {
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

		const profile = await service.loadProfile(track);
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
});
