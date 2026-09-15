/**
 * Musixmatch's mobile endpoints expect headers that browsers are not allowed to
 * forward through a user supplied proxy. Keep the two transports explicit so a
 * proxy never silently drops the credentials we think it has sent.
 */
export const MUSIXMATCH_MOBILE_HOST = "apic-appmobile.musixmatch.com";
export const MUSIXMATCH_MOBILE_APP_ID = "mac-ios-v2.0";
export const MUSIXMATCH_MOBILE_API_BASE_URL = `https://${MUSIXMATCH_MOBILE_HOST}/ws/1.1`;

export const MUSIXMATCH_MOBILE_COSMOS_HEADERS: Record<string, string> = {
	Host: MUSIXMATCH_MOBILE_HOST,
	authority: MUSIXMATCH_MOBILE_HOST,
	"X-Cookie": "x-mxm-token-guid=",
	"x-mxm-app-version": "10.1.1",
	"X-User-Agent": "Musixmatch/2025120901 CFNetwork/3860.300.31 Darwin/25.2.0",
	"Accept-Language": "en-US,en;q=0.9",
	Connection: "keep-alive",
	Accept: "application/json",
};

/** Headers browsers can actually send to a custom proxy with fetch. */
export const MUSIXMATCH_MOBILE_FETCH_HEADERS: Record<string, string> = {
	"X-Cookie": MUSIXMATCH_MOBILE_COSMOS_HEADERS["X-Cookie"],
	"x-mxm-app-version": MUSIXMATCH_MOBILE_COSMOS_HEADERS["x-mxm-app-version"],
	"X-User-Agent": MUSIXMATCH_MOBILE_COSMOS_HEADERS["X-User-Agent"],
	"Accept-Language": MUSIXMATCH_MOBILE_COSMOS_HEADERS["Accept-Language"],
	Accept: "application/json",
};

export const musixmatchMobileUrl = (path: string, params: URLSearchParams): string =>
	`${MUSIXMATCH_MOBILE_API_BASE_URL}/${path}?${params.toString()}`;
