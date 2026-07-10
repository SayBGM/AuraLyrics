import type { ExtensionSettings } from "../settings/SettingsStore";
import { addInterludes, rebuildInterludes } from "./InterludeBuilder";
import type { LyricsCache } from "./LyricsCache";
import { normalizeLyrics } from "./LyricsNormalizer";
import { validateLyrics } from "./LyricsValidator";
import type { ProviderRegistry } from "./providers/ProviderRegistry";
import { splitHangulSyllables } from "./splitHangulSyllables";
import type {
	LyricsCacheStatus,
	LyricsDocument,
	LyricsLoadDiagnostics,
	LyricsLoadState,
	LyricsProvider,
	ProviderContext,
	ProviderId,
	TrackIdentity,
} from "./types";

// Word-level syllable providers (Musixmatch) sync whole Hangul words as one token;
// split them into per-character syllables so the gradient sweep isn't word-at-a-time.
const withHangulSplit = (lyrics: LyricsDocument): LyricsDocument => (lyrics.type === "syllable" ? splitHangulSyllables(lyrics) : lyrics);

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
		const diagnostics: LyricsLoadDiagnostics = {
			cache: cacheStatus(refresh, cached?.provider, primaryProvider?.id),
			attempts: [],
		};
		if (cached && cached.provider === primaryProvider?.id) {
			const lyrics = withHangulSplit(rebuildInterludes(cached.lyrics));
			return {
				status: "ready",
				track,
				lyrics,
				provider: cached.provider,
				source: "cache",
				diagnostics,
			};
		}

		const options = { ...DEFAULT_OPTIONS, ...this.options };
		for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
			const state = await this.tryLoadOnce(track, settings, currentRequest, providers, primaryProvider, diagnostics);
			if (state.status !== "error" || attempt === options.maxAttempts || currentRequest !== this.requestId) {
				return state;
			}
			await this.delay(options.retryDelayMs * attempt);
		}
		return {
			status: "error",
			track,
			message: "Lyrics failed after retries.",
			diagnostics,
		};
	}

	public refreshCooldowns(): void {
		this.cooldownUntil.clear();
	}

	private async tryLoadOnce(
		track: TrackIdentity,
		settings: ExtensionSettings,
		currentRequest: number,
		providers: LyricsProvider[],
		primaryProvider: LyricsProvider | undefined,
		diagnostics: LyricsLoadDiagnostics
	): Promise<LyricsLoadState> {
		const errors: string[] = [];
		const options = { ...DEFAULT_OPTIONS, ...this.options };
		for (const provider of providers) {
			if (!provider.supports(track)) {
				continue;
			}
			if (this.isCoolingDown(provider.id, options.now())) {
				diagnostics.attempts.push({
					provider: provider.id,
					status: "cooldown",
				});
				continue;
			}
			try {
				const result = await provider.fetch(track, this.contextFactory(settings));
				if (currentRequest !== this.requestId) {
					return { status: "idle" };
				}
				if (result.ok) {
					const lyrics = validateLyrics(addInterludes(normalizeLyrics(result.lyrics)));
					if (provider.id === primaryProvider?.id) {
						this.cache.set(track.uri, lyrics, provider.id);
					}
					diagnostics.attempts.push({
						provider: provider.id,
						status: "success",
					});
					return {
						status: "ready",
						track,
						lyrics: withHangulSplit(lyrics),
						provider: provider.id,
						source: "network",
						diagnostics,
					};
				}
				if (result.reason === "temporarily-unavailable") {
					this.cooldownUntil.set(provider.id, options.now() + (result.cooldownMs ?? options.temporaryUnavailableCooldownMs));
					diagnostics.attempts.push({
						provider: provider.id,
						status: "temporarily-unavailable",
						message: result.message,
					});
					continue;
				}
				if (result.reason === "instrumental") {
					diagnostics.attempts.push({
						provider: provider.id,
						status: "instrumental",
						message: result.message,
					});
					continue;
				}
				diagnostics.attempts.push({
					provider: provider.id,
					status: result.reason === "no-lyrics" ? "no-lyrics" : "error",
					message: result.message,
				});
				if (result.message) {
					errors.push(`${provider.id}: ${result.message}`);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				diagnostics.attempts.push({
					provider: provider.id,
					status: "error",
					message,
				});
				errors.push(`${provider.id}: ${message}`);
			}
		}

		if (errors.length > 0) {
			return {
				status: "error",
				track,
				message: errors.join("\n"),
				diagnostics,
			};
		}
		return { status: "empty", track, reason: "no-lyrics", diagnostics };
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

const cacheStatus = (refresh: boolean, cachedProvider: ProviderId | undefined, primaryProvider: ProviderId | undefined): LyricsCacheStatus => {
	if (refresh) {
		return { status: "bypassed", primaryProvider };
	}
	if (!cachedProvider) {
		return { status: "miss", primaryProvider };
	}
	if (cachedProvider === primaryProvider) {
		return { status: "hit", provider: cachedProvider, primaryProvider };
	}
	return {
		status: "provider-mismatch",
		provider: cachedProvider,
		primaryProvider,
	};
};
