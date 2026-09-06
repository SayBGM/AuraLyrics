import { LyricsCache } from "../lyrics/LyricsCache";
import { LyricsService } from "../lyrics/LyricsService";
import { LrclibProvider } from "../lyrics/providers/LrclibProvider";
import { MusixmatchProvider } from "../lyrics/providers/MusixmatchProvider";
import { type MusixmatchTokenResponse, MusixmatchTokenService } from "../lyrics/providers/MusixmatchTokenService";
import { ProviderRegistry } from "../lyrics/providers/ProviderRegistry";
import { SpotifyProvider } from "../lyrics/providers/SpotifyProvider";
import { SpicetifyStorageAdapter } from "../platform/SpicetifyStorageAdapter";
import { PlaybackSynchronizer } from "../player/PlaybackSynchronizer";
import { SpicetifyPlayerAdapter } from "../player/SpicetifyPlayerAdapter";
import { AudioAnalysisWaveformService } from "../renderer/AudioAnalysisWaveformService";
import type { SpicetifyGlobal } from "../runtime/spicetify";
import { SettingsStore } from "../settings/SettingsStore";
import { SettingsView } from "../settings/SettingsView";
import type { ExtensionSettings } from "../settings/settingsSchema";
import type { CurrentTrackLyricsDelayState } from "../settings/settingsViewTypes";
import { TrackLyricsDelayStore } from "../settings/TrackLyricsDelayStore";
import { TopbarController } from "./TopbarController";
import { TrackSessionController, type TrackSessionLyricsService, type TrackSessionWaveformService } from "./TrackSessionController";
import { TrackThemeService } from "./TrackThemeService";

/**
 * Callbacks the wired services need from the orchestrator. Every member is invoked lazily (after the
 * `ExtensionApp` constructor has finished assigning its fields), so the wiring below can be built
 * before the controllers that ultimately answer these calls exist.
 */
export type ExtensionServicesHost = {
	/** Playback delay in ms for the track currently playing, including any per-track override. */
	resolvedLyricsDelayMs(): number;
	currentTrackLyricsDelayState(): CurrentTrackLyricsDelayState | undefined;
	adjustCurrentTrackLyricsDelay(uri: string, deltaMs: number): boolean;
	resetCurrentTrackLyricsDelay(uri: string): boolean;
	/** Settings "refresh lyrics" action. */
	reloadCurrentTrack(): Promise<void>;
	/** Settings "clear cache" action. */
	clearLyricsCache(): void;
	/** Settings "generate token" action. */
	fetchMusixmatchToken(): Promise<string | undefined>;
	/** Musixmatch 401 recovery: refreshes and persists the token, or resolves `undefined` on failure. */
	refreshMusixmatchToken(providers: ExtensionSettings["providers"]): Promise<string | undefined>;
	togglePip(): void;
	openSettings(): void;
	/**
	 * Track-session delegates. These route back through the host instead of closing over the locals
	 * created below so they read `ExtensionApp`'s live `lyricsService` / `waveformService` fields.
	 */
	loadLyrics: TrackSessionLyricsService["load"];
	refreshLyricsCooldowns: TrackSessionLyricsService["refreshCooldowns"];
	invalidateLyrics: TrackSessionLyricsService["invalidate"];
	loadWaveformProfile: TrackSessionWaveformService["loadProfile"];
	getAudioAnalysis: TrackSessionWaveformService["getAnalysis"];
	invalidateAudioAnalysis(uri: string): void;
};

export type ExtensionServices = {
	settings: SettingsStore;
	trackLyricsDelays: TrackLyricsDelayStore;
	cache: LyricsCache;
	player: SpicetifyPlayerAdapter;
	playbackSynchronizer: PlaybackSynchronizer;
	waveformService: AudioAnalysisWaveformService;
	trackThemeService: TrackThemeService;
	musixmatchTokenService: MusixmatchTokenService;
	lyricsService: LyricsService;
	trackSession: TrackSessionController;
	settingsView: SettingsView;
	topbar: TopbarController;
};

export const resolveProviderProxyBaseUrl = (providers: ExtensionSettings["providers"]): string | undefined =>
	providers.musixmatchProxyMode === "custom" && providers.musixmatchProxyBaseUrl ? providers.musixmatchProxyBaseUrl : undefined;

/**
 * Builds every long-lived collaborator `ExtensionApp` orchestrates. Pure wiring: the only behaviour
 * here is which adapter is handed to which service.
 */
export const createExtensionServices = (spicetify: SpicetifyGlobal, host: ExtensionServicesHost): ExtensionServices => {
	const storage = new SpicetifyStorageAdapter(spicetify);
	const settings = new SettingsStore(storage);
	const trackLyricsDelays = new TrackLyricsDelayStore(storage);
	const cache = new LyricsCache(storage);
	const registry = new ProviderRegistry([new SpotifyProvider(), new LrclibProvider(), new MusixmatchProvider()]);
	const player = new SpicetifyPlayerAdapter(spicetify);
	const playbackSynchronizer = new PlaybackSynchronizer(() => player.getTimestamp(host.resolvedLyricsDelayMs()));
	const waveformService = new AudioAnalysisWaveformService(async (uri) => spicetify.getAudioData?.(uri));
	const trackThemeService = new TrackThemeService(spicetify.colorExtractor);

	const musixmatchTokenService = new MusixmatchTokenService((url, body, headers) => {
		if (!spicetify.CosmosAsync) {
			throw new Error("Spicetify.CosmosAsync is not available.");
		}
		return spicetify.CosmosAsync.get<MusixmatchTokenResponse>(url, body, headers);
	}, window.fetch.bind(window));

	const lyricsService = new LyricsService(registry, cache, (activeSettings) => ({
		cosmosGet: (url, body, headers) => {
			if (!spicetify.CosmosAsync) {
				throw new Error("Spicetify.CosmosAsync is not available.");
			}
			return spicetify.CosmosAsync.get(url, body, headers);
		},
		fetch: window.fetch.bind(window),
		userAgent: `spicetify v${spicetify.Config?.version ?? "unknown"} AuraLyrics`,
		musixmatchToken: activeSettings.providers.musixmatchToken,
		proxyBaseUrl: resolveProviderProxyBaseUrl(activeSettings.providers),
		refreshMusixmatchToken: () => host.refreshMusixmatchToken(activeSettings.providers),
	}));

	const trackSession = new TrackSessionController(
		{
			load: (track, activeSettings, refresh) => host.loadLyrics(track, activeSettings, refresh),
			refreshCooldowns: () => host.refreshLyricsCooldowns(),
			invalidate: () => host.invalidateLyrics(),
		},
		{
			loadProfile: (track) => host.loadWaveformProfile(track),
			getAnalysis: (track) => host.getAudioAnalysis(track),
			invalidateAnalysis: (track) => host.invalidateAudioAnalysis(track.uri),
		}
	);

	const settingsView = new SettingsView(settings, registry.all(), {
		getCurrentTrackLyricsDelay: () => host.currentTrackLyricsDelayState(),
		onAdjustCurrentTrackLyricsDelay: (uri, deltaMs) => host.adjustCurrentTrackLyricsDelay(uri, deltaMs),
		onRefreshLyrics: () => host.reloadCurrentTrack(),
		onClearCache: () => host.clearLyricsCache(),
		onMusixmatchTokenAccepted: () => undefined,
		onRefreshMusixmatchToken: () => host.fetchMusixmatchToken(),
		onResetCurrentTrackLyricsDelay: (uri) => host.resetCurrentTrackLyricsDelay(uri),
	});

	const topbar = new TopbarController(
		spicetify,
		() => host.togglePip(),
		() => host.openSettings()
	);

	return {
		settings,
		trackLyricsDelays,
		cache,
		player,
		playbackSynchronizer,
		waveformService,
		trackThemeService,
		musixmatchTokenService,
		lyricsService,
		trackSession,
		settingsView,
		topbar,
	};
};
