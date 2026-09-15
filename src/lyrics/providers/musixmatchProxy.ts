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

export type MusixmatchRequestErrorKind =
	| "authentication"
	| "captcha"
	| "rate-limit"
	| "http"
	| "timeout"
	| "network"
	| "invalid-response"
	| "aborted";

export class MusixmatchRequestError extends Error {
	public constructor(
		message: string,
		public readonly kind: MusixmatchRequestErrorKind,
		public readonly status?: number,
		public readonly retryAfterMs?: number
	) {
		super(message);
		this.name = "MusixmatchRequestError";
	}
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const finiteNumber = (value: unknown): number | undefined => {
	const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
	return Number.isFinite(number) ? number : undefined;
};

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

const errorStatus = (error: unknown): number | undefined => {
	const record = asRecord(error);
	const response = asRecord(record?.response);
	return (
		finiteNumber(record?.status) ??
		finiteNumber(record?.statusCode) ??
		finiteNumber(record?.status_code) ??
		finiteNumber(response?.status) ??
		finiteNumber(response?.statusCode) ??
		finiteNumber(response?.status_code)
	);
};

const headerValue = (headers: unknown, name: string): string | null => {
	const record = asRecord(headers);
	const get = record?.get;
	if (typeof get === "function") {
		const value = get.call(headers, name);
		return typeof value === "string" ? value : value == null ? null : String(value);
	}
	if (!record) return null;
	const entry = Object.entries(record).find(([key]) => key.toLowerCase() === name.toLowerCase());
	return entry && entry[1] != null ? String(entry[1]) : null;
};

const errorRetryAfterMs = (error: unknown): number | undefined => {
	const record = asRecord(error);
	const direct = finiteNumber(record?.retryAfterMs);
	if (direct !== undefined && direct >= 0) return direct;
	const response = asRecord(record?.response);
	return retryAfterMs(headerValue(record?.headers, "Retry-After") ?? headerValue(response?.headers, "Retry-After"));
};

const errorText = (error: unknown): string => {
	const record = asRecord(error);
	const response = asRecord(record?.response);
	return [record?.message, record?.hint, response?.message, response?.hint]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
};

const responseClassificationText = (payload: unknown): string => {
	const message = asRecord(asRecord(payload)?.message);
	const header = asRecord(message?.header);
	return [header?.hint, header?.mode]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
};

const classifyError = (status: number | undefined, text: string): MusixmatchRequestErrorKind => {
	if (/captcha/.test(text)) return "captcha";
	if (status === 429 || /rate.?limit|too many|blocked/.test(text)) return "rate-limit";
	if (status === 401 || status === 403) return "authentication";
	return status === undefined ? "network" : "http";
};

const safeMessage = (kind: MusixmatchRequestErrorKind, status?: number): string => {
	switch (kind) {
		case "authentication":
			return "Musixmatch authentication failed.";
		case "captcha":
			return "Musixmatch captcha verification is required.";
		case "rate-limit":
			return "Musixmatch rate limit was reached.";
		case "timeout":
			return "Musixmatch request timed out.";
		case "invalid-response":
			return "Musixmatch returned an invalid response.";
		case "aborted":
			return "Musixmatch request was aborted.";
		case "http":
			return status === undefined ? "Musixmatch HTTP request failed." : `Musixmatch request failed with HTTP ${status}.`;
		case "network":
			return "Musixmatch network request failed.";
	}
};

export const toMusixmatchRequestError = (error: unknown, signal?: AbortSignal): MusixmatchRequestError => {
	if (error instanceof MusixmatchRequestError) {
		return new MusixmatchRequestError(safeMessage(error.kind, error.status), error.kind, error.status, error.retryAfterMs);
	}
	if (signal?.aborted) return new MusixmatchRequestError(safeMessage("aborted"), "aborted");
	const status = errorStatus(error);
	const kind = classifyError(status, errorText(error));
	return new MusixmatchRequestError(safeMessage(kind, status), kind, status, errorRetryAfterMs(error));
};

const withTimeout = async <T>(
	operation: (signal: AbortSignal) => Promise<T>,
	signal: AbortSignal | undefined,
	timeoutMs: number | undefined
): Promise<T> => {
	if (signal?.aborted) {
		throw new MusixmatchRequestError(safeMessage("aborted"), "aborted");
	}
	if (!timeoutMs) {
		return operation(signal ?? new AbortController().signal);
	}
	const controller = new AbortController();
	const abort = () => controller.abort(signal?.reason);
	signal?.addEventListener("abort", abort, { once: true });
	let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutHandle = globalThis.setTimeout(() => {
			controller.abort();
			reject(new MusixmatchRequestError(safeMessage("timeout"), "timeout"));
		}, timeoutMs);
	});
	let rejectAborted: (() => void) | undefined;
	const aborted = signal
		? new Promise<never>((_, reject) => {
				rejectAborted = () => reject(new MusixmatchRequestError(safeMessage("aborted"), "aborted"));
				signal.addEventListener("abort", rejectAborted, { once: true });
			})
		: undefined;
	try {
		return await Promise.race([operation(controller.signal), timeout, ...(aborted ? [aborted] : [])]);
	} finally {
		if (timeoutHandle !== undefined) {
			globalThis.clearTimeout(timeoutHandle);
		}
		signal?.removeEventListener("abort", abort);
		if (rejectAborted) signal?.removeEventListener("abort", rejectAborted);
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
	try {
		if (options.proxyBaseUrl) {
			return await withTimeout(
				async (signal) => {
					const init: RequestInit = { headers: options.fetchHeaders ?? options.cosmosHeaders };
					if (options.signal || options.timeoutMs) {
						init.signal = signal;
					}
					const response = await options.fetch(applyUrlProxy(options.targetUrl, options.proxyBaseUrl), init);
					if (response.ok === false || (typeof response.status === "number" && (response.status < 200 || response.status >= 300))) {
						const status = response.status;
						let classificationText = "";
						try {
							classificationText = responseClassificationText(await response.json());
						} catch {
							// An absent or malformed error body does not override the HTTP transport status.
						}
						const kind = classifyError(status, classificationText);
						throw new MusixmatchRequestError(safeMessage(kind, status), kind, status, retryAfterMs(response.headers?.get?.("Retry-After") ?? null));
					}
					try {
						return (await response.json()) as T;
					} catch {
						throw new MusixmatchRequestError(safeMessage("invalid-response"), "invalid-response", response.status);
					}
				},
				options.signal,
				options.timeoutMs
			);
		}
		return await withTimeout(() => options.cosmosGet(options.targetUrl, null, options.cosmosHeaders), options.signal, options.timeoutMs);
	} catch (error) {
		throw toMusixmatchRequestError(error, options.signal);
	}
};
