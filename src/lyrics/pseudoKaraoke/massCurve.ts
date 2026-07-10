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
	for (let index = 1; index < frames.length; index += 1) {
		const next = frames[index];
		if (time <= next.time) {
			const prev = frames[index - 1];
			const span = next.time - prev.time || 1;
			const progress = (time - prev.time) / span;
			return prev.cumulative + (next.cumulative - prev.cumulative) * progress;
		}
	}
	return last.cumulative;
};

export const getLocalMassAtTime = (curve: VocalMassCurve, time: number): number => {
	const { frames } = curve;
	if (frames.length === 0) {
		return 0;
	}
	let closest = frames[0];
	for (const frame of frames) {
		if (Math.abs(frame.time - time) < Math.abs(closest.time - time)) {
			closest = frame;
		}
	}
	return closest.mass;
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
	for (let index = 1; index < frames.length; index += 1) {
		const next = frames[index];
		if (targetMass <= next.cumulative) {
			const prev = frames[index - 1];
			const span = next.cumulative - prev.cumulative || 1;
			const progress = (targetMass - prev.cumulative) / span;
			return prev.time + (next.time - prev.time) * progress;
		}
	}
	return last.time;
};

export const getTimeByMassRatio = (curve: VocalMassCurve, ratio: number): number => getTimeByMassTarget(curve, curve.totalMass * clamp01(ratio));
