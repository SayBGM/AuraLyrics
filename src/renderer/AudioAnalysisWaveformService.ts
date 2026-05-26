import type { Interlude, TrackIdentity } from "../lyrics/types";

export type AudioAnalysisSegment = {
	start: number;
	duration: number;
	loudness_max?: number;
	loudness_start?: number;
	confidence?: number;
};

export type AudioAnalysisBeat = {
	start: number;
	duration?: number;
	confidence?: number;
};

export type AudioAnalysisSection = {
	start?: number;
	duration?: number;
	tempo?: number;
	tempo_confidence?: number;
	confidence?: number;
};

export type AudioAnalysisTrack = {
	tempo?: number;
	tempo_confidence?: number;
};

export type AudioAnalysisData = {
	track?: AudioAnalysisTrack;
	sections?: AudioAnalysisSection[];
	beats?: AudioAnalysisBeat[];
	segments?: AudioAnalysisSegment[];
};

export type RhythmProfile = {
	tempo?: number;
	beatDurationSec?: number;
	tempoConfidence?: number;
	tempoSource?: "track" | "section" | "beats";
};

export type InterludeWaveform = {
	bars: number[];
	source: "audio-analysis" | "seeded";
};

export type TrackWaveformProfile = {
	trackUri: string;
	seed: number;
	segments: AudioAnalysisSegment[];
	source: "audio-analysis" | "seeded";
} & RhythmProfile;

type GetAudioData = (uri?: string) => Promise<AudioAnalysisData | undefined>;

const MIN_BAR_HEIGHT = 0.14;
const DEFAULT_BAR_COUNT = 18;

export class AudioAnalysisWaveformService {
	public constructor(private readonly getAudioData?: GetAudioData) {}

	public async loadProfile(track: TrackIdentity): Promise<TrackWaveformProfile> {
		try {
			const data = await this.getAudioData?.(track.uri);
			const rhythm = rhythmProfileFromAnalysis(data);
			const segments = (data?.segments ?? []).filter(isUsableSegment);
			if (segments.length > 0) {
				return {
					trackUri: track.uri,
					seed: hashString(track.uri),
					segments,
					source: "audio-analysis",
					...rhythm,
				};
			}
			return {
				trackUri: track.uri,
				seed: hashString(`${track.uri}:${track.title}:${track.artist}`),
				segments: [],
				source: "seeded",
				...rhythm,
			};
		} catch {
			// Audio analysis is best-effort. The seeded fallback keeps the UI stable.
		}
		return {
			trackUri: track.uri,
			seed: hashString(`${track.uri}:${track.title}:${track.artist}`),
			segments: [],
			source: "seeded",
		};
	}

	public waveformForInterlude(profile: TrackWaveformProfile, interlude: Interlude, barCount = DEFAULT_BAR_COUNT): InterludeWaveform {
		const count = Math.max(4, Math.round(barCount));
		if (profile.source === "audio-analysis") {
			const bars = this.analysisBars(profile.segments, interlude, count);
			if (bars) {
				return { bars, source: "audio-analysis" };
			}
		}
		return { bars: seededBars(profile.seed, interlude.startTime, count), source: "seeded" };
	}

	private analysisBars(segments: AudioAnalysisSegment[], interlude: Interlude, barCount: number): number[] | undefined {
		const duration = Math.max(0.001, interlude.endTime - interlude.startTime);
		const values = Array.from({ length: barCount }, (_, index) => {
			const bucketStart = interlude.startTime + (duration * index) / barCount;
			const bucketEnd = interlude.startTime + (duration * (index + 1)) / barCount;
			const overlapping = segments.filter((segment) => overlaps(segment, bucketStart, bucketEnd));
			if (overlapping.length === 0) {
				return undefined;
			}
			const weighted = overlapping.reduce(
				(acc, segment) => {
					const overlap = overlapDuration(segment, bucketStart, bucketEnd);
					acc.sum += segmentLoudness(segment) * overlap;
					acc.weight += overlap;
					return acc;
				},
				{ sum: 0, weight: 0 }
			);
			return weighted.weight > 0 ? weighted.sum / weighted.weight : undefined;
		});
		const fallbackValues = segments
			.filter((segment) => overlaps(segment, interlude.startTime, interlude.endTime))
			.map((segment) => segmentLoudness(segment));
		if (fallbackValues.length === 0) {
			return undefined;
		}
		const filledValues = values.map((value, index) => value ?? fallbackValues[index % fallbackValues.length] ?? -36);
		return normalizeInterludeWindow(filledValues);
	}
}

const MIN_TEMPO = 40;
const MAX_TEMPO = 240;

const rhythmProfileFromAnalysis = (data: AudioAnalysisData | undefined): RhythmProfile => {
	const trackTempo = tempoProfile(data?.track?.tempo, data?.track?.tempo_confidence, "track");
	if (trackTempo) {
		return trackTempo;
	}
	const sectionTempo = bestSectionTempo(data?.sections);
	if (sectionTempo) {
		return sectionTempo;
	}
	return tempoFromBeats(data?.beats) ?? {};
};

const tempoProfile = (tempo: number | undefined, confidence: number | undefined, source: RhythmProfile["tempoSource"]): RhythmProfile | undefined => {
	if (!tempo || !Number.isFinite(tempo) || tempo < MIN_TEMPO || tempo > MAX_TEMPO) {
		return undefined;
	}
	return {
		tempo,
		beatDurationSec: Number((60 / tempo).toFixed(4)),
		tempoConfidence: confidence,
		tempoSource: source,
	};
};

const bestSectionTempo = (sections: AudioAnalysisSection[] | undefined): RhythmProfile | undefined => {
	const section = (sections ?? [])
		.filter((item) => item.tempo !== undefined)
		.sort((a, b) => (b.tempo_confidence ?? b.confidence ?? 0) - (a.tempo_confidence ?? a.confidence ?? 0))[0];
	return section ? tempoProfile(section.tempo, section.tempo_confidence ?? section.confidence, "section") : undefined;
};

const tempoFromBeats = (beats: AudioAnalysisBeat[] | undefined): RhythmProfile | undefined => {
	const starts = (beats ?? [])
		.map((beat) => beat.start)
		.filter((start) => Number.isFinite(start))
		.sort((a, b) => a - b);
	if (starts.length < 2) {
		return undefined;
	}
	const intervals = starts
		.slice(1)
		.map((start, index) => start - starts[index])
		.filter((duration) => duration > 0.2 && duration < 2);
	if (intervals.length === 0) {
		return undefined;
	}
	const beatDurationSec = median(intervals);
	const tempo = Number((60 / beatDurationSec).toFixed(2));
	const profile = tempoProfile(tempo, undefined, "beats");
	return profile ? { ...profile, beatDurationSec: Number(beatDurationSec.toFixed(4)) } : undefined;
};

const isUsableSegment = (segment: AudioAnalysisSegment): boolean =>
	Number.isFinite(segment.start) && Number.isFinite(segment.duration) && segment.duration > 0;

const overlaps = (segment: AudioAnalysisSegment, start: number, end: number): boolean =>
	segment.start < end && segment.start + segment.duration > start;

const overlapDuration = (segment: AudioAnalysisSegment, start: number, end: number): number =>
	Math.max(0, Math.min(segment.start + segment.duration, end) - Math.max(segment.start, start));

const segmentLoudness = (segment: AudioAnalysisSegment): number => segment.loudness_max ?? segment.loudness_start ?? -36;

const normalizeInterludeWindow = (values: number[]): number[] => {
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min;
	if (range < 0.1) {
		return values.map((value) => clampBar((value + 48) / 48));
	}
	return values.map((value) => clampBar(MIN_BAR_HEIGHT + ((value - min) / range) * (1 - MIN_BAR_HEIGHT)));
};

const clampBar = (value: number): number => Math.min(1, Math.max(MIN_BAR_HEIGHT, value));

const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const hashString = (value: string): number => {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

const seededBars = (seed: number, startTime: number, count: number): number[] => {
	let state = (seed ^ Math.round(startTime * 1000)) >>> 0;
	return Array.from({ length: count }, (_, index) => {
		state = Math.imul(state ^ (index + 1), 1664525) + 1013904223;
		const wave = 0.5 + Math.sin(index * 1.38 + (seed % 17)) * 0.24;
		const noise = ((state >>> 8) & 0xff) / 255;
		return clampBar(wave * 0.62 + noise * 0.38);
	});
};
