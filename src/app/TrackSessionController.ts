import type { AudioAnalysisData } from "../audio/types";
import { buildPseudoKaraokeLyrics } from "../lyrics/pseudoKaraoke/buildPseudoKaraoke";
import type { LineLyrics, LyricsDocument, LyricsLoadState, SyllableLyrics, TrackIdentity } from "../lyrics/types";
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
	load(track: TrackIdentity, settings: ExtensionSettings, refresh: boolean): Promise<LyricsLoadState>;
	refreshCooldowns(): void;
};

export type TrackSessionWaveformService = {
	loadProfile(track: TrackIdentity): Promise<TrackWaveformProfile>;
	getAnalysis(track: TrackIdentity): Promise<AudioAnalysisData | undefined>;
};

type BuildPseudoKaraoke = (lyrics: LineLyrics, analysis: AudioAnalysisData | undefined, durationMs: number) => SyllableLyrics | null;

type PseudoKaraokeEntry = {
	source: LineLyrics;
	lyrics: SyllableLyrics | null;
};

const idleSnapshot = (): TrackSessionSnapshot => ({
	loadState: { status: "idle" },
	timingSource: "native",
});

export class TrackSessionController {
	private generation = 0;
	private settings?: ExtensionSettings;
	private snapshot: TrackSessionSnapshot = idleSnapshot();
	private readonly pseudoKaraokeByUri = new Map<string, PseudoKaraokeEntry>();

	public constructor(
		private readonly lyricsService: TrackSessionLyricsService,
		private readonly waveformService: TrackSessionWaveformService,
		private readonly buildPseudoKaraoke: BuildPseudoKaraoke = buildPseudoKaraokeLyrics
	) {}

	public getSnapshot(): TrackSessionSnapshot {
		return this.snapshot;
	}

	public invalidate(): void {
		this.generation += 1;
		this.snapshot = idleSnapshot();
	}

	public async load(track: TrackIdentity, settings: ExtensionSettings, refresh: boolean): Promise<TrackSessionSnapshot | undefined> {
		const generation = ++this.generation;
		this.settings = settings;
		this.snapshot = {
			loadState: { status: "loading", track },
			timingSource: "native",
		};

		const waveformProfilePromise = this.waveformService.loadProfile(track).catch(() => undefined);
		if (refresh) {
			this.lyricsService.refreshCooldowns();
			this.pseudoKaraokeByUri.delete(track.uri);
		}
		const loadState = await this.lyricsService.load(track, settings, refresh);
		if (!this.isCurrent(generation)) {
			return undefined;
		}
		if (loadState.status !== "ready") {
			this.snapshot = { loadState, timingSource: "native" };
			return this.snapshot;
		}

		const waveformProfile = await waveformProfilePromise;
		if (!this.isCurrent(generation)) {
			return undefined;
		}
		return this.present(loadState, waveformProfile, generation);
	}

	public async updateSettings(settings: ExtensionSettings): Promise<TrackSessionSnapshot | undefined> {
		this.settings = settings;
		const generation = this.generation;
		const { loadState, waveformProfile } = this.snapshot;
		if (loadState.status !== "ready") {
			return this.snapshot;
		}
		return this.present(loadState, waveformProfile, generation);
	}

	private async present(
		loadState: ReadyLoadState,
		waveformProfile: TrackWaveformProfile | undefined,
		generation: number
	): Promise<TrackSessionSnapshot | undefined> {
		if (this.shouldSynthesize(loadState)) {
			await this.ensurePseudoKaraoke(loadState.track, loadState.lyrics as LineLyrics, generation);
		}
		if (!this.isCurrent(generation)) {
			return undefined;
		}

		const lyrics = this.displayLyricsFor(loadState);
		this.snapshot = {
			loadState,
			lyrics,
			timingSource: loadState.lyrics.type === "line" && lyrics.type === "syllable" ? "synthetic" : "native",
			waveformProfile,
		};
		return this.snapshot;
	}

	private shouldSynthesize(loadState: LyricsLoadState): loadState is ReadyLoadState & { lyrics: LineLyrics } {
		return (
			loadState.status === "ready" &&
			loadState.lyrics.type === "line" &&
			this.settings?.pseudoKaraoke === true &&
			this.settings.syncPreference === "prefer-syllable"
		);
	}

	private async ensurePseudoKaraoke(track: TrackIdentity, lineLyrics: LineLyrics, generation: number): Promise<void> {
		if (this.pseudoKaraokeByUri.get(track.uri)?.source === lineLyrics) {
			return;
		}
		const analysis = await this.waveformService.getAnalysis(track);
		if (!this.isCurrent(generation)) {
			return;
		}
		this.pseudoKaraokeByUri.set(track.uri, {
			source: lineLyrics,
			lyrics: this.buildPseudoKaraoke(lineLyrics, analysis, track.durationMs),
		});
	}

	private displayLyricsFor(loadState: ReadyLoadState): LyricsDocument {
		if (!this.shouldSynthesize(loadState)) {
			return loadState.lyrics;
		}
		const entry = this.pseudoKaraokeByUri.get(loadState.track.uri);
		return entry?.source === loadState.lyrics ? (entry.lyrics ?? loadState.lyrics) : loadState.lyrics;
	}

	private isCurrent(generation: number): boolean {
		return generation === this.generation;
	}
}
