// §5.8 — identify low-mass spans used as phrase boundary candidates.
import type { SilenceSpan, VocalMassCurve } from "./types";

export const buildSilenceSpans = (curve: VocalMassCurve, confidence: number): SilenceSpan[] => {
	const { frames, stepMs } = curve;
	if (frames.length === 0) {
		return [];
	}
	const avg = frames.reduce((sum, frame) => sum + frame.mass, 0) / frames.length;
	const threshold = avg * (confidence >= 0.52 ? 0.58 : 0.68);
	const minSpan = Math.max(stepMs * 2, 90);
	const spans: SilenceSpan[] = [];
	let runStart: number | undefined;
	let runMassSum = 0;
	let runCount = 0;
	const flush = (endTime: number) => {
		if (runStart === undefined) {
			return;
		}
		if (endTime - runStart >= minSpan) {
			spans.push({
				start: runStart,
				end: endTime,
				center: (runStart + endTime) / 2,
				avgMass: runCount > 0 ? runMassSum / runCount : 0,
			});
		}
		runStart = undefined;
		runMassSum = 0;
		runCount = 0;
	};
	for (const frame of frames) {
		if (frame.mass <= threshold) {
			if (runStart === undefined) {
				runStart = frame.time;
			}
			runMassSum += frame.mass;
			runCount += 1;
		} else {
			flush(frame.time);
		}
	}
	flush(frames[frames.length - 1].time);
	return spans;
};
