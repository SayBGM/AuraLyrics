import type { AudioAnalysisData } from "../audio/types";
import { buildPseudoKaraokeLyrics } from "../lyrics/pseudoKaraoke/buildPseudoKaraoke";
import type { LineLyrics, LyricsDocument, LyricsLoadState, LyricsProviderMetadata, SyllableLyrics, TrackIdentity } from "../lyrics/types";
import type { TrackWaveformProfile } from "../renderer/AudioAnalysisWaveformService";
import type { ExtensionSettings } from "../settings/settingsSchema";

type ReadyLoadState = Extract<LyricsLoadState, { status: "ready" }>;
type NonReadyLoadState = Exclude<LyricsLoadState, ReadyLoadState>;

export type NonReadyTrackSessionSnapshot = {
	loadState: NonReadyLoadState;
	lyrics?: undefined;
	timingSource: "native";
	waveformProfile?: undefined;
};

export type ReadyTrackSessionSnapshot = {
	loadState: ReadyLoadState;
	lyrics: LyricsDocument;
	timingSource: "native" | "synthetic";
	waveformProfile?: TrackWaveformProfile;
};

export type TrackSessionSnapshot = NonReadyTrackSessionSnapshot | ReadyTrackSessionSnapshot;

export type TrackSessionLyricsService = {
	load(
		track: TrackIdentity,
		settings: ExtensionSettings,
		refresh: boolean,
		preferredProvider?: import("../domain/types").ProviderId
	): Promise<LyricsLoadState>;
	refreshCooldowns(): void;
	invalidate(): void;
	fetchTranslation?(
		track: TrackIdentity,
		lyrics: LyricsDocument,
		provider: import("../domain/types").ProviderId,
		metadata: LyricsProviderMetadata | undefined,
		settings: ExtensionSettings,
		signal?: AbortSignal
	): Promise<LyricsDocument | undefined>;
};

export type TrackSessionWaveformService = {
	loadProfile(track: TrackIdentity): Promise<TrackWaveformProfile>;
	getAnalysis(track: TrackIdentity): Promise<AudioAnalysisData | undefined>;
	invalidateAnalysis(track: TrackIdentity): void;
};

type PseudoKaraokeEntry = {
	source: LineLyrics;
	lyrics: SyllableLyrics;
};

export type TrackSessionEnrichment = Promise<ReadyTrackSessionSnapshot | undefined>;

type EnrichmentEntry = {
	start: () => TrackSessionEnrichment;
	promise?: TrackSessionEnrichment;
};

const idleSnapshot = (): TrackSessionSnapshot => ({
	loadState: { status: "idle" },
	timingSource: "native",
});

const MAX_PSEUDO_KARAOKE_ENTRIES = 5;

export class TrackSessionController {
	private generation = 0;
	private presentationRevision = 0;
	private settings?: ExtensionSettings;
	private snapshot: TrackSessionSnapshot = idleSnapshot();
	private readonly enrichmentBySnapshot = new WeakMap<ReadyTrackSessionSnapshot, EnrichmentEntry>();
	private readonly pseudoKaraokeByUri = new Map<string, PseudoKaraokeEntry>();

	public constructor(
		private readonly lyricsService: TrackSessionLyricsService,
		private readonly waveformService: TrackSessionWaveformService,
		private readonly buildPseudoKaraoke: typeof buildPseudoKaraokeLyrics = buildPseudoKaraokeLyrics
	) {}

	public getSnapshot(): TrackSessionSnapshot {
		return this.snapshot;
	}

	public isCurrent(snapshot: TrackSessionSnapshot): boolean {
		return snapshot === this.snapshot;
	}

	public enrichmentFor(snapshot: TrackSessionSnapshot): TrackSessionEnrichment | undefined {
		if (snapshot.loadState.status !== "ready") {
			return undefined;
		}
		const entry = this.enrichmentBySnapshot.get(snapshot as ReadyTrackSessionSnapshot);
		if (!entry) {
			return undefined;
		}
		entry.promise ??= entry.start();
		return entry.promise;
	}

	public invalidate(): void {
		this.generation += 1;
		this.presentationRevision += 1;
		this.snapshot = idleSnapshot();
		this.lyricsService.invalidate();
	}

	public async load(
		track: TrackIdentity,
		settings: ExtensionSettings,
		refresh: boolean,
		preferredProvider?: import("../domain/types").ProviderId
	): Promise<TrackSessionSnapshot | undefined> {
		const generation = ++this.generation;
		this.presentationRevision += 1;
		this.settings = settings;
		this.snapshot = {
			loadState: { status: "loading", track },
			timingSource: "native",
		};

		if (refresh) {
			this.lyricsService.refreshCooldowns();
			this.pseudoKaraokeByUri.delete(track.uri);
			this.waveformService.invalidateAnalysis(track);
		}
		const waveformProfilePromise = this.waveformService.loadProfile(track).catch(() => undefined);
		const loadState = await this.lyricsService.load(track, settings, refresh, preferredProvider);
		if (!this.isGenerationCurrent(generation)) {
			return undefined;
		}
		if (loadState.status !== "ready") {
			this.snapshot = { loadState, timingSource: "native" };
			return this.snapshot;
		}

		const initialSnapshot: ReadyTrackSessionSnapshot = {
			loadState,
			lyrics: loadState.lyrics,
			timingSource: "native",
		};
		this.snapshot = initialSnapshot;
		this.enrichmentBySnapshot.set(initialSnapshot, {
			start: () => this.enrich(loadState, waveformProfilePromise, generation).catch(() => undefined),
		});
		return initialSnapshot;
	}

	public async updateSettings(settings: ExtensionSettings): Promise<TrackSessionSnapshot | undefined> {
		this.settings = settings;
		const generation = this.generation;
		const presentationRevision = ++this.presentationRevision;
		const { loadState, waveformProfile } = this.snapshot;
		if (loadState.status !== "ready") {
			return this.snapshot;
		}
		return this.present(loadState, waveformProfile, generation, presentationRevision, settings);
	}

	/** Replaces only the current track's lyric text metadata after deferred translation completes. */
	public applyDeferredLyrics(translatedLyrics: LyricsDocument): ReadyTrackSessionSnapshot | undefined {
		const current = this.snapshot;
		if (current.loadState.status !== "ready") {
			return undefined;
		}
		const readyCurrent = current as ReadyTrackSessionSnapshot;
		const canonical: LyricsDocument = translatedLyrics;
		const displayed = mergeDeferredTranslation(readyCurrent.lyrics, canonical);
		const loadState = { ...readyCurrent.loadState, lyrics: canonical };
		const next: ReadyTrackSessionSnapshot = { ...readyCurrent, loadState, lyrics: displayed };
		const enrichment = this.enrichmentBySnapshot.get(readyCurrent);
		if (enrichment) {
			this.enrichmentBySnapshot.set(next, enrichment);
		}
		this.snapshot = next;
		return next;
	}

	private async enrich(
		loadState: ReadyLoadState,
		waveformProfilePromise: Promise<TrackWaveformProfile | undefined>,
		generation: number
	): TrackSessionEnrichment {
		const waveformProfile = await waveformProfilePromise;
		if (!this.isGenerationCurrent(generation)) {
			return undefined;
		}
		const currentSnapshot = this.snapshot;
		const currentLoadState =
			currentSnapshot.loadState.status === "ready" && currentSnapshot.loadState.track.uri === loadState.track.uri
				? currentSnapshot.loadState
				: loadState;
		const settings = this.settings;
		if (!settings) {
			return undefined;
		}
		return this.present(currentLoadState, waveformProfile, generation, this.presentationRevision, settings);
	}

	private async present(
		loadState: ReadyLoadState,
		waveformProfile: TrackWaveformProfile | undefined,
		generation: number,
		presentationRevision: number,
		settings: ExtensionSettings
	): Promise<ReadyTrackSessionSnapshot | undefined> {
		if (this.shouldSynthesize(loadState, settings)) {
			await this.ensurePseudoKaraoke(loadState.track, loadState.lyrics as LineLyrics, generation, presentationRevision);
		}
		if (!this.isPresentationCurrent(generation, presentationRevision)) {
			return undefined;
		}

		const lyrics = this.displayLyricsFor(loadState, settings);
		const mergedWaveformProfile = this.waveformProfileForCommit(loadState, waveformProfile);
		this.snapshot = {
			loadState,
			lyrics,
			timingSource: loadState.lyrics.type === "line" && lyrics.type === "syllable" ? "synthetic" : "native",
			waveformProfile: mergedWaveformProfile,
		};
		return this.snapshot;
	}

	private shouldSynthesize(loadState: LyricsLoadState, settings: ExtensionSettings): loadState is ReadyLoadState & { lyrics: LineLyrics } {
		return (
			loadState.status === "ready" &&
			loadState.lyrics.type === "line" &&
			settings.pseudoKaraoke === true &&
			settings.syncPreference === "prefer-syllable"
		);
	}

	private async ensurePseudoKaraoke(track: TrackIdentity, lineLyrics: LineLyrics, generation: number, presentationRevision: number): Promise<void> {
		const existing = this.pseudoKaraokeByUri.get(track.uri);
		if (existing?.source === lineLyrics) {
			this.touchPseudoKaraoke(track.uri, existing);
			return;
		}
		const analysis = await this.waveformService.getAnalysis(track);
		if (!this.isPresentationCurrent(generation, presentationRevision)) {
			return;
		}
		const lyrics = this.buildPseudoKaraoke(lineLyrics, analysis);
		if (lyrics) {
			this.touchPseudoKaraoke(track.uri, { source: lineLyrics, lyrics });
		}
	}

	private displayLyricsFor(loadState: ReadyLoadState, settings: ExtensionSettings): LyricsDocument {
		if (!this.shouldSynthesize(loadState, settings)) {
			return loadState.lyrics;
		}
		const entry = this.pseudoKaraokeByUri.get(loadState.track.uri);
		if (entry?.source === loadState.lyrics) {
			this.touchPseudoKaraoke(loadState.track.uri, entry);
			return entry.lyrics;
		}
		return loadState.lyrics;
	}

	/** Marks `uri` as most-recently-used and evicts the least-recently-used synthesis past the cache bound. */
	private touchPseudoKaraoke(uri: string, entry: PseudoKaraokeEntry): void {
		this.pseudoKaraokeByUri.delete(uri);
		this.pseudoKaraokeByUri.set(uri, entry);
		while (this.pseudoKaraokeByUri.size > MAX_PSEUDO_KARAOKE_ENTRIES) {
			const oldestKey = this.pseudoKaraokeByUri.keys().next().value;
			if (oldestKey === undefined) {
				break;
			}
			this.pseudoKaraokeByUri.delete(oldestKey);
		}
	}

	private isGenerationCurrent(generation: number): boolean {
		return generation === this.generation;
	}

	private isPresentationCurrent(generation: number, presentationRevision: number): boolean {
		return this.isGenerationCurrent(generation) && presentationRevision === this.presentationRevision;
	}

	private waveformProfileForCommit(loadState: ReadyLoadState, candidate: TrackWaveformProfile | undefined): TrackWaveformProfile | undefined {
		const current = this.snapshot;
		const currentProfile = current.loadState.status === "ready" && current.loadState === loadState ? current.waveformProfile : undefined;
		return currentProfile ?? candidate;
	}
}

/** Keeps synthetic timing and waveform state intact while copying translated line text into it. */
const mergeDeferredTranslation = (displayed: LyricsDocument, translated: LyricsDocument): LyricsDocument => {
	if (displayed.type === "static" || translated.type === "static") {
		return translated;
	}
	if (displayed.type === "line" && translated.type === "line") {
		const translatedVocals = translated.content.filter((item) => item.type === "vocal");
		let vocalIndex = 0;
		return {
			...displayed,
			content: displayed.content.map((item) => {
				if (item.type !== "vocal") return item;
				const source = translatedVocals[vocalIndex++];
				return source?.type === "vocal" ? { ...item, translatedText: source.translatedText, performers: source.performers ?? item.performers } : item;
			}),
		};
	}
	if (displayed.type === "syllable" && translated.type === "syllable") {
		const translatedVocals = translated.content.filter((item) => item.type === "vocal");
		let vocalIndex = 0;
		return {
			...displayed,
			content: displayed.content.map((item) => {
				if (item.type !== "vocal") return item;
				const source = translatedVocals[vocalIndex++];
				return source?.type === "vocal" ? { ...item, translatedText: source.translatedText, performers: source.performers ?? item.performers } : item;
			}),
		};
	}
	if (displayed.type === "syllable" && translated.type === "line") {
		const translatedVocals = translated.content.filter((item) => item.type === "vocal");
		let vocalIndex = 0;
		return {
			...displayed,
			content: displayed.content.map((item) => {
				if (item.type !== "vocal") return item;
				const source = translatedVocals[vocalIndex++];
				return source?.type === "vocal" ? { ...item, translatedText: source.translatedText, performers: source.performers ?? item.performers } : item;
			}),
		};
	}
	return translated;
};
