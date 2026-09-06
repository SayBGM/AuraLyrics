// §5.7 — build and query the vocal mass curve.
import type { MassFrame, VocalCandidate, VocalMassCurve } from "./types";
import { clamp, clamp01 } from "./utils";

export const buildVocalMassCurve = (
	start: number,
	end: number,
	candidates: VocalCandidate[],
	anchors: number[],
	confidence: number
): VocalMassCurve => {
	const interval = Math.max(1, end - start);
	const stepMs = clamp(Math.round(interval / 88), 18, 36);
	const frameCount = Math.max(2, Math.ceil(interval / stepMs) + 1);
	const anchorSet = new Set(anchors.map((time) => Math.round(time)));
	const floor = candidates.length ? Math.max(0.008, 0.012 - confidence * 0.004) : 0.004;
	const frames: MassFrame[] = [];
	for (let index = 0; index < frameCount; index += 1) {
		const time = index === frameCount - 1 ? end : Math.min(end, Math.round(start + index * stepMs));
		let mass = floor;
		for (const candidate of candidates) {
			const dur = Math.max(1, candidate.durationMs || candidate.segmentEnd - candidate.segmentStart || stepMs);
			const peakR = clamp(dur * 0.6, 55, 220);
			const sustainR = clamp(dur * 1.1, 90, 320);
			const peak = clamp01(1 - Math.abs(time - candidate.time) / peakR);
			const sustain = clamp01(1 - Math.abs(time - (candidate.segmentStart + candidate.segmentEnd) / 2) / sustainR);
			const inSeg = time >= candidate.segmentStart && time <= candidate.segmentEnd ? 1 : 0;
			mass += candidate.score * (peak * 0.7 + sustain * 0.35 + inSeg * 0.18);
		}
		if (anchorSet.has(time) && confidence < 0.5) {
			mass += 0.03 + (0.5 - confidence) * 0.04;
		}
		frames.push({ time, mass: Math.max(floor, mass), cumulative: 0 });
	}
	let cumulative = 0;
	for (const frame of frames) {
		cumulative += frame.mass;
		frame.cumulative = cumulative;
	}
	return { frames, stepMs, totalMass: cumulative };
};

// Lower bound over `frames` on a key extracted from each frame: the smallest index whose
// key is >= target (frames.length when every key is smaller than target). `frames` is
// always time-sorted, so this works for both the `time` and `cumulative` keys below.
const lowerBoundIndex = (frames: MassFrame[], target: number, key: (frame: MassFrame) => number): number => {
	let lo = 0;
	let hi = frames.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (key(frames[mid]) < target) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
};

const frameTime = (frame: MassFrame): number => frame.time;
const frameCumulative = (frame: MassFrame): number => frame.cumulative;

export const getMassAtTime = (curve: VocalMassCurve, time: number): number => {
	const { frames } = curve;
	if (frames.length === 0) {
		return 0;
	}
	if (time <= frames[0].time) {
		return 0;
	}
	const last = frames[frames.length - 1];
	if (time >= last.time) {
		return last.cumulative;
	}
	// Original scan finds the first frame with `time <= next.time` starting at index 1,
	// i.e. the lower-bound index of `time` clamped to at least 1.
	const index = Math.max(1, lowerBoundIndex(frames, time, frameTime));
	const next = frames[index];
	const prev = frames[index - 1];
	const span = next.time - prev.time || 1;
	const progress = (time - prev.time) / span;
	return prev.cumulative + (next.cumulative - prev.cumulative) * progress;
};

export const getLocalMassAtTime = (curve: VocalMassCurve, time: number): number => {
	const { frames } = curve;
	if (frames.length === 0) {
		return 0;
	}
	// Original scan keeps the first frame achieving the minimum |frame.time - time|, i.e. on
	// an exact tie the earlier (smaller-index) one wins. When several frames share the exact
	// same time (only ever the last two, from the curve builder's end-of-range clamp), the
	// "winning" time value must resolve to its *first* occurrence, not whichever neighbor the
	// bisection happened to land on.
	const index = lowerBoundIndex(frames, time, frameTime);
	let winningTime: number;
	if (index === 0) {
		winningTime = frames[0].time;
	} else if (index >= frames.length) {
		winningTime = frames[frames.length - 1].time;
	} else {
		const beforeTime = frames[index - 1].time;
		const afterTime = frames[index].time;
		winningTime = Math.abs(beforeTime - time) <= Math.abs(afterTime - time) ? beforeTime : afterTime;
	}
	return frames[lowerBoundIndex(frames, winningTime, frameTime)].mass;
};

export const getTimeByMassTarget = (curve: VocalMassCurve, targetMass: number): number => {
	const { frames } = curve;
	if (frames.length === 0) {
		return 0;
	}
	if (targetMass <= 0) {
		return frames[0].time;
	}
	const last = frames[frames.length - 1];
	if (targetMass >= last.cumulative) {
		return last.time;
	}
	// Original scan finds the first frame with `targetMass <= next.cumulative` starting at
	// index 1, i.e. the lower-bound index of `targetMass` clamped to at least 1.
	const index = Math.max(1, lowerBoundIndex(frames, targetMass, frameCumulative));
	const next = frames[index];
	const prev = frames[index - 1];
	const span = next.cumulative - prev.cumulative || 1;
	const progress = (targetMass - prev.cumulative) / span;
	return prev.time + (next.time - prev.time) * progress;
};

export const getTimeByMassRatio = (curve: VocalMassCurve, ratio: number): number => getTimeByMassTarget(curve, curve.totalMass * clamp01(ratio));
