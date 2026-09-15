import { applyUrlProxy } from "./urlProxy";

export type RequestMusixmatchOptions<T> = {
	targetUrl: string;
	proxyBaseUrl?: string;
	cosmosGet: (url: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
	cosmosHeaders: Record<string, string>;
	/** Browser-safe headers for the custom-proxy fetch route. */
	fetchHeaders?: Record<string, string>;
	fetch: typeof fetch;
	/** Aborts the fetch-based (proxy) path. CosmosAsync has no cancellation support, so this has no effect there. */
	signal?: AbortSignal;
	/** A transport timeout. CosmosAsync cannot be cancelled, but its late result is ignored. */
	timeoutMs?: number;
};

export class MusixmatchRequestError extends Error {
	public constructor(
		message: string,
		public readonly status?: number,
		public readonly retryAfterMs?: number
	) {
		super(message);
		this.name = "MusixmatchRequestError";
	}
}

const retryAfterMs = (value: string | null): number | undefined => {
	if (!value) {
		return undefined;
	}
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds * 1000;
	}
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
};

const withTimeout = async <T>(
	operation: (signal: AbortSignal) => Promise<T>,
	signal: AbortSignal | undefined,
	timeoutMs: number | undefined
): Promise<T> => {
	if (!timeoutMs) {
		return operation(signal ?? new AbortController().signal);
	}
	const controller = new AbortController();
	const abort = () => controller.abort(signal?.reason);
	if (signal?.aborted) {
		abort();
	} else {
		signal?.addEventListener("abort", abort, { once: true });
	}
	let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutHandle = globalThis.setTimeout(() => {
			controller.abort();
			reject(new MusixmatchRequestError("Musixmatch request timed out."));
		}, timeoutMs);
	});
	const aborted = signal
		? new Promise<never>((_, reject) => {
				if (signal.aborted) {
					reject(new Error("aborted"));
					return;
				}
				signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
			})
		: undefined;
	try {
		return await Promise.race([operation(controller.signal), timeout, ...(aborted ? [aborted] : [])]);
	} finally {
		if (timeoutHandle !== undefined) {
			globalThis.clearTimeout(timeoutHandle);
		}
		signal?.removeEventListener("abort", abort);
	}
};

/**
 * Spicetify's CosmosAsync routes external hosts through Spicetify's own default CORS
 * proxy, which a custom proxy can't override. So when a custom proxy is configured, this
 * bypasses CosmosAsync entirely and calls the proxy directly via fetch instead, forwarding
 * cosmosHeaders on that request for a passthrough-style proxy to relay upstream. Browser
 * fetch silently drops forbidden headers (e.g. Cookie), so those never reach the proxy.
 */
export const requestMusixmatch = async <T>(options: RequestMusixmatchOptions<T>): Promise<T> => {
	if (options.proxyBaseUrl) {
		return withTimeout(
			async (signal) => {
				const init: RequestInit = { headers: options.fetchHeaders ?? options.cosmosHeaders };
				if (options.signal || options.timeoutMs) {
					init.signal = signal;
				}
				const response = await options.fetch(applyUrlProxy(options.targetUrl, options.proxyBaseUrl), init);
				if (response.ok === false) {
					throw new MusixmatchRequestError(
						`Musixmatch request failed with HTTP ${response.status}.`,
						response.status,
						retryAfterMs(response.headers?.get?.("Retry-After") ?? null)
					);
				}
				return (await response.json()) as T;
			},
			options.signal,
			options.timeoutMs
		);
	}
	return withTimeout(() => options.cosmosGet(options.targetUrl, null, options.cosmosHeaders), options.signal, options.timeoutMs);
};
