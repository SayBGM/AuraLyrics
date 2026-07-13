# LRCLIB shared custom proxy design

## Problem

`LrclibProvider` currently calls LRCLIB's exact-signature `/api/get` endpoint with `window.fetch`. This direct browser request can fail in Spotify's embedded web environment even when the same endpoint works outside Spotify, because the request is subject to that environment's CORS and network policy. The exact endpoint also requires album and duration metadata to match closely, so otherwise useful LRCLIB records can be missed.

AuraLyrics already supports a user-configured URL proxy for Musixmatch desktop requests. The proxy setting accepts a base URL such as `https://proxy.example.com/?url=` and appends the URL-encoded upstream target. LRCLIB does not currently use that setting, so users cannot route LRCLIB around the browser boundary.

## Goals

- Route LRCLIB requests through the existing custom proxy when the proxy mode is `custom` and a base URL is configured.
- Preserve direct LRCLIB requests when the proxy mode is `default`.
- Replace `/api/get` with a field-specific `/api/search` request followed by a broad `q` search when the first response has no usable synchronized lyrics.
- Select the best synchronized result deterministically instead of trusting the API's array order.
- Keep persisted settings compatible; existing users must not need a migration.
- Share URL-proxy behavior between Musixmatch and LRCLIB instead of coupling one provider to the other.
- Preserve LRCLIB query encoding, user-agent header, response parsing, and error classification.
- Explain in the settings UI that the custom proxy applies to both Musixmatch desktop requests and LRCLIB.

## Non-goals

- Do not add a separate LRCLIB proxy setting.
- Do not add or deploy a proxy server.
- Do not return LRCLIB to `Spicetify.CosmosAsync`; that path previously mixed Spotify authentication into the request.
- Do not retain `/api/get` as a fallback.
- Do not fall back to a direct LRCLIB request after a configured proxy fails. The existing provider fallback pipeline remains responsible for trying another lyrics provider.
- Do not change lyrics caching or provider ordering.

## Design

### Configuration and compatibility

The persisted settings fields `musixmatchProxyMode` and `musixmatchProxyBaseUrl` remain unchanged. Renaming them would require a migration and provides no runtime benefit.

Within the provider layer, the resolved custom base URL becomes generic context rather than Musixmatch-only context. `ExtensionApp` continues to resolve the URL only when the mode is `custom`, then exposes that value to providers as `proxyBaseUrl`. Musixmatch token refresh receives the same resolved value as it does today.

Existing custom-proxy users therefore opt into proxying both Musixmatch desktop and LRCLIB requests without changing their saved settings.

### Shared proxy URL construction

A provider-neutral helper constructs request URLs:

- without a base URL, it returns the upstream target unchanged;
- with a base URL, it returns `baseUrl + encodeURIComponent(targetUrl)`.

Both the existing Musixmatch proxy request path and `LrclibProvider` use this helper. The helper owns only deterministic URL construction; each provider retains its own transport and response handling.

### LRCLIB search flow

`LrclibProvider` first requests `/api/search` with `track_name`, `artist_name`, and `album_name`. If that request returns no usable synchronized lyrics, it requests `/api/search` again with `q` set to the track title and artist joined by one space. A usable result from the first request wins without comparing it to results from the second request.

Each canonical upstream search URL is passed through the shared proxy helper using `context.proxyBaseUrl`, then requested through `context.fetch`. When no custom proxy is configured, the helper returns the direct `https://lrclib.net/api/search?...` URL.

The request continues to send `x-user-agent: <AuraLyrics user agent>`. The configured proxy is expected to allow the browser request, return the upstream JSON body, and preserve a meaningful HTTP status. LRCLIB's existing handling for 404, 429, 5xx, malformed payloads, instrumental tracks, and synchronized lyrics remains unchanged.

A 404, empty array, or valid array without usable synchronized lyrics advances from the field search to the broad search. Rate limits, server failures, other HTTP failures, network failures, JSON decoding failures, and a malformed top-level payload stop the search and retain their existing error classification. A configured proxy failure never retries the upstream URL directly.

### Candidate validation and ranking

The search response must be an array. Malformed individual entries are ignored when at least one structurally valid record exists; a non-empty response containing only malformed entries is a schema error.

Instrumental records and records without non-empty synchronized lyrics are not renderable candidates. Remaining records are parsed, and records without renderable vocals are skipped. Valid renderable candidates are ranked by this tuple:

1. normalized title exact match;
2. normalized artist exact match;
3. normalized album exact match;
4. smallest absolute duration difference from the Spotify track;
5. original API order.

Metadata normalization applies Unicode NFKC normalization, lowercase conversion, trimming, and internal whitespace collapse. Missing or non-finite candidate duration sorts after finite duration values.

If neither search yields synchronized lyrics and every structurally valid record encountered is instrumental, the provider reports `instrumental`. Otherwise it reports `no-lyrics`.

### Settings presentation

The visible proxy label and description are updated in English, Korean, and Japanese to describe a shared lyrics-provider proxy. The copy states that it applies to Musixmatch desktop requests and LRCLIB. Internal persisted field names stay unchanged.

## Testing

Use test-driven development with focused unit coverage:

- a configured proxy causes LRCLIB to fetch `baseUrl + encodeURIComponent(upstreamUrl)`;
- the proxied request retains the LRCLIB user-agent header and does not use Cosmos;
- no configured proxy preserves the direct LRCLIB URL;
- the field search uses track, artist, and album and stops after a usable result;
- an empty, 404, or unsynchronized field-search result falls back to `q=<title> <artist>`;
- candidate metadata and duration outrank API array order deterministically;
- malformed candidates, instrumental-only results, and unavailable synchronized lyrics retain the specified classifications;
- track metadata remains encoded in the upstream URL before that URL is proxy-encoded;
- the shared URL helper preserves existing Musixmatch direct and proxied behavior;
- existing LRCLIB status, payload-validation, and lyric-parsing tests remain green;
- settings translations remain complete for English, Korean, and Japanese.

Before completion, run the repository-required `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` commands.
