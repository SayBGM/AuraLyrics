import type { ExtensionSettings } from "../settings/SettingsStore";
import { prepareProviderLyrics } from "./LyricsDocumentTransforms";
import type {
	LyricsDocument,
	LyricsProvider,
	LyricsProviderMetadata,
	ProviderAttempt,
	ProviderAttemptStatus,
	ProviderContext,
	ProviderId,
	TrackIdentity,
} from "./types";

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
	| { status: "ready"; lyrics: LyricsDocument; provider: ProviderId; metadata?: LyricsProviderMetadata }
	| { status: "empty"; reason: "no-lyrics" | "instrumental" | "restricted" }
	| { status: "error"; message: string };

export type ProviderLoadExecutionOptions = {
	/** Background prefetches must not spend the foreground retry budget. */
	maxAttempts?: number;
};

export type ProviderLoadResult = {
	state: ProviderLoadState;
	attempts: ProviderAttempt[];
};

/** A provider's outcome for one round, excluding "success" (handled separately as an immediate return). */
type TerminalOutcome = { status: Exclude<ProviderAttemptStatus, "success">; message?: string };

type RoundResult = {
	ready?: { lyrics: LyricsDocument; provider: ProviderId; metadata?: LyricsProviderMetadata };
	outcomes: Map<ProviderId, TerminalOutcome>;
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
		isCurrent: () => boolean,
		signal?: AbortSignal,
		executionOptions: ProviderLoadExecutionOptions = {}
	): Promise<ProviderLoadResult> {
		const attempts: ProviderAttempt[] = [];
		const options = { ...this.resolvedOptions(), ...executionOptions };
		const latestOutcomes = new Map<ProviderId, TerminalOutcome>();
		let providersToTry = providers;
		for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
			if (!isCurrent()) {
				return { state: { status: "idle" }, attempts };
			}
			const round = await this.tryLoadOnce(track, settings, providersToTry, attempts, isCurrent, signal);
			if (round.ready) {
				return { state: { status: "ready", lyrics: round.ready.lyrics, provider: round.ready.provider, metadata: round.ready.metadata }, attempts };
			}
			if (!isCurrent()) {
				return { state: { status: "idle" }, attempts };
			}
			for (const [providerId, outcome] of round.outcomes) {
				latestOutcomes.set(providerId, outcome);
			}
			// Only providers that actually errored (exception or reason "error") are worth retrying. A
			// provider that returned a definitive outcome (no-lyrics, instrumental, cooldown/unavailable)
			// won't change on a retry, so leave it out of the next round entirely.
			const erroredProviders = providersToTry.filter((provider) => round.outcomes.get(provider.id)?.status === "error");
			if (erroredProviders.length === 0 || attempt === options.maxAttempts) {
				return { state: this.aggregateState(providers, latestOutcomes), attempts };
			}
			providersToTry = erroredProviders;
			await this.delay(options.retryDelayMs * attempt);
			if (!isCurrent()) {
				return { state: { status: "idle" }, attempts };
			}
		}
		return { state: this.aggregateState(providers, latestOutcomes), attempts };
	}

	public clearCooldowns(): void {
		this.cooldownUntil.clear();
	}

	private async tryLoadOnce(
		track: TrackIdentity,
		settings: ExtensionSettings,
		providers: LyricsProvider[],
		attempts: ProviderAttempt[],
		isCurrent: () => boolean,
		signal: AbortSignal | undefined
	): Promise<RoundResult> {
		const outcomes = new Map<ProviderId, TerminalOutcome>();
		const options = this.resolvedOptions();

		for (const provider of providers) {
			if (!isCurrent()) {
				return { outcomes };
			}
			if (!provider.supports(track)) {
				continue;
			}
			if (this.isCoolingDown(provider.id, options.now())) {
				attempts.push({ provider: provider.id, status: "cooldown" });
				outcomes.set(provider.id, { status: "cooldown" });
				continue;
			}
			try {
				const result = await provider.fetch(track, { ...this.contextFactory(settings), signal });
				if (!isCurrent()) {
					return { outcomes };
				}
				const requestDetails = result.diagnostics ? { requests: result.diagnostics } : {};
				if (result.ok) {
					const lyrics = prepareProviderLyrics(result.lyrics);
					attempts.push({ provider: provider.id, status: "success", ...requestDetails });
					return { ready: { lyrics, provider: provider.id, metadata: result.metadata }, outcomes };
				}
				if (result.reason === "temporarily-unavailable") {
					this.cooldownUntil.set(provider.id, options.now() + (result.cooldownMs ?? options.temporaryUnavailableCooldownMs));
					attempts.push({ provider: provider.id, status: "temporarily-unavailable", message: result.message, ...requestDetails });
					outcomes.set(provider.id, { status: "temporarily-unavailable", message: result.message });
					continue;
				}
				if (result.reason === "instrumental") {
					attempts.push({ provider: provider.id, status: "instrumental", message: result.message, ...requestDetails });
					outcomes.set(provider.id, { status: "instrumental", message: result.message });
					continue;
				}
				if (result.reason === "restricted") {
					attempts.push({ provider: provider.id, status: "restricted", message: result.message, ...requestDetails });
					outcomes.set(provider.id, { status: "restricted", message: result.message });
					continue;
				}
				const status = result.reason === "no-lyrics" ? "no-lyrics" : "error";
				attempts.push({ provider: provider.id, status, message: result.message, ...requestDetails });
				outcomes.set(provider.id, { status, message: result.message });
			} catch (error) {
				if (!isCurrent()) {
					return { outcomes };
				}
				const message = error instanceof Error ? error.message : String(error);
				attempts.push({ provider: provider.id, status: "error", message });
				outcomes.set(provider.id, { status: "error", message });
			}
		}

		return { outcomes };
	}

	/** Combines every provider's latest known outcome (across all retry rounds) into one final state. */
	private aggregateState(providers: LyricsProvider[], outcomes: Map<ProviderId, TerminalOutcome>): ProviderLoadState {
		const errors: string[] = [];
		const unavailable: string[] = [];
		let sawInstrumental = false;
		let sawRestricted = false;
		for (const provider of providers) {
			const outcome = outcomes.get(provider.id);
			if (!outcome) {
				continue;
			}
			if (outcome.status === "error") {
				errors.push(`${provider.id}: ${outcome.message ?? "error"}`);
			} else if (outcome.status === "temporarily-unavailable" || outcome.status === "cooldown") {
				unavailable.push(`${provider.id}: ${outcome.message ?? "Lyrics provider is temporarily unavailable."}`);
			} else if (outcome.status === "instrumental") {
				sawInstrumental = true;
			} else if (outcome.status === "restricted") {
				sawRestricted = true;
			}
		}
		const failureMessages = [...errors, ...unavailable];
		if (failureMessages.length > 0) {
			return { status: "error", message: failureMessages.join("\n") };
		}
		if (sawRestricted) {
			return { status: "empty", reason: "restricted" };
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
