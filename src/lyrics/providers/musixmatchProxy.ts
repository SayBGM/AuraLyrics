export const applyMusixmatchProxy = (targetUrl: string, proxyBaseUrl?: string): string =>
	proxyBaseUrl ? `${proxyBaseUrl}${encodeURIComponent(targetUrl)}` : targetUrl;

export type RequestMusixmatchOptions<T> = {
	targetUrl: string;
	proxyBaseUrl?: string;
	cosmosGet: (url: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
	cosmosHeaders: Record<string, string>;
	fetch: typeof fetch;
};

/**
 * Spicetify's CosmosAsync routes external hosts through Spicetify's own default CORS
 * proxy, which a custom proxy can't override. So when a custom proxy is configured, this
 * bypasses CosmosAsync entirely and calls the proxy directly via fetch instead — the proxy
 * is responsible for attaching any headers Musixmatch requires on its end.
 */
export const requestMusixmatch = async <T>(options: RequestMusixmatchOptions<T>): Promise<T> => {
	if (options.proxyBaseUrl) {
		const response = await options.fetch(applyMusixmatchProxy(options.targetUrl, options.proxyBaseUrl));
		return (await response.json()) as T;
	}
	return options.cosmosGet(options.targetUrl, null, options.cosmosHeaders);
};
