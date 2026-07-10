import { LyricsCache } from "../lyrics/LyricsCache";
import { LyricsService } from "../lyrics/LyricsService";
import { LrclibProvider } from "../lyrics/providers/LrclibProvider";
import { MusixmatchProvider } from "../lyrics/providers/MusixmatchProvider";
import { type MusixmatchTokenResponse, MusixmatchTokenService } from "../lyrics/providers/MusixmatchTokenService";
import { ProviderRegistry } from "../lyrics/providers/ProviderRegistry";
import { SpotifyProvider } from "../lyrics/providers/SpotifyProvider";
import type { LyricsDocument, TrackIdentity } from "../lyrics/types";
import { DocumentPipController, type PipSession } from "../pip/DocumentPipController";
import { SpicetifyStorageAdapter } from "../platform/SpicetifyStorageAdapter";
import { PlaybackClock } from "../player/PlaybackClock";
import { PlaybackSynchronizer } from "../player/PlaybackSynchronizer";
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
import { presentationStateForSnapshot, type TrackPresentationState } from "./TrackPresentationState";
import {
	type ReadyTrackSessionSnapshot,
	TrackSessionController,
	type TrackSessionEnrichment,
	type TrackSessionSnapshot,
} from "./TrackSessionController";
import { TrackThemeService } from "./TrackThemeService";

const SETTINGS_PERSISTENCE_ERROR = "AuraLyrics settings could not be saved.";

export class ExtensionApp {
	private readonly storage: SpicetifyStorageAdapter;
	private readonly settings: SettingsStore;
	private readonly player: SpicetifyPlayerAdapter;
	private readonly playbackSynchronizer: PlaybackSynchronizer;
	private readonly pip = new DocumentPipController();
	private readonly renderer = new LyricsRenderer();
	private readonly stateMachine = new MusicStateMachine();
	private readonly cache: LyricsCache;
	private readonly registry = new ProviderRegistry([new SpotifyProvider(), new LrclibProvider(), new MusixmatchProvider()]);
	private readonly lyricsService: LyricsService;
	private readonly musixmatchTokenService: MusixmatchTokenService;
	private readonly waveformService: AudioAnalysisWaveformService;
	private readonly trackSession: TrackSessionController;
	private readonly trackThemeService: TrackThemeService;
	private readonly settingsView: SettingsView;
	private readonly topbar: TopbarController;
	private readonly disposers: Array<() => void> = [];
	private clock?: PlaybackClock;
	private openPipPromise?: Promise<void>;
	private session?: PipSession;
	private currentTrack?: TrackIdentity;
	private themeGeneration = 0;
	private started = false;
	private isPlaybackActive = false;

	public constructor(private readonly spicetify: SpicetifyGlobal) {
		this.storage = new SpicetifyStorageAdapter(spicetify);
		this.settings = new SettingsStore(this.storage);
		this.cache = new LyricsCache(this.storage);
		this.player = new SpicetifyPlayerAdapter(spicetify);
		this.playbackSynchronizer = new PlaybackSynchronizer(() => this.player.getTimestamp(this.settings.get().lyricsDelayMs));
		this.waveformService = new AudioAnalysisWaveformService(async (uri) => this.spicetify.getAudioData?.(uri));
		this.trackThemeService = new TrackThemeService(spicetify.colorExtractor);
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
		this.trackSession = new TrackSessionController(
			{
				load: (track, settings, refresh) => this.lyricsService.load(track, settings, refresh),
				refreshCooldowns: () => this.lyricsService.refreshCooldowns(),
			},
			{
				loadProfile: (track) => this.waveformService.loadProfile(track),
				getAnalysis: (track) => this.waveformService.getAnalysis(track),
			}
		);
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
		this.trackSession.invalidate();
		this.themeGeneration += 1;
		this.session = undefined;
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

	private openPip(): Promise<void> {
		if (this.openPipPromise) {
			return this.openPipPromise;
		}
		const openPromise = this.openPipOnce();
		this.openPipPromise = openPromise;
		const clearOpenPromise = () => {
			if (this.openPipPromise === openPromise) {
				this.openPipPromise = undefined;
			}
		};
		void openPromise.then(clearOpenPromise, clearOpenPromise);
		return openPromise;
	}

	private async openPipOnce(): Promise<void> {
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
			this.playbackSynchronizer.resync();
			this.currentTrack = this.player.getCurrentTrack();
			await this.loadCurrentTrack(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.stateMachine.dispatch({ type: "pipFailed", message });
			this.spicetify.showNotification?.(message, true);
		}
	}

	private closePip(closeWindow = true): void {
		this.trackSession.invalidate();
		this.themeGeneration += 1;
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
		this.trackSession.invalidate();
		this.currentTrack = track;
		if (!this.session) {
			return;
		}
		this.playbackSynchronizer.resync();
		this.stateMachine.dispatch({ type: "trackChanged" });
		await this.loadCurrentTrack(false);
	}

	private async loadCurrentTrack(refresh: boolean): Promise<void> {
		if (!this.session) {
			return;
		}
		const themeGeneration = ++this.themeGeneration;
		const track = this.currentTrack ?? this.player.getCurrentTrack();
		this.currentTrack = track;
		if (!track) {
			this.trackSession.invalidate();
			this.session.setCover(undefined);
			this.session.applyTheme(undefined);
			this.showStatus("Waiting for music", "Start playing a Spotify track.");
			this.stateMachine.dispatch({ type: "invalidTrack" });
			return;
		}
		this.session.setCover(track.coverUrl);
		void this.applyTrackTheme(track, themeGeneration);
		this.stateMachine.dispatch({ type: "validTrack" });
		this.renderPresentationState({ kind: "loading", track });
		const snapshot = await this.trackSession.load(track, this.settings.get(), refresh);
		if (!snapshot || !this.trackSession.isCurrent(snapshot) || !this.session || this.currentTrack?.uri !== track.uri) return;
		this.playbackSynchronizer.resync();
		this.renderLoadState(snapshot);
		const enrichment = this.trackSession.enrichmentFor(snapshot);
		if (enrichment && isReadyTrackSessionSnapshot(snapshot)) {
			void this.renderEnrichment(enrichment, snapshot, track, this.session);
		}
	}

	private onPlaybackChanged(isPlaying: boolean): void {
		this.isPlaybackActive = isPlaying;
		this.session?.setPlaying(isPlaying);
		if (this.session) {
			this.playbackSynchronizer.resync();
		}
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

	private renderLoadState(snapshot: TrackSessionSnapshot): void {
		const presentation = presentationStateForSnapshot(snapshot);
		if (presentation) {
			this.renderPresentationState(presentation);
		}
	}

	private renderPresentationState(state: TrackPresentationState): void {
		if (!this.session) return;
		switch (state.kind) {
			case "loading":
				this.renderer.showTrackMetadata(this.session.root, { mode: "loading", track: state.track }, this.settings.get());
				return;
			case "lyrics":
				this.stateMachine.dispatch({ type: "lyricsReady" });
				this.mountReadySnapshot(state.snapshot);
				return;
			case "instrumental":
				this.stateMachine.dispatch({ type: "noLyrics", message: "instrumental" });
				this.renderer.showAlbumArt(this.session.root);
				return;
			case "metadata":
				if (state.reason === "error") {
					this.stateMachine.dispatch({ type: "providerError", message: state.message ?? "error" });
				} else {
					this.stateMachine.dispatch({ type: "noLyrics", message: state.reason });
				}
				this.renderer.showTrackMetadata(this.session.root, { mode: "persistent", track: state.track }, this.settings.get());
		}
	}

	private async renderEnrichment(
		enrichment: TrackSessionEnrichment,
		initialSnapshot: ReadyTrackSessionSnapshot,
		track: TrackIdentity,
		session: PipSession
	): Promise<void> {
		const snapshot = await enrichment;
		if (!snapshot || !this.trackSession.isCurrent(snapshot) || this.session !== session || this.currentTrack?.uri !== track.uri) {
			return;
		}
		if (!hasRenderableEnrichmentChanges(initialSnapshot, snapshot, this.settings.get())) {
			return;
		}
		this.mountReadySnapshot(snapshot);
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

	private async applyTrackTheme(track: TrackIdentity, generation: number): Promise<void> {
		const session = this.session;
		if (!session) {
			return;
		}
		await this.trackThemeService.apply(
			track,
			session,
			() => this.themeGeneration === generation && this.session === session && this.currentTrack?.uri === track.uri
		);
	}

	private tick(deltaTime: number): void {
		if (!this.session || this.trackSession.getSnapshot().loadState.status !== "ready") {
			return;
		}
		const settings = this.settings.get();
		this.playbackSynchronizer.update(deltaTime, this.isPlaybackActive);
		this.renderer.update(this.playbackSynchronizer.timestampSec, settings.motionEnabled && !settings.reduceMotion ? deltaTime : 1);
	}

	private async applySettings(): Promise<void> {
		const session = this.session;
		const settings = this.settings.get();
		this.session?.applySettings(settings);
		if (this.session) {
			this.playbackSynchronizer.resync();
		}
		const snapshot = await this.trackSession.updateSettings(settings);
		if (
			!snapshot ||
			!this.trackSession.isCurrent(snapshot) ||
			this.session !== session ||
			!isReadyTrackSessionSnapshot(snapshot) ||
			this.currentTrack?.uri !== snapshot.loadState.track.uri
		)
			return;
		this.mountReadySnapshot(snapshot);
	}

	private mountReadySnapshot(snapshot: ReadyTrackSessionSnapshot): void {
		if (!this.session) return;
		const state = snapshot.loadState;
		this.renderer.mount(this.session.root, {
			lyrics: snapshot.lyrics,
			settings: this.settings.get(),
			timingSource: snapshot.timingSource,
			provider: state.provider,
			source: state.source,
			diagnostics: state.diagnostics,
			waveforms: this.waveformsForLyrics(snapshot.lyrics, snapshot.waveformProfile),
			rhythm: snapshot.waveformProfile,
		});
	}

	private waveformsForLyrics(lyrics: LyricsDocument, waveformProfile?: TrackWaveformProfile): InterludeWaveformMap {
		return buildInterludeWaveformMap({
			lyrics,
			profile: waveformProfile,
			interludeStyle: this.settings.get().interludeStyle,
			waveformForInterlude: (profile, interlude) => this.waveformService.waveformForInterlude(profile, interlude),
		});
	}
}

const isReadyTrackSessionSnapshot = (snapshot: TrackSessionSnapshot): snapshot is ReadyTrackSessionSnapshot => snapshot.loadState.status === "ready";

const hasRenderableEnrichmentChanges = (
	initialSnapshot: ReadyTrackSessionSnapshot,
	enrichedSnapshot: ReadyTrackSessionSnapshot,
	settings: ExtensionSettings
): boolean => {
	if (initialSnapshot.lyrics !== enrichedSnapshot.lyrics || initialSnapshot.timingSource !== enrichedSnapshot.timingSource) {
		return true;
	}
	const beatDuration = enrichedSnapshot.waveformProfile?.beatDurationSec;
	if (beatDuration !== undefined && Number.isFinite(beatDuration)) {
		return true;
	}
	return settings.interludeStyle === "wave" && enrichedSnapshot.lyrics.type !== "static";
};
