import type { ExtensionSettings } from "../settings/SettingsStore";
import { prepareProviderLyrics } from "./LyricsDocumentTransforms";
import type { LyricsDocument, LyricsProvider, ProviderAttempt, ProviderContext, ProviderId, TrackIdentity } from "./types";

export type ProviderLoadPipelineOptions = {
	maxAttempts: number;
	now: () => number;
	retryDelayMs: number;
	temporaryUnavailableCooldownMs: number;
};

const DEFAULT_OPTIONS: ProviderLoadPipelineOptions = {
	maxAttempts: 3,
	now: () => Date.now(),
	retryDelayMs: 450,
	temporaryUnavailableCooldownMs: 1000 * 60 * 5,
};

export type ProviderLoadState =
	| { status: "idle" }
	| { status: "ready"; lyrics: LyricsDocument; provider: ProviderId }
	| { status: "empty"; reason: "no-lyrics" | "instrumental" }
	| { status: "error"; message: string };

export type ProviderLoadResult = {
	state: ProviderLoadState;
	attempts: ProviderAttempt[];
};

export class ProviderLoadPipeline {
	private readonly cooldownUntil = new Map<ProviderId, number>();

	public constructor(
		private readonly contextFactory: (settings: ExtensionSettings) => ProviderContext,
		private readonly options: Partial<ProviderLoadPipelineOptions> = {}
	) {}

	public async load(
		track: TrackIdentity,
		settings: ExtensionSettings,
		providers: LyricsProvider[],
		isCurrent: () => boolean
	): Promise<ProviderLoadResult> {
		const attempts: ProviderAttempt[] = [];
		const options = this.resolvedOptions();
		for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
			const state = await this.tryLoadOnce(track, settings, providers, attempts, isCurrent);
			if (state.status !== "error" || attempt === options.maxAttempts || !isCurrent()) {
				return { state, attempts };
			}
			await this.delay(options.retryDelayMs * attempt);
		}
		return {
			state: { status: "error", message: "Lyrics failed after retries." },
			attempts,
		};
	}

	public clearCooldowns(): void {
		this.cooldownUntil.clear();
	}

	private async tryLoadOnce(
		track: TrackIdentity,
		settings: ExtensionSettings,
		providers: LyricsProvider[],
		attempts: ProviderAttempt[],
		isCurrent: () => boolean
	): Promise<ProviderLoadState> {
		const errors: string[] = [];
		const unavailable: string[] = [];
		let sawInstrumental = false;
		const options = this.resolvedOptions();

		for (const provider of providers) {
			if (!provider.supports(track)) {
				continue;
			}
			if (this.isCoolingDown(provider.id, options.now())) {
				attempts.push({ provider: provider.id, status: "cooldown" });
				unavailable.push(`${provider.id}: Lyrics provider is temporarily unavailable.`);
				continue;
			}
			try {
				const result = await provider.fetch(track, this.contextFactory(settings));
				if (!isCurrent()) {
					return { status: "idle" };
				}
				if (result.ok) {
					const lyrics = prepareProviderLyrics(result.lyrics);
					attempts.push({ provider: provider.id, status: "success" });
					return {
						status: "ready",
						lyrics,
						provider: provider.id,
					};
				}
				if (result.reason === "temporarily-unavailable") {
					this.cooldownUntil.set(provider.id, options.now() + (result.cooldownMs ?? options.temporaryUnavailableCooldownMs));
					attempts.push({ provider: provider.id, status: "temporarily-unavailable", message: result.message });
					unavailable.push(`${provider.id}: ${result.message ?? "Lyrics provider is temporarily unavailable."}`);
					continue;
				}
				if (result.reason === "instrumental") {
					sawInstrumental = true;
					attempts.push({ provider: provider.id, status: "instrumental", message: result.message });
					continue;
				}
				attempts.push({
					provider: provider.id,
					status: result.reason === "no-lyrics" ? "no-lyrics" : "error",
					message: result.message,
				});
				if (result.message) {
					errors.push(`${provider.id}: ${result.message}`);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				attempts.push({ provider: provider.id, status: "error", message });
				errors.push(`${provider.id}: ${message}`);
			}
		}

		const failureMessages = [...errors, ...unavailable];
		if (failureMessages.length > 0) {
			return { status: "error", message: failureMessages.join("\n") };
		}
		if (sawInstrumental) {
			return { status: "empty", reason: "instrumental" };
		}
		return { status: "empty", reason: "no-lyrics" };
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

	private resolvedOptions(): ProviderLoadPipelineOptions {
		return { ...DEFAULT_OPTIONS, ...this.options };
	}
}
