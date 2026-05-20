import type { ExtensionSettings } from "../settings/SettingsStore";
import { addInterludes } from "./InterludeBuilder";
import type { LyricsCache } from "./LyricsCache";
import { normalizeLyrics } from "./LyricsNormalizer";
import type { ProviderRegistry } from "./providers/ProviderRegistry";
import type { LyricsLoadState, LyricsProvider, ProviderContext, ProviderId, TrackIdentity } from "./types";

type LyricsServiceOptions = {
	maxAttempts: number;
	now: () => number;
	retryDelayMs: number;
	temporaryUnavailableCooldownMs: number;
};

const DEFAULT_OPTIONS: LyricsServiceOptions = {
	maxAttempts: 3,
	now: () => Date.now(),
	retryDelayMs: 450,
	temporaryUnavailableCooldownMs: 1000 * 60 * 5,
};

export class LyricsService {
	private requestId = 0;
	private readonly cooldownUntil = new Map<ProviderId, number>();

	public constructor(
		private readonly registry: ProviderRegistry,
		private readonly cache: LyricsCache,
		private readonly contextFactory: (settings: ExtensionSettings) => ProviderContext,
		private readonly options: Partial<LyricsServiceOptions> = {}
	) {}

	public clearCache(): void {
		this.cache.clear();
	}

	public async load(track: TrackIdentity, settings: ExtensionSettings, refresh = false): Promise<LyricsLoadState> {
		if (track.isLocal) {
			return { status: "empty", track, reason: "unsupported-local" };
		}
		const currentRequest = ++this.requestId;
		const providers = this.registry.ordered(settings);
		const primaryProvider = providers.find((provider) => provider.supports(track));
		const cached = !refresh ? this.cache.get(track.uri) : undefined;
		if (cached && cached.provider === primaryProvider?.id) {
			return { status: "ready", track, lyrics: cached.lyrics, provider: cached.provider };
		}

		const options = { ...DEFAULT_OPTIONS, ...this.options };
		for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
			const state = await this.tryLoadOnce(track, settings, currentRequest, providers, primaryProvider);
			if (state.status !== "error" || attempt === options.maxAttempts || currentRequest !== this.requestId) {
				return state;
			}
			await this.delay(options.retryDelayMs * attempt);
		}
		return { status: "error", track, message: "Lyrics failed after retries." };
	}

	private async tryLoadOnce(
		track: TrackIdentity,
		settings: ExtensionSettings,
		currentRequest: number,
		providers: LyricsProvider[],
		primaryProvider: LyricsProvider | undefined
	): Promise<LyricsLoadState> {
		const errors: string[] = [];
		const options = { ...DEFAULT_OPTIONS, ...this.options };
		for (const provider of providers) {
			if (!provider.supports(track)) {
				continue;
			}
			if (this.isCoolingDown(provider.id, options.now())) {
				continue;
			}
			try {
				const result = await provider.fetch(track, this.contextFactory(settings));
				if (currentRequest !== this.requestId) {
					return { status: "idle" };
				}
				if (result.ok) {
					const lyrics = addInterludes(normalizeLyrics(result.lyrics));
					if (provider.id === primaryProvider?.id) {
						this.cache.set(track.uri, lyrics, provider.id);
					}
					return { status: "ready", track, lyrics, provider: provider.id };
				}
				if (result.reason === "temporarily-unavailable") {
					this.cooldownUntil.set(provider.id, options.now() + (result.cooldownMs ?? options.temporaryUnavailableCooldownMs));
					continue;
				}
				if (result.reason === "instrumental") {
					return { status: "empty", track, reason: "instrumental" };
				}
				if (result.message) {
					errors.push(`${provider.id}: ${result.message}`);
				}
			} catch (error) {
				errors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (errors.length > 0) {
			return { status: "error", track, message: errors.join("\n") };
		}
		return { status: "empty", track, reason: "no-lyrics" };
	}

	private isCoolingDown(providerId: ProviderId, now: number): boolean {
		const until = this.cooldownUntil.get(providerId);
		if (until === undefined) {
			return false;
		}
		if (until <= now) {
			this.cooldownUntil.delete(providerId);
			return false;
		}
		return true;
	}

	private delay(ms: number): Promise<void> {
		if (ms <= 0) {
			return Promise.resolve();
		}
		return new Promise((resolve) => window.setTimeout(resolve, ms));
	}
}
