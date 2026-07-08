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
 * bypasses CosmosAsync entirely and calls the proxy directly via fetch instead, forwarding
 * cosmosHeaders on that request for a passthrough-style proxy to relay upstream. Browser
 * fetch silently drops forbidden headers (e.g. Cookie), so those never reach the proxy.
 */
export const requestMusixmatch = async <T>(options: RequestMusixmatchOptions<T>): Promise<T> => {
	if (options.proxyBaseUrl) {
		const response = await options.fetch(applyMusixmatchProxy(options.targetUrl, options.proxyBaseUrl), {
			headers: options.cosmosHeaders,
		});
		return (await response.json()) as T;
	}
	return options.cosmosGet(options.targetUrl, null, options.cosmosHeaders);
};
