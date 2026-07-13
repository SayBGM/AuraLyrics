export const applyUrlProxy = (targetUrl: string, proxyBaseUrl?: string): string =>
	proxyBaseUrl ? `${proxyBaseUrl}${encodeURIComponent(targetUrl)}` : targetUrl;
