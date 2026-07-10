export type ProviderId = "spotify" | "musixmatch" | "lrclib";

export type TrackIdentity = {
	uri: string;
	id?: string;
	title: string;
	artist: string;
	album: string;
	durationMs: number;
	coverUrl?: string;
	isLocal: boolean;
};
