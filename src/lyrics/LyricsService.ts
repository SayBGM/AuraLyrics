import type { ExtensionSettings } from "../settings/SettingsStore";
import type { LyricsCache } from "./LyricsCache";
import { LyricsCacheRepository } from "./LyricsCacheRepository";
import { toDisplayLyrics } from "./LyricsDocumentTransforms";
import { ProviderLoadPipeline, type ProviderLoadPipelineOptions } from "./ProviderLoadPipeline";
import type { ProviderRegistry } from "./providers/ProviderRegistry";
import type { LyricsLoadDiagnostics, LyricsLoadState, ProviderContext, TrackIdentity } from "./types";

export class LyricsService {
	private requestId = 0;
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

	public async load(track: TrackIdentity, settings: ExtensionSettings, refresh = false): Promise<LyricsLoadState> {
		if (track.isLocal) {
			return { status: "empty", track, reason: "unsupported-local" };
		}
		const currentRequest = ++this.requestId;
		const providers = this.registry.ordered(settings);
		const primaryProvider = providers.find((provider) => provider.supports(track));
		const cached = this.cacheRepository.lookup(track.uri, primaryProvider?.id, refresh);
		const diagnostics: LyricsLoadDiagnostics = {
			cache: cached.cache,
			attempts: [],
		};
		if (cached.lyrics && cached.provider) {
			return {
				status: "ready",
				track,
				lyrics: cached.lyrics,
				provider: cached.provider,
				source: "cache",
				diagnostics,
			};
		}

		const loaded = await this.providerPipeline.load(track, settings, providers, () => currentRequest === this.requestId);
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

	public refreshCooldowns(): void {
		this.providerPipeline.clearCooldowns();
	}
}
