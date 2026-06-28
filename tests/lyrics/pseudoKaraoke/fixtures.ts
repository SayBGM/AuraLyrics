import type { AudioAnalysisData, AudioAnalysisSegment } from "../../../src/renderer/AudioAnalysisWaveformService";

const vocalPitches = (peak: number): number[] => {
	const pitches = new Array(12).fill(0.08);
	pitches[peak % 12] = 0.92;
	return pitches;
};

const vocalTimbre = (offset: number): number[] => [0.4 + offset * 0.01, -0.2, 0.1, 0.05, -0.05, 0.02, 0, 0, 0, 0, 0, 0];

// Build a stretch of "vocal-like" segments covering [startSec, endSec].
export const buildVocalAnalysis = (startSec: number, endSec: number, segDurationSec = 0.2): AudioAnalysisData => {
	const segments: AudioAnalysisSegment[] = [];
	const beats: { start: number; confidence: number }[] = [];
	let index = 0;
	for (let time = startSec; time < endSec - 1e-6; time += segDurationSec) {
		segments.push({
			start: time,
			duration: segDurationSec,
			confidence: 0.8,
			loudness_start: -22,
			loudness_max: -8,
			loudness_max_time: segDurationSec * 0.22,
			pitches: vocalPitches(index),
			timbre: vocalTimbre(index),
		});
		beats.push({ start: time, confidence: 0.7 });
		index += 1;
	}
	return {
		track: { tempo: 120, tempo_confidence: 0.8 },
		sections: [{ start: 0, duration: endSec + 5, confidence: 0.8 }],
		beats,
		segments,
	};
};
