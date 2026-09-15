import type { ExtensionSettings } from "../settings/SettingsStore";
import type { LyricsCache } from "./LyricsCache";
import { LyricsCacheRepository } from "./LyricsCacheRepository";
import { toDisplayLyrics } from "./LyricsDocumentTransforms";
import { LyricsPrefetchController } from "./LyricsPrefetchController";
import { ProviderLoadPipeline, type ProviderLoadPipelineOptions, type ProviderLoadResult } from "./ProviderLoadPipeline";
import type { ProviderRegistry } from "./providers/ProviderRegistry";
import type {
	LyricsDocument,
	LyricsLoadDiagnostics,
	LyricsLoadState,
	LyricsProvider,
	LyricsProviderMetadata,
	ProviderContext,
	ProviderId,
	TrackIdentity,
} from "./types";

type InFlightEntry = {
	/** The requestId this entry was started under. A stale entry (superseded by an unrelated key) is never reused. */
	requestId: number;
	promise: Promise<LyricsLoadState>;
};

type PrefetchedLoad = {
	loaded: ProviderLoadResult;
	primaryProvider?: ProviderId;
};

export type LyricsServiceOptions = Partial<ProviderLoadPipelineOptions> & {
	prefetchTtlMs?: number;
};

export class LyricsService {
	private requestId = 0;
	private abortController?: AbortController;
	private readonly inFlight = new Map<string, InFlightEntry>();
	private readonly cacheRepository: LyricsCacheRepository;
	private readonly providerPipeline: ProviderLoadPipeline;
	private readonly prefetchController: LyricsPrefetchController<PrefetchedLoad>;

	public constructor(
		private readonly registry: ProviderRegistry,
		cache: LyricsCache,
		private readonly contextFactory: (settings: ExtensionSettings) => ProviderContext,
		options: LyricsServiceOptions = {}
	) {
		this.cacheRepository = new LyricsCacheRepository(cache);
		this.providerPipeline = new ProviderLoadPipeline(contextFactory, options);
		this.prefetchController = new LyricsPrefetchController(options.now, options.prefetchTtlMs);
	}

	public clearCache(): void {
		this.cacheRepository.clear();
		this.prefetchController.cancel();
	}

	public invalidate(): void {
		this.requestId += 1;
		this.abortController?.abort();
		this.abortController = undefined;
	}

	/**
	 * Fetches one queued track without affecting the foreground request or persistent cache. A later
	 * `load()` for the same track promotes this work and persists it under the usual canonical policy.
	 */
	public async prefetch(track: TrackIdentity, settings: ExtensionSettings, preferredProvider?: ProviderId): Promise<void> {
		if (track.isLocal) {
			return;
		}
		const providers = this.providersFor(track, settings, preferredProvider);
		const primaryProvider = providers.find((provider) => provider.supports(track));
		if (!primaryProvider || this.cacheRepository.lookup(track.uri, primaryProvider.id, false).status === "hit") {
			return;
		}
		const key = this.prefetchKey(track, settings, preferredProvider);
		const promise = this.prefetchController.prepare(key, async (signal) => ({
			loaded: await this.providerPipeline.load(track, settings, providers, () => !signal.aborted, signal, { maxAttempts: 1 }),
			primaryProvider: primaryProvider.id,
		}));
		await promise.catch(() => undefined);
	}

	/** Cancels a queued-track request and drops its in-memory result. */
	public clearPrefetch(): void {
		this.prefetchController.cancel();
	}

	public async load(
		track: TrackIdentity,
		settings: ExtensionSettings,
		refresh = false,
		preferredProvider?: import("../domain/types").ProviderId
	): Promise<LyricsLoadState> {
		if (track.isLocal) {
			this.requestId += 1;
			this.abortController?.abort();
			this.abortController = undefined;
			return { status: "empty", track, reason: "unsupported-local" };
		}

		const key = `${track.uri}|${refresh}|${preferredProvider ?? "default"}`;
		const existing = this.inFlight.get(key);
		if (existing && existing.requestId === this.requestId) {
			return existing.promise;
		}

		const currentRequest = ++this.requestId;
		this.abortController?.abort();
		if (refresh) {
			this.prefetchController.cancel();
		}
		const controller = new AbortController();
		this.abortController = controller;

		const entry: InFlightEntry = { requestId: currentRequest, promise: Promise.resolve({ status: "idle" }) };
		entry.promise = this.loadNetwork(track, settings, refresh, currentRequest, controller.signal, preferredProvider).finally(() => {
			if (this.inFlight.get(key) === entry) {
				this.inFlight.delete(key);
			}
		});
		this.inFlight.set(key, entry);
		return entry.promise;
	}

	public refreshCooldowns(): void {
		this.providerPipeline.clearCooldowns();
	}

	/** Loads an optional provider supplement after the canonical lyric document is visible. */
	public async fetchTranslation(
		track: TrackIdentity,
		lyrics: LyricsDocument,
		providerId: ProviderId,
		metadata: LyricsProviderMetadata | undefined,
		settings: ExtensionSettings,
		signal?: AbortSignal
	): Promise<LyricsDocument | undefined> {
		if (!metadata) {
			return undefined;
		}
		const provider = this.registry.all().find((candidate) => candidate.id === providerId);
		if (!provider?.fetchTranslation || signal?.aborted) {
			return undefined;
		}
		try {
			const context = { ...this.contextFactory(settings), signal };
			return await provider.fetchTranslation(track, lyrics, metadata, context);
		} catch {
			return undefined;
		}
	}

	private async loadNetwork(
		track: TrackIdentity,
		settings: ExtensionSettings,
		refresh: boolean,
		currentRequest: number,
		signal: AbortSignal,
		preferredProvider?: import("../domain/types").ProviderId
	): Promise<LyricsLoadState> {
		const providers = this.providersFor(track, settings, preferredProvider);
		const primaryProvider = providers.find((provider) => provider.supports(track));
		const cached = this.cacheRepository.lookup(track.uri, primaryProvider?.id, refresh);
		const diagnostics: LyricsLoadDiagnostics = {
			cache: cached.cache,
			attempts: [],
		};
		if (cached.status === "hit") {
			return {
				status: "ready",
				track,
				lyrics: cached.lyrics,
				provider: cached.provider,
				source: "cache",
				metadata: cached.metadata,
				diagnostics,
			};
		}

		if (!refresh) {
			const prefetched = this.prefetchController.get(this.prefetchKey(track, settings, preferredProvider));
			diagnostics.prefetch = prefetched ? "hit" : "miss";
			if (prefetched) {
				try {
					const prefetchResult = await prefetched;
					if (currentRequest !== this.requestId) {
						return { status: "idle" };
					}
					diagnostics.attempts = prefetchResult.loaded.attempts;
					if (prefetchResult.loaded.state.status !== "error") {
						return this.toLoadState(track, prefetchResult.loaded, primaryProvider?.id, diagnostics);
					}
				} catch {
					// A foreground load gets the normal retry budget when its prefetch failed.
				}
			}
		}

		const loaded = await this.providerPipeline.load(track, settings, providers, () => currentRequest === this.requestId && !signal.aborted, signal);
		if (currentRequest !== this.requestId) {
			return { status: "idle" };
		}
		diagnostics.attempts = loaded.attempts;
		return this.toLoadState(track, loaded, primaryProvider?.id, diagnostics);
	}

	private toLoadState(
		track: TrackIdentity,
		loaded: ProviderLoadResult,
		primaryProvider: ProviderId | undefined,
		diagnostics: LyricsLoadDiagnostics
	): LyricsLoadState {
		if (loaded.state.status === "ready") {
			this.cacheRepository.storeCanonical(track.uri, loaded.state.lyrics, loaded.state.provider, primaryProvider, loaded.state.metadata);
			return {
				status: "ready",
				track,
				lyrics: toDisplayLyrics(loaded.state.lyrics),
				provider: loaded.state.provider,
				source: "network",
				metadata: loaded.state.metadata,
				diagnostics,
			};
		}
		if (loaded.state.status === "empty") {
			return { status: "empty", track, reason: loaded.state.reason, diagnostics };
		}
		if (loaded.state.status === "error") {
			return { status: "error", track, message: loaded.state.message, diagnostics };
		}
		return { status: "idle" };
	}

	private providersFor(track: TrackIdentity, settings: ExtensionSettings, preferredProvider?: ProviderId): LyricsProvider[] {
		const configuredProviders = this.registry.ordered(settings);
		const preferred = preferredProvider
			? configuredProviders.find((provider) => provider.id === preferredProvider && provider.supports(track))
			: undefined;
		return preferred ? [preferred, ...configuredProviders.filter((provider) => provider !== preferred)] : configuredProviders;
	}

	private prefetchKey(track: TrackIdentity, settings: ExtensionSettings, preferredProvider?: ProviderId): string {
		return JSON.stringify({
			track: [track.uri, track.id, track.title, track.artist, track.album, track.durationMs],
			preferredProvider,
			providers: settings.providers.order.map((id) => [id, settings.providers.enabled[id]]),
			musixmatchProxy: [settings.providers.musixmatchProxyMode, settings.providers.musixmatchProxyBaseUrl],
			musixmatchTokenRevision: tokenFingerprint(settings.providers.musixmatchToken),
		});
	}
}

/** Stable non-secret token revision for invalidating prefetched work after token rotation. */
const tokenFingerprint = (token: string | undefined): string => {
	if (!token) {
		return "missing";
	}
	let hash = 2166136261;
	for (const character of token) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return `present:${(hash >>> 0).toString(16)}`;
};
