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
import { SpicetifyPlayerAdapter, type TrackChangedEvent } from "../player/SpicetifyPlayerAdapter";
import { AudioAnalysisWaveformService, type TrackWaveformProfile } from "../renderer/AudioAnalysisWaveformService";
import { buildInterludeWaveformMap, type InterludeWaveformMap } from "../renderer/interludeWaveforms";
import { LyricsRenderer } from "../renderer/LyricsRenderer";
import type { SceneTransitionDirection } from "../renderer/SceneTransitionController";
import type { SpicetifyGlobal } from "../runtime/spicetify";
import { SettingsStore } from "../settings/SettingsStore";
import { SettingsView } from "../settings/SettingsView";
import type { ExtensionSettings } from "../settings/settingsSchema";
import type { CurrentTrackLyricsDelayState } from "../settings/settingsViewTypes";
import { TrackLyricsDelayStore } from "../settings/TrackLyricsDelayStore";
import { pipStyles } from "../styles/pipStyles";
import { IntroPresentationGate } from "./IntroPresentationGate";
import { OutroPresentationController, type OutroPresentationResult } from "./OutroPresentationController";
import { rendererSettingsChange } from "./SettingsChange";
import { TopbarController } from "./TopbarController";
import { sameTrackEpoch, type TrackEpoch } from "./TrackEpoch";
import { presentationStateForSnapshot, type TrackPresentationState } from "./TrackPresentationState";
import {
	type ReadyTrackSessionSnapshot,
	TrackSessionController,
	type TrackSessionEnrichment,
	type TrackSessionSnapshot,
} from "./TrackSessionController";
import { TrackThemeService } from "./TrackThemeService";
import { type TrackTransitionDirection, TrackTransitionDirectionController } from "./TrackTransitionDirectionController";

const SETTINGS_PERSISTENCE_ERROR = "AuraLyrics settings could not be saved.";

/**
 * `deltaTime` sentinel for renderer updates that must not advance motion: `Spring.update` returns the
 * current position unchanged for `deltaTime <= 0`, and `SyllableVocals.animate` treats it as `immediate`
 * and `set()`s each spring straight to its sampled target. Used both for one-off re-renders that do not
 * advance playback time and for frames where motion is disabled.
 */
const SNAP_DELTA_TIME = 0;
type OutroRenderOutcome = "none" | "lyrics-rendered";

type ActiveTrackTransition = {
	epoch: TrackEpoch;
	transitionGeneration: number;
};

type PendingTrackPresentation = { kind: "load-state"; snapshot: TrackSessionSnapshot } | { kind: "ready"; snapshot: ReadyTrackSessionSnapshot };

type TrackChangeLoadOptions = {
	direction: SceneTransitionDirection;
	playbackTrackEpoch: number;
};

export class ExtensionApp {
	private readonly storage: SpicetifyStorageAdapter;
	private readonly settings: SettingsStore;
	private readonly trackLyricsDelays: TrackLyricsDelayStore;
	private readonly player: SpicetifyPlayerAdapter;
	private readonly playbackSynchronizer: PlaybackSynchronizer;
	private readonly pip = new DocumentPipController();
	private readonly renderer = new LyricsRenderer();
	private readonly introGate = new IntroPresentationGate();
	private readonly outroController = new OutroPresentationController();
	private readonly directionController = new TrackTransitionDirectionController();
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
	private appliedSettings: ExtensionSettings;
	private settingsPresentationGeneration = 0;
	private revealedSnapshot?: ReadyTrackSessionSnapshot;
	private playbackTrackEpoch = 0;
	private activeTrackTransition?: ActiveTrackTransition;
	private pendingTrackPresentation?: PendingTrackPresentation;
	private pendingSettingsFrame?: number;

	public constructor(private readonly spicetify: SpicetifyGlobal) {
		this.storage = new SpicetifyStorageAdapter(spicetify);
		this.settings = new SettingsStore(this.storage);
		this.trackLyricsDelays = new TrackLyricsDelayStore(this.storage);
		this.appliedSettings = this.settings.get();
		this.cache = new LyricsCache(this.storage);
		this.player = new SpicetifyPlayerAdapter(spicetify);
		this.playbackSynchronizer = new PlaybackSynchronizer(() => this.player.getTimestamp(this.resolvedLyricsDelayMs()));
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
			proxyBaseUrl: this.resolveProviderProxyBaseUrl(settings.providers),
			refreshMusixmatchToken: async () => {
				try {
					const token = await this.musixmatchTokenService.refresh(this.resolveProviderProxyBaseUrl(settings.providers));
					this.settings.update({ providers: { ...settings.providers, musixmatchToken: token } });
					return token;
				} catch {
					return undefined;
				}
			},
		}));
		this.trackSession = new TrackSessionController(
			{
				load: (track, settings, refresh) => this.lyricsService.load(track, settings, refresh),
				refreshCooldowns: () => this.lyricsService.refreshCooldowns(),
				invalidate: () => this.lyricsService.invalidate(),
			},
			{
				loadProfile: (track) => this.waveformService.loadProfile(track),
				getAnalysis: (track) => this.waveformService.getAnalysis(track),
				invalidateAnalysis: (track) => this.waveformService.invalidateAnalysis(track.uri),
			}
		);
		this.settingsView = new SettingsView(this.settings, this.registry.all(), {
			getCurrentTrackLyricsDelay: () => this.currentTrackLyricsDelayState(),
			onAdjustCurrentTrackLyricsDelay: (uri, deltaMs) => this.adjustCurrentTrackLyricsDelay(uri, deltaMs),
			onRefreshLyrics: () => this.loadCurrentTrack(true),
			onClearCache: () => {
				this.lyricsService.clearCache();
			},
			onMusixmatchTokenAccepted: () => undefined,
			onRefreshMusixmatchToken: () => this.fetchMusixmatchToken(),
			onResetCurrentTrackLyricsDelay: (uri) => this.resetCurrentTrackLyricsDelay(uri),
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
			this.player.trackChanged.subscribe((event) => void this.onTrackChanged(event)),
			this.player.playbackChanged.subscribe((isPlaying) => this.onPlaybackChanged(isPlaying)),
			this.player.progressChanged.subscribe(() => this.onProgressChanged()),
			this.settings.subscribe((settings) => this.onSettingsChanged(settings)),
			this.settings.persistenceFailed.subscribe(() => this.showSettingsPersistenceFailure()),
			this.trackLyricsDelays.persistenceFailed.subscribe(() => this.showSettingsPersistenceFailure()),
			this.pip.closed.subscribe(() => this.closePip(false))
		);
		this.showSettingsPersistenceFailure();
		this.topbar.register();
	}

	public destroy(): void {
		this.directionController.clear();
		this.discardTrackTransitionPresentation();
		this.trackSession.invalidate();
		this.introGate.endTrackEpoch();
		this.outroController.endTrackEpoch();
		this.revealedSnapshot = undefined;
		this.themeGeneration += 1;
		this.cancelPendingSettingsFrame();
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
		this.cache.flush();
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
			this.isPlaybackActive = this.player.isPlaying();
			this.session = await this.pip.open(this.settings.get(), pipStyles, {
				isPlaying: this.isPlaybackActive,
				onPrevious: () => {
					this.directionController.enqueue("previous");
					this.player.previous();
				},
				onTogglePlay: () => this.player.togglePlay(),
				onNext: () => {
					this.directionController.enqueue("next");
					this.player.next();
				},
				onClose: () => this.closePip(),
			});
			this.topbar.setActive(true);
			this.clock = new PlaybackClock(this.session.window, (deltaTime) => this.tick(deltaTime));
			this.clock.start();
			this.playbackSynchronizer.resync();
			this.currentTrack = this.player.getCurrentTrack();
			if (this.currentTrack) {
				if (!this.introGate.hasActiveEpoch()) {
					this.introGate.beginTrackEpoch();
				}
				if (this.outroController.activeTrackUri() !== this.currentTrack.uri) {
					this.outroController.beginTrackEpoch(this.currentTrack.uri);
				}
			}
			const revealedSnapshot = this.revealedSnapshotFor(this.currentTrack);
			if (revealedSnapshot) {
				this.revealReadySnapshot(revealedSnapshot, this.playbackSynchronizer.timestampSec);
			}
			await this.loadCurrentTrack(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.spicetify.showNotification?.(message, true);
		}
	}

	private closePip(closeWindow = true): void {
		this.directionController.clear();
		this.discardTrackTransitionPresentation();
		this.trackSession.invalidate();
		this.introGate.discardPendingSession();
		this.outroController.discardSession();
		this.themeGeneration += 1;
		this.cancelPendingSettingsFrame();
		this.clock?.stop();
		this.clock = undefined;
		this.renderer.destroy();
		this.waveformService.clear();
		if (closeWindow) {
			this.pip.close();
		}
		this.session = undefined;
		this.topbar.setActive(false);
	}

	private async onTrackChanged(event: TrackChangedEvent): Promise<void> {
		const direction = this.directionController.consume(event);
		const track = event.track;
		const playbackTrackEpoch = ++this.playbackTrackEpoch;
		this.discardTrackTransitionPresentation();
		this.trackSession.invalidate();
		this.currentTrack = track;
		this.settingsView.refreshCurrentTrack();
		this.revealedSnapshot = undefined;
		if (track) {
			this.introGate.beginTrackEpoch();
			this.outroController.beginTrackEpoch(track.uri);
		} else {
			this.directionController.clear();
			this.introGate.endTrackEpoch();
			this.outroController.endTrackEpoch();
		}
		if (!this.session) {
			return;
		}
		this.playbackSynchronizer.resync();
		await this.loadCurrentTrack(false, {
			direction: sceneDirectionForTrackTransition(direction),
			playbackTrackEpoch,
		});
	}

	private async loadCurrentTrack(refresh: boolean, trackChange?: TrackChangeLoadOptions): Promise<void> {
		if (!this.session) {
			return;
		}
		const session = this.session;
		const epochId = trackChange?.playbackTrackEpoch ?? this.playbackTrackEpoch;
		const themeGeneration = ++this.themeGeneration;
		const track = this.currentTrack ?? this.player.getCurrentTrack();
		this.currentTrack = track;
		if (!track) {
			this.directionController.clear();
			this.discardTrackTransitionPresentation();
			this.trackSession.invalidate();
			this.introGate.endTrackEpoch();
			this.outroController.endTrackEpoch();
			this.revealedSnapshot = undefined;
			this.session.setCover(undefined);
			this.session.applyTheme(undefined);
			this.showStatus("Waiting for music", "Start playing a Spotify track.");
			return;
		}
		const epoch: TrackEpoch = { id: epochId, uri: track.uri, session, themeGeneration };
		const revealedSnapshot = this.revealedSnapshotFor(track);
		if (!revealedSnapshot) {
			if (trackChange) {
				this.beginTrackTransition(track, epoch, trackChange.direction);
			} else if (!this.hasActiveTrackTransitionFor(epoch)) {
				this.renderPresentationState({ kind: "loading", track });
			}
		}
		session.setCover(track.coverUrl);
		void this.applyTrackTheme(track, epoch);
		const snapshot = await this.trackSession.load(track, this.settings.get(), refresh);
		if (!snapshot || !this.trackSession.isCurrent(snapshot) || !this.isCurrentEpoch(epoch)) return;
		this.playbackSynchronizer.resync();
		if (!isReadyTrackSessionSnapshot(snapshot)) {
			this.revealedSnapshot = undefined;
			this.introGate.discardPendingSession();
			this.outroController.discardSession();
		}
		this.renderLoadState(snapshot);
		const enrichment = this.trackSession.enrichmentFor(snapshot);
		if (enrichment && isReadyTrackSessionSnapshot(snapshot)) {
			void this.renderEnrichment(enrichment, snapshot, epoch);
		}
	}

	private onPlaybackChanged(isPlaying: boolean): void {
		this.isPlaybackActive = isPlaying;
		this.session?.setPlaying(isPlaying);
		if (!this.session) return;
		this.playbackSynchronizer.resync();
		const timestampSec = this.playbackSynchronizer.timestampSec;
		if (isPlaying) {
			const result = this.introGate.resume(timestampSec);
			if (result.kind === "reveal") {
				this.revealReadySnapshot(result.snapshot, timestampSec);
			}
		}
		this.evaluateOutro(timestampSec);
	}

	private onProgressChanged(): void {
		if (!this.session || this.isPlaybackActive) return;
		this.playbackSynchronizer.resync();
		const timestampSec = this.playbackSynchronizer.timestampSec;
		const result = this.introGate.resume(timestampSec);
		if (result.kind === "reveal") {
			this.revealReadySnapshot(result.snapshot, timestampSec);
		}
		this.evaluateOutro(timestampSec);
	}

	private fetchMusixmatchToken(): Promise<string | undefined> {
		return this.musixmatchTokenService.refresh(this.resolveProviderProxyBaseUrl(this.settings.get().providers));
	}

	private showSettingsPersistenceFailure(): void {
		const settingsFailure = this.settings.consumePersistenceFailure();
		const trackDelayFailure = this.trackLyricsDelays.consumePersistenceFailure();
		if (settingsFailure || trackDelayFailure) {
			if (!this.settingsView.reportPersistenceFailure()) {
				this.spicetify.showNotification?.(SETTINGS_PERSISTENCE_ERROR, true);
			}
		}
	}

	private currentTrackLyricsDelayState(): CurrentTrackLyricsDelayState | undefined {
		const track = this.player.getCurrentTrack();
		if (!track) {
			return undefined;
		}
		const defaultDelayMs = this.settings.get().lyricsDelayMs;
		const override = this.trackLyricsDelays.get(track.uri);
		return {
			artist: track.artist,
			delayMs: override ?? defaultDelayMs,
			defaultDelayMs,
			hasOverride: override !== undefined,
			title: track.title,
			uri: track.uri,
		};
	}

	private resolvedLyricsDelayMs(): number {
		return this.trackLyricsDelays.resolve(this.player.getCurrentTrack()?.uri, this.settings.get().lyricsDelayMs);
	}

	private adjustCurrentTrackLyricsDelay(uri: string, deltaMs: number): boolean {
		const state = this.currentTrackLyricsDelayState();
		if (!state || state.uri !== uri) {
			this.settingsView.refreshCurrentTrack();
			return false;
		}
		const result = this.trackLyricsDelays.set(uri, state.delayMs + deltaMs);
		this.refreshLyricsTiming();
		return result.persisted;
	}

	private resetCurrentTrackLyricsDelay(uri: string): boolean {
		if (this.player.getCurrentTrack()?.uri !== uri) {
			this.settingsView.refreshCurrentTrack();
			return false;
		}
		const persisted = this.trackLyricsDelays.delete(uri);
		this.refreshLyricsTiming();
		return persisted;
	}

	private refreshLyricsTiming(): void {
		if (!this.session) {
			return;
		}
		this.playbackSynchronizer.resync();
		const timestampSec = this.playbackSynchronizer.timestampSec;
		const introResult = this.introGate.resume(timestampSec);
		let didRenderLyrics = false;
		if (introResult.kind === "reveal") {
			didRenderLyrics = this.revealReadySnapshot(introResult.snapshot, timestampSec) === "lyrics-rendered";
		}
		const outroOutcome = this.evaluateOutro(timestampSec);
		if (!didRenderLyrics && outroOutcome === "none" && this.hasMountedLyricsPresentation()) {
			this.renderer.update(timestampSec, SNAP_DELTA_TIME);
		}
	}

	private resolveProviderProxyBaseUrl(providers: ExtensionSettings["providers"]): string | undefined {
		return providers.musixmatchProxyMode === "custom" && providers.musixmatchProxyBaseUrl ? providers.musixmatchProxyBaseUrl : undefined;
	}

	private renderLoadState(snapshot: TrackSessionSnapshot): void {
		if (this.deferTrackPresentation({ kind: "load-state", snapshot })) {
			return;
		}
		this.renderLoadStateNow(snapshot);
	}

	private renderLoadStateNow(snapshot: TrackSessionSnapshot): void {
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
			case "intro":
				this.renderer.showTrackMetadata(this.session.root, { mode: "intro", track: state.track }, this.settings.get());
				return;
			case "lyrics":
				this.presentReadySnapshot(state.snapshot);
				return;
			case "instrumental":
				this.renderer.showTrackMetadata(this.session.root, { mode: "persistent", track: state.track }, this.settings.get());
				return;
			case "metadata":
				this.renderer.showTrackMetadata(this.session.root, { mode: "persistent", track: state.track }, this.settings.get());
		}
	}

	private async renderEnrichment(enrichment: TrackSessionEnrichment, initialSnapshot: ReadyTrackSessionSnapshot, epoch: TrackEpoch): Promise<void> {
		const snapshot = await enrichment;
		if (!snapshot || !this.trackSession.isCurrent(snapshot) || !this.isCurrentEpoch(epoch)) {
			return;
		}
		if (!hasRenderableEnrichmentChanges(initialSnapshot, snapshot, this.settings.get())) {
			this.replacePendingTrackPresentation(initialSnapshot, snapshot);
			return;
		}
		this.presentReadySnapshot(snapshot);
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

	private async applyTrackTheme(track: TrackIdentity, epoch: TrackEpoch): Promise<void> {
		await this.trackThemeService.apply(track, epoch.session, () => this.themeGeneration === epoch.themeGeneration && this.isCurrentEpoch(epoch));
	}

	private tick(deltaTime: number): void {
		if (!this.session) return;
		const settings = this.appliedSettings;
		if (!this.isPlaybackActive) {
			if (this.hasMountedLyricsPresentation()) {
				this.renderer.update(this.playbackSynchronizer.timestampSec, settings.motionEnabled && !settings.reduceMotion ? deltaTime : SNAP_DELTA_TIME);
			}
			return;
		}
		this.playbackSynchronizer.update(deltaTime, this.isPlaybackActive);
		const timestampSec = this.playbackSynchronizer.timestampSec;
		let didRenderLyrics = false;
		const result = this.introGate.tick(timestampSec);
		if (result.kind === "reveal") {
			didRenderLyrics = this.revealReadySnapshot(result.snapshot, timestampSec) === "lyrics-rendered";
		}
		didRenderLyrics = this.evaluateOutro(timestampSec) === "lyrics-rendered" || didRenderLyrics;
		if (this.hasMountedLyricsPresentation() && !didRenderLyrics) {
			this.renderer.update(timestampSec, settings.motionEnabled && !settings.reduceMotion ? deltaTime : SNAP_DELTA_TIME);
		}
	}

	/**
	 * Settings-change subscription entry point. Structural changes (which rebuild the presented
	 * lyrics) apply immediately, same as before. Live changes (sliders, toggles that only affect
	 * CSS/visual output) are coalesced onto a single pending PiP-window animation frame so a burst
	 * of rapid input (e.g. dragging a slider) applies only the latest settings once per frame.
	 */
	private onSettingsChanged(settings: ExtensionSettings): void {
		const change = rendererSettingsChange(this.appliedSettings, settings);
		const pipWindow = this.session?.window;
		if (change !== "structural" && pipWindow && typeof pipWindow.requestAnimationFrame === "function") {
			if (this.pendingSettingsFrame === undefined) {
				this.pendingSettingsFrame = pipWindow.requestAnimationFrame(() => {
					this.pendingSettingsFrame = undefined;
					void this.applySettings();
				});
			}
			return;
		}
		this.cancelPendingSettingsFrame();
		void this.applySettings();
	}

	private cancelPendingSettingsFrame(): void {
		if (this.pendingSettingsFrame === undefined) {
			return;
		}
		const frame = this.pendingSettingsFrame;
		this.pendingSettingsFrame = undefined;
		this.session?.window.cancelAnimationFrame(frame);
	}

	private async applySettings(): Promise<void> {
		const session = this.session;
		const settings = this.settings.get();
		const change = rendererSettingsChange(this.appliedSettings, settings);
		this.appliedSettings = settings;
		this.session?.applySettings(settings);
		this.renderer.applySettings(settings);
		if (this.session) {
			this.playbackSynchronizer.resync();
			const timestampSec = this.playbackSynchronizer.timestampSec;
			const outroOutcome = this.evaluateOutro(timestampSec);
			if (outroOutcome === "none" && this.hasMountedLyricsPresentation()) {
				this.renderer.update(timestampSec, SNAP_DELTA_TIME);
			}
		}
		if (!session || change !== "structural") {
			return;
		}
		const presentationGeneration = ++this.settingsPresentationGeneration;
		const pendingSnapshot = this.trackSession.getSnapshot();
		let snapshot = await this.trackSession.updateSettings(settings);
		let usesPreservedSnapshot = false;
		if ((!snapshot || !isReadyTrackSessionSnapshot(snapshot)) && pendingSnapshot.loadState.status === "loading") {
			const preservedSnapshot = this.revealedSnapshotFor(this.currentTrack);
			if (preservedSnapshot) {
				snapshot = preservedSnapshot;
				usesPreservedSnapshot = true;
			}
		}
		if (
			presentationGeneration !== this.settingsPresentationGeneration ||
			!snapshot ||
			(usesPreservedSnapshot ? this.trackSession.getSnapshot() !== pendingSnapshot : !this.trackSession.isCurrent(snapshot)) ||
			this.session !== session ||
			!isReadyTrackSessionSnapshot(snapshot) ||
			this.currentTrack?.uri !== snapshot.loadState.track.uri
		)
			return;
		this.presentReadySnapshot(snapshot);
	}

	private presentReadySnapshot(snapshot: ReadyTrackSessionSnapshot): void {
		if (this.deferTrackPresentation({ kind: "ready", snapshot })) {
			return;
		}
		this.presentReadySnapshotNow(snapshot);
	}

	private presentReadySnapshotNow(snapshot: ReadyTrackSessionSnapshot): void {
		const timestampSec = this.playbackSynchronizer.timestampSec;
		const result = this.introGate.accept(snapshot, this.settings.get(), timestampSec);
		if (result.kind === "hold") {
			this.renderPresentationState({ kind: "intro", track: snapshot.loadState.track });
			return;
		}
		if (result.kind === "reveal") {
			this.revealReadySnapshot(result.snapshot, timestampSec);
		}
	}

	private revealReadySnapshot(snapshot: ReadyTrackSessionSnapshot, timestampSec: number): OutroRenderOutcome {
		if (!this.ensureOutroTrackEpoch(snapshot.loadState.track.uri)) {
			return "none";
		}
		this.revealedSnapshot = snapshot;
		return this.renderOutroResult(this.outroController.accept(snapshot, this.settings.get(), timestampSec), timestampSec);
	}

	private evaluateOutro(timestampSec: number): OutroRenderOutcome {
		return this.renderOutroResult(this.outroController.evaluate(timestampSec), timestampSec);
	}

	private renderOutroResult(result: OutroPresentationResult, timestampSec: number): OutroRenderOutcome {
		if (!this.session) return "none";
		if (result.kind === "show-lyrics") {
			this.mountReadySnapshot(result.snapshot);
			this.renderer.update(timestampSec, SNAP_DELTA_TIME);
			return "lyrics-rendered";
		}
		if (result.kind === "show-metadata") {
			this.renderer.showTrackMetadata(this.session.root, { mode: "persistent", track: result.snapshot.loadState.track }, this.settings.get(), {
				direction: "up",
				animate: true,
			});
		}
		return "none";
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

	private revealedSnapshotFor(track: TrackIdentity | undefined): ReadyTrackSessionSnapshot | undefined {
		if (!track || this.revealedSnapshot?.loadState.track.uri !== track.uri) return undefined;
		const settings = this.settings.get();
		if (this.revealedSnapshot.timingSource !== "synthetic" || (settings.pseudoKaraoke && settings.syncPreference === "prefer-syllable")) {
			return this.revealedSnapshot;
		}
		return {
			...this.revealedSnapshot,
			lyrics: this.revealedSnapshot.loadState.lyrics,
			timingSource: "native",
		};
	}

	private hasMountedLyricsPresentation(): boolean {
		return (
			this.session !== undefined &&
			this.revealedSnapshot !== undefined &&
			this.revealedSnapshot.loadState.track.uri === this.currentTrack?.uri &&
			this.outroController.currentKind() === "lyrics"
		);
	}

	private beginTrackTransition(track: TrackIdentity, epoch: TrackEpoch, direction: SceneTransitionDirection): void {
		this.pendingTrackPresentation = undefined;
		const handle = this.renderer.showTrackMetadata(epoch.session.root, { mode: "loading", track }, this.settings.get(), {
			direction,
			animate: true,
		});
		const active: ActiveTrackTransition = { epoch, transitionGeneration: handle.generation };
		this.activeTrackTransition = active;
		void handle.settled.then((result) => this.settleTrackTransition(active, result));
	}

	private settleTrackTransition(active: ActiveTrackTransition, result: { generation: number; completed: boolean }): void {
		if (this.activeTrackTransition !== active || result.generation !== active.transitionGeneration || !this.isCurrentEpoch(active.epoch)) {
			return;
		}

		this.activeTrackTransition = undefined;
		const pending = this.pendingTrackPresentation;
		this.pendingTrackPresentation = undefined;
		if (!result.completed || !pending) {
			return;
		}

		this.playbackSynchronizer.resync();
		if (
			!this.isCurrentEpoch(active.epoch) ||
			!this.trackSession.isCurrent(pending.snapshot) ||
			trackUriForSnapshot(pending.snapshot) !== active.epoch.uri
		) {
			return;
		}
		if (pending.kind === "load-state") {
			this.renderLoadStateNow(pending.snapshot);
			return;
		}
		this.presentReadySnapshotNow(pending.snapshot);
	}

	private deferTrackPresentation(presentation: PendingTrackPresentation): boolean {
		const active = this.activeTrackTransition;
		if (!active || !this.isCurrentEpoch(active.epoch) || trackUriForSnapshot(presentation.snapshot) !== active.epoch.uri) {
			return false;
		}
		this.pendingTrackPresentation = presentation;
		return true;
	}

	private replacePendingTrackPresentation(initialSnapshot: ReadyTrackSessionSnapshot, snapshot: ReadyTrackSessionSnapshot): void {
		if (this.pendingTrackPresentation?.snapshot !== initialSnapshot) {
			return;
		}
		this.deferTrackPresentation({ kind: "ready", snapshot });
	}

	private hasActiveTrackTransitionFor(epoch: TrackEpoch): boolean {
		const active = this.activeTrackTransition;
		return active !== undefined && sameTrackEpoch(active.epoch, epoch);
	}

	/**
	 * Single staleness check for every async continuation scoped to a track: the PiP session is still
	 * the one the work started in, no track change has happened since, and the player is still on that
	 * track. Replaces the 5-6 condition guards this class used to repeat at each await boundary.
	 */
	private isCurrentEpoch(epoch: TrackEpoch): boolean {
		return this.session === epoch.session && this.playbackTrackEpoch === epoch.id && this.currentTrack?.uri === epoch.uri;
	}

	private discardTrackTransitionPresentation(): void {
		this.activeTrackTransition = undefined;
		this.pendingTrackPresentation = undefined;
	}

	private ensureOutroTrackEpoch(uri: string): boolean {
		if (this.outroController.activeTrackUri() === undefined) {
			this.outroController.beginTrackEpoch(uri);
		}
		return this.outroController.activeTrackUri() === uri;
	}
}

const isReadyTrackSessionSnapshot = (snapshot: TrackSessionSnapshot): snapshot is ReadyTrackSessionSnapshot => snapshot.loadState.status === "ready";

const sceneDirectionForTrackTransition = (direction: TrackTransitionDirection): SceneTransitionDirection => {
	if (direction === "next" || direction === "previous") {
		return direction;
	}
	return "up";
};

const trackUriForSnapshot = (snapshot: TrackSessionSnapshot): string | undefined =>
	snapshot.loadState.status === "idle" ? undefined : snapshot.loadState.track.uri;

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
