export type AudioAnalysisSegment = {
	start: number;
	duration: number;
	loudness_max?: number;
	loudness_max_time?: number;
	loudness_start?: number;
	confidence?: number;
	pitches?: number[];
	timbre?: number[];
};

export type AudioAnalysisTatum = {
	start: number;
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
	tatums?: AudioAnalysisTatum[];
	segments?: AudioAnalysisSegment[];
};
