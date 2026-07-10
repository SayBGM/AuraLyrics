export type ProviderId = "spotify" | "musixmatch" | "lrclib";

export type TimeRange = {
	startTime: number;
	endTime: number;
};

export type TextMetadata = {
	text: string;
	romanizedText?: string;
	translatedText?: string;
};

export type Interlude = TimeRange & {
	type: "interlude";
	/** True when synthesized from a gap rather than supplied by a provider. */
	generated?: boolean;
};

export type StaticLyrics = {
	type: "static";
	lines: TextMetadata[];
};

export type LineVocal = TimeRange &
	TextMetadata & {
		type: "vocal";
		oppositeAligned: boolean;
	};

export type LineLyrics = TimeRange & {
	type: "line";
	content: Array<LineVocal | Interlude>;
};

export type Syllable = TimeRange &
	TextMetadata & {
		isPartOfWord: boolean;
	};

export type SyllableVocal = TimeRange & {
	syllables: Syllable[];
};

export type SyllableVocalSet = {
	type: "vocal";
	oppositeAligned: boolean;
	lead: SyllableVocal;
	background?: SyllableVocal[];
	translatedText?: string;
};

export type SyllableLyrics = TimeRange & {
	type: "syllable";
	content: Array<SyllableVocalSet | Interlude>;
};

export type LyricsDocument = StaticLyrics | LineLyrics | SyllableLyrics;

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

export type LyricsCacheStatus =
	| { status: "bypassed"; primaryProvider?: ProviderId }
	| { status: "hit"; provider: ProviderId; primaryProvider?: ProviderId }
	| { status: "miss"; primaryProvider?: ProviderId }
	| { status: "provider-mismatch"; provider: ProviderId; primaryProvider?: ProviderId };

export type ProviderAttemptStatus = "success" | "no-lyrics" | "instrumental" | "temporarily-unavailable" | "cooldown" | "error";

export type ProviderAttempt = {
	provider: ProviderId;
	status: ProviderAttemptStatus;
	message?: string;
};

export type LyricsLoadDiagnostics = {
	cache: LyricsCacheStatus;
	attempts: ProviderAttempt[];
};

export type LyricsLoadState =
	| { status: "idle" }
	| { status: "loading"; track: TrackIdentity }
	| {
			status: "ready";
			track: TrackIdentity;
			lyrics: LyricsDocument;
			provider: ProviderId;
			source: "cache" | "network";
			diagnostics: LyricsLoadDiagnostics;
	  }
	| { status: "empty"; track: TrackIdentity; reason: "no-lyrics" | "instrumental" | "unsupported-local"; diagnostics?: LyricsLoadDiagnostics }
	| { status: "error"; track: TrackIdentity; message: string; diagnostics?: LyricsLoadDiagnostics };

export type ProviderResult =
	| { ok: true; lyrics: LyricsDocument }
	| {
			ok: false;
			reason: "no-lyrics" | "instrumental" | "unsupported-local" | "error" | "temporarily-unavailable";
			message?: string;
			cooldownMs?: number;
	  };

export type ProviderContext = {
	cosmosGet: <T = unknown>(url: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
	fetch: typeof fetch;
	userAgent: string;
	musixmatchToken?: string;
	musixmatchProxyBaseUrl?: string;
};

export interface LyricsProvider {
	id: ProviderId;
	supports(track: TrackIdentity): boolean;
	fetch(track: TrackIdentity, context: ProviderContext): Promise<ProviderResult>;
}
