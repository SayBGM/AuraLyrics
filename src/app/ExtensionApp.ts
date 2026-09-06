import type { LyricsCache } from "../lyrics/LyricsCache";
import type { LyricsService } from "../lyrics/LyricsService";
import type { MusixmatchTokenService } from "../lyrics/providers/MusixmatchTokenService";
import type { TrackIdentity } from "../lyrics/types";
import { DocumentPipController, type PipSession } from "../pip/DocumentPipController";
import { PlaybackClock } from "../player/PlaybackClock";
import type { PlaybackSynchronizer } from "../player/PlaybackSynchronizer";
import type { SpicetifyPlayerAdapter, TrackChangedEvent } from "../player/SpicetifyPlayerAdapter";
import type { AudioAnalysisWaveformService } from "../renderer/AudioAnalysisWaveformService";
import { LyricsRenderer } from "../renderer/LyricsRenderer";
import type { SceneTransitionDirection } from "../renderer/SceneTransitionController";
import type { SpicetifyGlobal } from "../runtime/spicetify";
import type { SettingsStore } from "../settings/SettingsStore";
import type { SettingsView } from "../settings/SettingsView";
import type { ExtensionSettings } from "../settings/settingsSchema";
import type { TrackLyricsDelayStore } from "../settings/TrackLyricsDelayStore";
import { pipStyles } from "../styles/pipStyles";
import { createExtensionServices, resolveProviderProxyBaseUrl } from "./createExtensionServices";
import { IntroPresentationGate } from "./IntroPresentationGate";
import { OutroPresentationController } from "./OutroPresentationController";
import { PresentationController, SNAP_DELTA_TIME } from "./PresentationController";
import { rendererSettingsChange } from "./SettingsChange";
import type { TopbarController } from "./TopbarController";
import { TrackDelayController } from "./TrackDelayController";
import type { TrackEpoch } from "./TrackEpoch";
import type { ReadyTrackSessionSnapshot, TrackSessionController, TrackSessionEnrichment, TrackSessionSnapshot } from "./TrackSessionController";
import type { TrackThemeService } from "./TrackThemeService";
import { type TrackTransitionDirection, TrackTransitionDirectionController } from "./TrackTransitionDirectionController";
import { TrackTransitionPresenter } from "./TrackTransitionPresenter";

const SETTINGS_PERSISTENCE_ERROR = "AuraLyrics settings could not be saved.";

type TrackChangeLoadOptions = {
	direction: SceneTransitionDirection;
	playbackTrackEpoch: number;
};

/**
 * Orchestrates the extension: owns the collaborators, the PiP session lifecycle, the playback clock
 * and the load -> present pipeline that connects them.
 *
 * The work each step does lives in a dedicated controller — {@link PresentationController} (what the
 * window shows), {@link TrackTransitionPresenter} (holding presentations during a track-change
 * animation) and {@link TrackDelayController} (per-track lyrics delay). Each receives a host object
 * of live getters onto the fields below, so they always observe the current session, renderer and
 * settings rather than values captured at construction time.
 */
export class ExtensionApp {
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
	private readonly lyricsService: LyricsService;
	private readonly musixmatchTokenService: MusixmatchTokenService;
	private readonly waveformService: AudioAnalysisWaveformService;
	private readonly trackSession: TrackSessionController;
	private readonly trackThemeService: TrackThemeService;
	private readonly settingsView: SettingsView;
	private readonly topbar: TopbarController;
	private readonly presentation: PresentationController;
	private readonly transitions: TrackTransitionPresenter;
	private readonly trackDelays: TrackDelayController;
	private readonly disposers: Array<() => void> = [];
	private clock?: PlaybackClock;
	private openPipPromise?: Promise<void>;
	private session?: PipSession;
	private currentTrack?: TrackIdentity;
	private themeGeneration = 0;
	private started = false;
	/** Cached `Player.isPlaying()`: the Spicetify read is expensive and `tick()` needs it every frame. */
	private isPlaybackActive = false;
	private appliedSettings: ExtensionSettings;
	/**
	 * Guards concurrent structural settings re-presentations. Not folded into {@link TrackEpoch}: a
	 * settings change re-presents the same track, so it must not invalidate the track epoch.
	 */
	private settingsPresentationGeneration = 0;
	private playbackTrackEpoch = 0;
	private pendingSettingsFrame?: number;

	public constructor(private readonly spicetify: SpicetifyGlobal) {
		const services = createExtensionServices(spicetify, {
			resolvedLyricsDelayMs: () => this.trackDelays.resolvedLyricsDelayMs(),
			currentTrackLyricsDelayState: () => this.trackDelays.currentTrackLyricsDelayState(),
			adjustCurrentTrackLyricsDelay: (uri, deltaMs) => this.trackDelays.adjustCurrentTrackLyricsDelay(uri, deltaMs),
			resetCurrentTrackLyricsDelay: (uri) => this.trackDelays.resetCurrentTrackLyricsDelay(uri),
			reloadCurrentTrack: () => this.loadCurrentTrack(true),
			clearLyricsCache: () => this.lyricsService.clearCache(),
			fetchMusixmatchToken: () => this.fetchMusixmatchToken(),
			refreshMusixmatchToken: (providers) => this.refreshMusixmatchToken(providers),
			togglePip: () => void this.togglePip(),
			openSettings: () => this.settingsView.open(),
			loadLyrics: (track, settings, refresh) => this.lyricsService.load(track, settings, refresh),
			refreshLyricsCooldowns: () => this.lyricsService.refreshCooldowns(),
			invalidateLyrics: () => this.lyricsService.invalidate(),
			loadWaveformProfile: (track) => this.waveformService.loadProfile(track),
			getAudioAnalysis: (track) => this.waveformService.getAnalysis(track),
			invalidateAudioAnalysis: (uri) => this.waveformService.invalidateAnalysis(uri),
		});
		this.settings = services.settings;
		this.trackLyricsDelays = services.trackLyricsDelays;
		this.cache = services.cache;
		this.player = services.player;
		this.playbackSynchronizer = services.playbackSynchronizer;
		this.waveformService = services.waveformService;
		this.trackThemeService = services.trackThemeService;
		this.musixmatchTokenService = services.musixmatchTokenService;
		this.lyricsService = services.lyricsService;
		this.trackSession = services.trackSession;
		this.settingsView = services.settingsView;
		this.topbar = services.topbar;
		this.appliedSettings = this.settings.get();

		const app = this;
		this.presentation = new PresentationController({
			get renderer() {
				return app.renderer;
			},
			get introGate() {
				return app.introGate;
			},
			get outroController() {
				return app.outroController;
			},
			get session() {
				return app.session;
			},
			get settings() {
				return app.settings.get();
			},
			get currentTrackUri() {
				return app.currentTrack?.uri;
			},
			get timestampSec() {
				return app.playbackSynchronizer.timestampSec;
			},
			waveformForInterlude: (profile, interlude) => this.waveformService.waveformForInterlude(profile, interlude),
			deferTrackPresentation: (presentation) => this.transitions.defer(presentation),
			reloadCurrentTrack: () => void this.loadCurrentTrack(true),
		});
		this.transitions = new TrackTransitionPresenter({
			get renderer() {
				return app.renderer;
			},
			get settings() {
				return app.settings.get();
			},
			isCurrentEpoch: (epoch) => this.isCurrentEpoch(epoch),
			isCurrentSnapshot: (snapshot) => this.trackSession.isCurrent(snapshot),
			resyncPlayback: () => this.playbackSynchronizer.resync(),
			renderLoadStateNow: (snapshot) => this.presentation.renderLoadStateNow(snapshot),
			presentReadySnapshotNow: (snapshot) => this.presentation.presentReadySnapshotNow(snapshot),
		});
		this.trackDelays = new TrackDelayController(this.trackLyricsDelays, {
			get playingTrack() {
				return app.player.getCurrentTrack();
			},
			get settings() {
				return app.settings.get();
			},
			refreshSettingsView: () => this.settingsView.refreshCurrentTrack(),
			presentation: {
				resyncTimestampSec: () => this.resyncTimestampSec(),
				resumeIntro: (timestampSec) => this.presentation.resumeIntro(timestampSec),
				evaluateOutro: (timestampSec) => this.presentation.evaluateOutro(timestampSec),
				repaintMountedLyrics: (timestampSec) => this.presentation.repaintMountedLyrics(timestampSec),
			},
		});
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
		this.transitions.discard();
		this.trackSession.invalidate();
		this.introGate.endTrackEpoch();
		this.outroController.endTrackEpoch();
		this.presentation.clearRevealedSnapshot();
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
			const revealedSnapshot = this.presentation.revealedSnapshotFor(this.currentTrack);
			if (revealedSnapshot) {
				this.presentation.revealReadySnapshot(revealedSnapshot, this.playbackSynchronizer.timestampSec);
			}
			await this.loadCurrentTrack(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.spicetify.showNotification?.(message, true);
		}
	}

	private closePip(closeWindow = true): void {
		this.directionController.clear();
		this.transitions.discard();
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
		this.transitions.discard();
		this.trackSession.invalidate();
		this.currentTrack = track;
		this.settingsView.refreshCurrentTrack();
		this.presentation.clearRevealedSnapshot();
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
			this.transitions.discard();
			this.trackSession.invalidate();
			this.introGate.endTrackEpoch();
			this.outroController.endTrackEpoch();
			this.presentation.clearRevealedSnapshot();
			this.session.setCover(undefined);
			this.session.applyTheme(undefined);
			this.presentation.showStatus("Waiting for music", "Start playing a Spotify track.");
			return;
		}
		const epoch: TrackEpoch = { id: epochId, uri: track.uri, session, themeGeneration };
		const revealedSnapshot = this.presentation.revealedSnapshotFor(track);
		if (!revealedSnapshot) {
			if (trackChange) {
				this.transitions.begin(track, epoch, trackChange.direction);
			} else if (!this.transitions.hasActiveTransitionFor(epoch)) {
				this.presentation.renderPresentationState({ kind: "loading", track });
			}
		}
		session.setCover(track.coverUrl);
		void this.applyTrackTheme(track, epoch);
		const snapshot = await this.trackSession.load(track, this.settings.get(), refresh);
		if (!snapshot || !this.trackSession.isCurrent(snapshot) || !this.isCurrentEpoch(epoch)) return;
		this.playbackSynchronizer.resync();
		if (!isReadyTrackSessionSnapshot(snapshot)) {
			this.presentation.clearRevealedSnapshot();
			this.introGate.discardPendingSession();
			this.outroController.discardSession();
		}
		this.presentation.renderLoadState(snapshot);
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
			this.presentation.resumeIntro(timestampSec);
		}
		this.presentation.evaluateOutro(timestampSec);
	}

	private onProgressChanged(): void {
		if (!this.session || this.isPlaybackActive) return;
		this.playbackSynchronizer.resync();
		const timestampSec = this.playbackSynchronizer.timestampSec;
		this.presentation.resumeIntro(timestampSec);
		this.presentation.evaluateOutro(timestampSec);
	}

	/** Re-reads the player clock. Returns `undefined` when there is no PiP session to repaint. */
	private resyncTimestampSec(): number | undefined {
		if (!this.session) {
			return undefined;
		}
		this.playbackSynchronizer.resync();
		return this.playbackSynchronizer.timestampSec;
	}

	private fetchMusixmatchToken(): Promise<string | undefined> {
		return this.musixmatchTokenService.refresh(resolveProviderProxyBaseUrl(this.settings.get().providers));
	}

	/** Musixmatch 401 recovery: refreshes the token and persists it, or resolves `undefined` on failure. */
	private async refreshMusixmatchToken(providers: ExtensionSettings["providers"]): Promise<string | undefined> {
		try {
			const token = await this.musixmatchTokenService.refresh(resolveProviderProxyBaseUrl(providers));
			this.settings.update({ providers: { ...providers, musixmatchToken: token } });
			return token;
		} catch {
			return undefined;
		}
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

	private async renderEnrichment(enrichment: TrackSessionEnrichment, initialSnapshot: ReadyTrackSessionSnapshot, epoch: TrackEpoch): Promise<void> {
		const snapshot = await enrichment;
		if (!snapshot || !this.trackSession.isCurrent(snapshot) || !this.isCurrentEpoch(epoch)) {
			return;
		}
		if (!hasRenderableEnrichmentChanges(initialSnapshot, snapshot, this.settings.get())) {
			this.transitions.replacePending(initialSnapshot, snapshot);
			return;
		}
		this.presentation.presentReadySnapshot(snapshot);
	}

	private async applyTrackTheme(track: TrackIdentity, epoch: TrackEpoch): Promise<void> {
		await this.trackThemeService.apply(track, epoch.session, () => this.themeGeneration === epoch.themeGeneration && this.isCurrentEpoch(epoch));
	}

	private tick(deltaTime: number): void {
		if (!this.session) return;
		const settings = this.appliedSettings;
		const motionDeltaTime = settings.motionEnabled && !settings.reduceMotion ? deltaTime : SNAP_DELTA_TIME;
		if (!this.isPlaybackActive) {
			if (this.presentation.hasMountedLyricsPresentation()) {
				this.renderer.update(this.playbackSynchronizer.timestampSec, motionDeltaTime);
			}
			return;
		}
		this.playbackSynchronizer.update(deltaTime, this.isPlaybackActive);
		const timestampSec = this.playbackSynchronizer.timestampSec;
		let didRenderLyrics = this.presentation.tickIntro(timestampSec) === "lyrics-rendered";
		didRenderLyrics = this.presentation.evaluateOutro(timestampSec) === "lyrics-rendered" || didRenderLyrics;
		if (this.presentation.hasMountedLyricsPresentation() && !didRenderLyrics) {
			this.renderer.update(timestampSec, motionDeltaTime);
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
			if (this.presentation.evaluateOutro(timestampSec) === "none") {
				this.presentation.repaintMountedLyrics(timestampSec);
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
			const preservedSnapshot = this.presentation.revealedSnapshotFor(this.currentTrack);
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
		this.presentation.presentReadySnapshot(snapshot);
	}

	/**
	 * Single staleness check for every async continuation scoped to a track: the PiP session is still
	 * the one the work started in, no track change has happened since, and the player is still on that
	 * track. Replaces the 5-6 condition guards this class used to repeat at each await boundary.
	 */
	private isCurrentEpoch(epoch: TrackEpoch): boolean {
		return this.session === epoch.session && this.playbackTrackEpoch === epoch.id && this.currentTrack?.uri === epoch.uri;
	}
}

const isReadyTrackSessionSnapshot = (snapshot: TrackSessionSnapshot): snapshot is ReadyTrackSessionSnapshot => snapshot.loadState.status === "ready";

const sceneDirectionForTrackTransition = (direction: TrackTransitionDirection): SceneTransitionDirection => {
	if (direction === "next" || direction === "previous") {
		return direction;
	}
	return "up";
};

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
