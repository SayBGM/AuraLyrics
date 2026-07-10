import { LyricsCache } from "../lyrics/LyricsCache";
import { LyricsService } from "../lyrics/LyricsService";
import { LrclibProvider } from "../lyrics/providers/LrclibProvider";
import { MusixmatchProvider } from "../lyrics/providers/MusixmatchProvider";
import { type MusixmatchTokenResponse, MusixmatchTokenService } from "../lyrics/providers/MusixmatchTokenService";
import { ProviderRegistry } from "../lyrics/providers/ProviderRegistry";
import { SpotifyProvider } from "../lyrics/providers/SpotifyProvider";
import { buildPseudoKaraokeLyrics } from "../lyrics/pseudoKaraoke/buildPseudoKaraoke";
import type { LineLyrics, LyricsDocument, LyricsLoadState, SyllableLyrics, TrackIdentity } from "../lyrics/types";
import { DocumentPipController, type PipSession } from "../pip/DocumentPipController";
import { SpicetifyStorageAdapter } from "../platform/SpicetifyStorageAdapter";
import { PlaybackClock } from "../player/PlaybackClock";
import { SpicetifyPlayerAdapter } from "../player/SpicetifyPlayerAdapter";
import { AudioAnalysisWaveformService, type TrackWaveformProfile } from "../renderer/AudioAnalysisWaveformService";
import { buildInterludeWaveformMap, type InterludeWaveformMap } from "../renderer/interludeWaveforms";
import { LyricsRenderer } from "../renderer/LyricsRenderer";
import type { SpicetifyGlobal } from "../runtime/spicetify";
import { SettingsStore } from "../settings/SettingsStore";
import { SettingsView } from "../settings/SettingsView";
import type { ExtensionSettings } from "../settings/settingsSchema";
import { pipStyles } from "../styles/pipStyles";
import { MusicStateMachine } from "./MusicStateMachine";
import { TopbarController } from "./TopbarController";
import { TrackAccentService } from "./TrackAccentService";

const SETTINGS_PERSISTENCE_ERROR = "AuraLyrics settings could not be saved.";

export class ExtensionApp {
	private readonly storage: SpicetifyStorageAdapter;
	private readonly settings: SettingsStore;
	private readonly player: SpicetifyPlayerAdapter;
	private readonly pip = new DocumentPipController();
	private readonly renderer = new LyricsRenderer();
	private readonly stateMachine = new MusicStateMachine();
	private readonly cache: LyricsCache;
	private readonly registry = new ProviderRegistry([new SpotifyProvider(), new LrclibProvider(), new MusixmatchProvider()]);
	private readonly lyricsService: LyricsService;
	private readonly musixmatchTokenService: MusixmatchTokenService;
	private readonly waveformService: AudioAnalysisWaveformService;
	private readonly trackAccentService: TrackAccentService;
	private readonly settingsView: SettingsView;
	private readonly topbar: TopbarController;
	private readonly disposers: Array<() => void> = [];
	private clock?: PlaybackClock;
	private session?: PipSession;
	private currentTrack?: TrackIdentity;
	private lastLoadState: LyricsLoadState = { status: "idle" };
	private waveformProfile?: TrackWaveformProfile;
	// Keyed by track URI; `source` records the exact line lyrics the synthesis was built
	// from, so a later load with different provider timing never shows a stale result.
	private readonly pseudoKaraokeByUri = new Map<string, { source: LineLyrics; lyrics: SyllableLyrics | null }>();
	private started = false;
	private isPlaybackActive = false;
	private playbackTimestampSec = 0;
	private playbackResyncElapsedSec = 0;
	private playbackSeekProbeElapsedSec = 0;
	private readonly playbackResyncIntervalSec = 20;
	private readonly playbackSeekProbeIntervalSec = 0.25;
	private readonly playbackSeekSnapThresholdSec = 1.25;

	public constructor(private readonly spicetify: SpicetifyGlobal) {
		this.storage = new SpicetifyStorageAdapter(spicetify);
		this.settings = new SettingsStore(this.storage);
		this.cache = new LyricsCache(this.storage);
		this.player = new SpicetifyPlayerAdapter(spicetify);
		this.waveformService = new AudioAnalysisWaveformService(async (uri) => this.spicetify.getAudioData?.(uri));
		this.trackAccentService = new TrackAccentService(spicetify.colorExtractor);
		this.musixmatchTokenService = new MusixmatchTokenService((url, body, headers) => {
			if (!this.spicetify.CosmosAsync) {
				throw new Error("Spicetify.CosmosAsync is not available.");
			}
			return this.spicetify.CosmosAsync.get<MusixmatchTokenResponse>(url, body, headers);
		}, window.fetch.bind(window));
		this.lyricsService = new LyricsService(this.registry, this.cache, (settings) => ({
			cosmosGet: (url, body, headers) => {
				if (!this.spicetify.CosmosAsync) {
					throw new Error("Spicetify.CosmosAsync is not available.");
				}
				return this.spicetify.CosmosAsync.get(url, body, headers);
			},
			fetch: window.fetch.bind(window),
			userAgent: `spicetify v${this.spicetify.Config?.version ?? "unknown"} AuraLyrics`,
			musixmatchToken: settings.providers.musixmatchToken,
			musixmatchProxyBaseUrl: this.resolveMusixmatchProxyBaseUrl(settings.providers),
		}));
		this.settingsView = new SettingsView(this.settings, this.registry.all(), {
			onRefreshLyrics: () => void this.loadCurrentTrack(true),
			onClearCache: () => {
				this.cache.clear();
				this.spicetify.showNotification?.("AuraLyrics cache cleared.");
			},
			onRefreshMusixmatchToken: () => this.refreshMusixmatchToken(),
		});
		this.topbar = new TopbarController(
			spicetify,
			() => void this.togglePip(),
			() => this.settingsView.open()
		);
	}

	public start(): void {
		if (this.started) {
			return;
		}
		this.started = true;
		this.player.attach();
		this.disposers.push(
			this.player.trackChanged.subscribe((track) => void this.onTrackChanged(track)),
			this.player.playbackChanged.subscribe((isPlaying) => this.onPlaybackChanged(isPlaying)),
			this.settings.subscribe(() => void this.applySettings()),
			this.settings.persistenceFailed.subscribe(() => this.showSettingsPersistenceFailure()),
			this.pip.closed.subscribe(() => this.closePip(false))
		);
		this.showSettingsPersistenceFailure();
		this.topbar.register();
	}

	public destroy(): void {
		this.started = false;
		this.clock?.stop();
		this.clock = undefined;
		for (const dispose of this.disposers.splice(0)) {
			dispose();
		}
		this.player.detach();
		this.topbar.destroy();
		this.settingsView.destroy();
		this.pip.close();
		this.renderer.destroy();
	}

	private async togglePip(): Promise<void> {
		if (this.pip.isOpen()) {
			this.closePip();
			return;
		}
		await this.openPip();
	}

	private async openPip(): Promise<void> {
		try {
			this.stateMachine.dispatch({ type: "openPiP" });
			this.isPlaybackActive = this.player.isPlaying();
			this.session = await this.pip.open(this.settings.get(), pipStyles, {
				isPlaying: this.isPlaybackActive,
				onPrevious: () => this.player.previous(),
				onTogglePlay: () => this.player.togglePlay(),
				onNext: () => this.player.next(),
				onClose: () => this.closePip(),
			});
			this.stateMachine.dispatch({ type: "pipReady" });
			this.topbar.setActive(true);
			this.clock = new PlaybackClock(this.session.window, (deltaTime) => this.tick(deltaTime));
			this.clock.start();
			this.resyncPlaybackTimestamp();
			this.currentTrack = this.player.getCurrentTrack();
			await this.loadCurrentTrack(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.stateMachine.dispatch({ type: "pipFailed", message });
			this.spicetify.showNotification?.(message, true);
		}
	}

	private closePip(closeWindow = true): void {
		this.clock?.stop();
		this.clock = undefined;
		this.renderer.destroy();
		if (closeWindow) {
			this.pip.close();
		}
		this.session = undefined;
		this.topbar.setActive(false);
		this.stateMachine.dispatch({ type: "closePiP" });
	}

	private async onTrackChanged(track: TrackIdentity | undefined): Promise<void> {
		this.currentTrack = track;
		this.resyncPlaybackTimestamp();
		if (!this.session) {
			return;
		}
		this.stateMachine.dispatch({ type: "trackChanged" });
		await this.loadCurrentTrack(false);
	}

	private async loadCurrentTrack(refresh: boolean): Promise<void> {
		if (!this.session) {
			return;
		}
		const track = this.currentTrack ?? this.player.getCurrentTrack();
		this.currentTrack = track;
		if (!track) {
			this.waveformProfile = undefined;
			this.showStatus("Waiting for music", "Start playing a Spotify track.");
			this.stateMachine.dispatch({ type: "invalidTrack" });
			return;
		}
		this.session.setCover(track.coverUrl);
		void this.applyTrackAccent(track);
		this.stateMachine.dispatch({ type: "validTrack" });
		this.showStatus("Loading lyrics", track.title);
		const waveformProfilePromise = this.waveformService.loadProfile(track);
		if (refresh) {
			this.pseudoKaraokeByUri.delete(track.uri);
		}
		this.lastLoadState = await this.lyricsService.load(track, this.settings.get(), refresh);
		this.waveformProfile = this.lastLoadState.status === "ready" ? await waveformProfilePromise : undefined;
		if (this.lastLoadState.status === "ready" && this.shouldSynthesizeKaraoke(this.lastLoadState)) {
			await this.ensurePseudoKaraoke(track, this.lastLoadState.lyrics as LineLyrics);
		}
		this.resyncPlaybackTimestamp();
		this.renderLoadState(this.lastLoadState);
	}

	private onPlaybackChanged(isPlaying: boolean): void {
		this.isPlaybackActive = isPlaying;
		this.session?.setPlaying(isPlaying);
		this.resyncPlaybackTimestamp();
	}

	private async refreshMusixmatchToken(): Promise<string | undefined> {
		const token = await this.musixmatchTokenService.refresh(this.resolveMusixmatchProxyBaseUrl(this.settings.get().providers));
		this.spicetify.showNotification?.("Musixmatch token updated.");
		return token;
	}

	private showSettingsPersistenceFailure(): void {
		if (this.settings.consumePersistenceFailure()) {
			this.spicetify.showNotification?.(SETTINGS_PERSISTENCE_ERROR, true);
		}
	}

	private resolveMusixmatchProxyBaseUrl(providers: ExtensionSettings["providers"]): string | undefined {
		return providers.musixmatchProxyMode === "custom" && providers.musixmatchProxyBaseUrl ? providers.musixmatchProxyBaseUrl : undefined;
	}

	private renderLoadState(state: LyricsLoadState): void {
		if (!this.session) {
			return;
		}
		if (state.status === "ready") {
			this.stateMachine.dispatch({ type: "lyricsReady" });
			const lyrics = this.displayLyricsFor(state);
			this.renderer.mount(this.session.root, {
				lyrics,
				settings: this.settings.get(),
				provider: state.provider,
				source: state.source,
				diagnostics: state.diagnostics,
				waveforms: this.waveformsForLyrics(lyrics),
				rhythm: this.waveformProfile,
			});
			return;
		}
		if (state.status === "empty") {
			this.stateMachine.dispatch({ type: "noLyrics", message: state.reason });
			if (state.reason === "instrumental") {
				this.renderer.showAlbumArt(this.session.root);
				return;
			}
			this.showStatus("No synced lyrics", state.track.title, "Retry current track");
			return;
		}
		if (state.status === "error") {
			this.stateMachine.dispatch({ type: "providerError", message: state.message });
			this.showStatus("Lyrics failed", state.message, "Retry current track", "danger");
		}
	}

	private showStatus(title: string, detail?: string, actionLabel?: string, tone: "neutral" | "danger" = "neutral"): void {
		if (!this.session) {
			return;
		}
		this.renderer.showStatus(
			this.session.root,
			{
				title,
				detail,
				tone,
				actionLabel,
				onAction: actionLabel ? () => void this.loadCurrentTrack(true) : undefined,
			},
			this.settings.get()
		);
	}

	private async applyTrackAccent(track: TrackIdentity): Promise<void> {
		const session = this.session;
		if (!session) {
			return;
		}
		await this.trackAccentService.apply(track, session, () => this.session === session && this.currentTrack?.uri === track.uri);
	}

	private tick(deltaTime: number): void {
		if (!this.session || this.lastLoadState.status !== "ready") {
			return;
		}
		const settings = this.settings.get();
		if (this.isPlaybackActive) {
			this.playbackTimestampSec = Math.max(0, this.playbackTimestampSec + deltaTime);
			this.playbackResyncElapsedSec += deltaTime;
			this.playbackSeekProbeElapsedSec += deltaTime;
			if (this.playbackResyncElapsedSec >= this.playbackResyncIntervalSec) {
				this.resyncPlaybackTimestamp();
			} else if (this.playbackSeekProbeElapsedSec >= this.playbackSeekProbeIntervalSec) {
				this.snapToPlayerTimestampIfNeeded();
			}
		}
		this.renderer.update(this.playbackTimestampSec, settings.motionEnabled && !settings.reduceMotion ? deltaTime : 1);
	}

	private resyncPlaybackTimestamp(): void {
		if (!this.session) {
			return;
		}
		this.playbackTimestampSec = this.player.getTimestamp(this.settings.get().lyricsDelayMs);
		this.playbackResyncElapsedSec = 0;
		this.playbackSeekProbeElapsedSec = 0;
	}

	private snapToPlayerTimestampIfNeeded(): void {
		this.playbackSeekProbeElapsedSec = 0;
		const playerTimestampSec = this.player.getTimestamp(this.settings.get().lyricsDelayMs);
		if (Math.abs(playerTimestampSec - this.playbackTimestampSec) >= this.playbackSeekSnapThresholdSec) {
			this.playbackTimestampSec = playerTimestampSec;
			this.playbackResyncElapsedSec = 0;
		}
	}

	private async applySettings(): Promise<void> {
		this.session?.applySettings(this.settings.get());
		this.resyncPlaybackTimestamp();
		const state = this.lastLoadState;
		if (this.session && state.status === "ready") {
			if (this.shouldSynthesizeKaraoke(state) && this.currentTrack) {
				await this.ensurePseudoKaraoke(this.currentTrack, state.lyrics as LineLyrics);
			}
			const lyrics = this.displayLyricsFor(state);
			this.renderer.mount(this.session.root, {
				lyrics,
				settings: this.settings.get(),
				provider: state.provider,
				source: state.source,
				diagnostics: state.diagnostics,
				waveforms: this.waveformsForLyrics(lyrics),
				rhythm: this.waveformProfile,
			});
		}
	}

	private shouldSynthesizeKaraoke(state: LyricsLoadState): boolean {
		const settings = this.settings.get();
		return state.status === "ready" && state.lyrics.type === "line" && settings.pseudoKaraoke && settings.syncPreference === "prefer-syllable";
	}

	private async ensurePseudoKaraoke(track: TrackIdentity, lineLyrics: LineLyrics): Promise<void> {
		if (this.pseudoKaraokeByUri.get(track.uri)?.source === lineLyrics) {
			return;
		}
		const analysis = await this.waveformService.getAnalysis(track);
		this.pseudoKaraokeByUri.set(track.uri, { source: lineLyrics, lyrics: buildPseudoKaraokeLyrics(lineLyrics, analysis, track.durationMs) });
	}

	private displayLyricsFor(state: Extract<LyricsLoadState, { status: "ready" }>): LyricsDocument {
		if (!this.shouldSynthesizeKaraoke(state)) {
			return state.lyrics;
		}
		const entry = this.pseudoKaraokeByUri.get(state.track.uri);
		if (!entry || entry.source !== state.lyrics) {
			return state.lyrics;
		}
		return entry.lyrics ?? state.lyrics;
	}

	private waveformsForLyrics(lyrics: LyricsDocument): InterludeWaveformMap {
		return buildInterludeWaveformMap({
			lyrics,
			profile: this.waveformProfile,
			interludeStyle: this.settings.get().interludeStyle,
			waveformForInterlude: (profile, interlude) => this.waveformService.waveformForInterlude(profile, interlude),
		});
	}
}
