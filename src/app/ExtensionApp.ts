import { LyricsCache } from "../lyrics/LyricsCache";
import { LyricsService } from "../lyrics/LyricsService";
import { LrclibProvider } from "../lyrics/providers/LrclibProvider";
import { MusixmatchProvider } from "../lyrics/providers/MusixmatchProvider";
import { type MusixmatchTokenResponse, MusixmatchTokenService } from "../lyrics/providers/MusixmatchTokenService";
import { NeteaseProvider } from "../lyrics/providers/NeteaseProvider";
import { ProviderRegistry } from "../lyrics/providers/ProviderRegistry";
import { SpotifyProvider } from "../lyrics/providers/SpotifyProvider";
import type { LyricsLoadState, TrackIdentity } from "../lyrics/types";
import { DocumentPipController, type PipSession } from "../pip/DocumentPipController";
import { SpicetifyStorageAdapter } from "../platform/SpicetifyStorageAdapter";
import { PlaybackClock } from "../player/PlaybackClock";
import { SpicetifyPlayerAdapter } from "../player/SpicetifyPlayerAdapter";
import { LyricsRenderer } from "../renderer/LyricsRenderer";
import type { SpicetifyGlobal } from "../runtime/spicetify";
import { SettingsStore } from "../settings/SettingsStore";
import { SettingsView } from "../settings/SettingsView";
import { pipStyles } from "../styles/pipStyles";
import { MusicStateMachine } from "./MusicStateMachine";
import { TopbarController } from "./TopbarController";

export class ExtensionApp {
	private readonly storage: SpicetifyStorageAdapter;
	private readonly settings: SettingsStore;
	private readonly player: SpicetifyPlayerAdapter;
	private readonly pip = new DocumentPipController();
	private readonly renderer = new LyricsRenderer();
	private readonly stateMachine = new MusicStateMachine();
	private readonly cache: LyricsCache;
	private readonly registry = new ProviderRegistry([new SpotifyProvider(), new LrclibProvider(), new MusixmatchProvider(), new NeteaseProvider()]);
	private readonly lyricsService: LyricsService;
	private readonly musixmatchTokenService: MusixmatchTokenService;
	private readonly settingsView: SettingsView;
	private readonly topbar: TopbarController;
	private readonly disposers: Array<() => void> = [];
	private clock?: PlaybackClock;
	private session?: PipSession;
	private currentTrack?: TrackIdentity;
	private lastLoadState: LyricsLoadState = { status: "idle" };
	private started = false;

	public constructor(private readonly spicetify: SpicetifyGlobal) {
		this.storage = new SpicetifyStorageAdapter(spicetify);
		this.settings = new SettingsStore(this.storage);
		this.cache = new LyricsCache(this.storage);
		this.player = new SpicetifyPlayerAdapter(spicetify);
		this.musixmatchTokenService = new MusixmatchTokenService((url, body, headers) => {
			if (!this.spicetify.CosmosAsync) {
				throw new Error("Spicetify.CosmosAsync is not available.");
			}
			return this.spicetify.CosmosAsync.get<MusixmatchTokenResponse>(url, body, headers);
		});
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
			this.settings.subscribe(() => this.applySettings()),
			this.pip.closed.subscribe(() => this.closePip(false))
		);
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
			this.session = await this.pip.open(this.settings.get(), pipStyles, {
				isPlaying: this.player.isPlaying(),
				onPrevious: () => this.player.previous(),
				onTogglePlay: () => this.player.togglePlay(),
				onNext: () => this.player.next(),
				onClose: () => this.closePip(),
			});
			this.stateMachine.dispatch({ type: "pipReady" });
			this.topbar.setActive(true);
			this.clock = new PlaybackClock(this.session.window, (deltaTime) => this.tick(deltaTime));
			this.clock.start();
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
			this.showStatus("Waiting for music", "Start playing a Spotify track.");
			this.stateMachine.dispatch({ type: "invalidTrack" });
			return;
		}
		this.session.setCover(track.coverUrl);
		this.stateMachine.dispatch({ type: "validTrack" });
		this.showStatus("Loading lyrics", track.title);
		this.lastLoadState = await this.lyricsService.load(track, this.settings.get(), refresh);
		this.renderLoadState(this.lastLoadState);
	}

	private async refreshMusixmatchToken(): Promise<string | undefined> {
		const token = await this.musixmatchTokenService.refresh();
		this.spicetify.showNotification?.("Musixmatch token updated.");
		return token;
	}

	private renderLoadState(state: LyricsLoadState): void {
		if (!this.session) {
			return;
		}
		if (state.status === "ready") {
			this.stateMachine.dispatch({ type: "lyricsReady" });
			this.renderer.mount(this.session.root, state.lyrics, this.settings.get(), state.provider);
			return;
		}
		if (state.status === "empty") {
			this.stateMachine.dispatch({ type: "noLyrics", message: state.reason });
			this.showStatus(state.reason === "instrumental" ? "Instrumental" : "No synced lyrics", state.track.title, "Retry current track");
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

	private tick(deltaTime: number): void {
		if (!this.session || this.lastLoadState.status !== "ready") {
			return;
		}
		const settings = this.settings.get();
		const timestamp = this.player.getTimestamp(settings.lyricsDelayMs);
		this.session.setPlaying(this.player.isPlaying());
		this.renderer.update(timestamp, settings.motionEnabled && !settings.reduceMotion ? deltaTime : 1);
	}

	private applySettings(): void {
		this.session?.applySettings(this.settings.get());
		if (this.session && this.lastLoadState.status === "ready") {
			this.renderer.mount(this.session.root, this.lastLoadState.lyrics, this.settings.get(), this.lastLoadState.provider);
		}
	}
}
