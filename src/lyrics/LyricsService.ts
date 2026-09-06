import type { ExtensionSettings } from "../settings/SettingsStore";
import type { LyricsCache } from "./LyricsCache";
import { LyricsCacheRepository } from "./LyricsCacheRepository";
import { toDisplayLyrics } from "./LyricsDocumentTransforms";
import { ProviderLoadPipeline, type ProviderLoadPipelineOptions } from "./ProviderLoadPipeline";
import type { ProviderRegistry } from "./providers/ProviderRegistry";
import type { LyricsLoadDiagnostics, LyricsLoadState, ProviderContext, TrackIdentity } from "./types";

type InFlightEntry = {
	/** The requestId this entry was started under. A stale entry (superseded by an unrelated key) is never reused. */
	requestId: number;
	promise: Promise<LyricsLoadState>;
};

export class LyricsService {
	private requestId = 0;
	private abortController?: AbortController;
	private readonly inFlight = new Map<string, InFlightEntry>();
	private readonly cacheRepository: LyricsCacheRepository;
	private readonly providerPipeline: ProviderLoadPipeline;

	public constructor(
		private readonly registry: ProviderRegistry,
		cache: LyricsCache,
		contextFactory: (settings: ExtensionSettings) => ProviderContext,
		options: Partial<ProviderLoadPipelineOptions> = {}
	) {
		this.cacheRepository = new LyricsCacheRepository(cache);
		this.providerPipeline = new ProviderLoadPipeline(contextFactory, options);
	}

	public clearCache(): void {
		this.cacheRepository.clear();
	}

	public invalidate(): void {
		this.requestId += 1;
		this.abortController?.abort();
		this.abortController = undefined;
	}

	public async load(track: TrackIdentity, settings: ExtensionSettings, refresh = false): Promise<LyricsLoadState> {
		if (track.isLocal) {
			this.requestId += 1;
			this.abortController?.abort();
			this.abortController = undefined;
			return { status: "empty", track, reason: "unsupported-local" };
		}

		const key = `${track.uri}|${refresh}`;
		const existing = this.inFlight.get(key);
		if (existing && existing.requestId === this.requestId) {
			return existing.promise;
		}

		const currentRequest = ++this.requestId;
		this.abortController?.abort();
		const controller = new AbortController();
		this.abortController = controller;

		const entry: InFlightEntry = { requestId: currentRequest, promise: Promise.resolve({ status: "idle" }) };
		entry.promise = this.loadNetwork(track, settings, refresh, currentRequest, controller.signal).finally(() => {
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

	private async loadNetwork(
		track: TrackIdentity,
		settings: ExtensionSettings,
		refresh: boolean,
		currentRequest: number,
		signal: AbortSignal
	): Promise<LyricsLoadState> {
		const providers = this.registry.ordered(settings);
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
				diagnostics,
			};
		}

		const loaded = await this.providerPipeline.load(track, settings, providers, () => currentRequest === this.requestId, signal);
		if (currentRequest !== this.requestId) {
			return { status: "idle" };
		}
		diagnostics.attempts = loaded.attempts;
		if (loaded.state.status === "ready") {
			this.cacheRepository.storeCanonical(track.uri, loaded.state.lyrics, loaded.state.provider, primaryProvider?.id);
			return {
				status: "ready",
				track,
				lyrics: toDisplayLyrics(loaded.state.lyrics),
				provider: loaded.state.provider,
				source: "network",
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
}
