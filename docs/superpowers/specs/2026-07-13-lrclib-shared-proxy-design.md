# LRCLIB shared custom proxy design

## Problem

`LrclibProvider` currently calls `https://lrclib.net` with `window.fetch`. This direct browser request can fail in Spotify's embedded web environment even when the same endpoint works outside Spotify, because the request is subject to that environment's CORS and network policy.

AuraLyrics already supports a user-configured URL proxy for Musixmatch desktop requests. The proxy setting accepts a base URL such as `https://proxy.example.com/?url=` and appends the URL-encoded upstream target. LRCLIB does not currently use that setting, so users cannot route LRCLIB around the browser boundary.

## Goals

- Route LRCLIB requests through the existing custom proxy when the proxy mode is `custom` and a base URL is configured.
- Preserve direct LRCLIB requests when the proxy mode is `default`.
- Keep persisted settings compatible; existing users must not need a migration.
- Share URL-proxy behavior between Musixmatch and LRCLIB instead of coupling one provider to the other.
- Preserve LRCLIB query encoding, user-agent header, response parsing, and error classification.
- Explain in the settings UI that the custom proxy applies to both Musixmatch desktop requests and LRCLIB.

## Non-goals

- Do not add a separate LRCLIB proxy setting.
- Do not add or deploy a proxy server.
- Do not return LRCLIB to `Spicetify.CosmosAsync`; that path previously mixed Spotify authentication into the request.
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

### LRCLIB request flow

`LrclibProvider` first builds the canonical LRCLIB target URL exactly as it does now, including track, artist, album, and duration query parameters. It then applies the shared proxy helper using `context.proxyBaseUrl` and calls `context.fetch` with the resulting URL.

The request continues to send `x-user-agent: <AuraLyrics user agent>`. The configured proxy is expected to allow the browser request, return the upstream JSON body, and preserve a meaningful HTTP status. LRCLIB's existing handling for 404, 429, 5xx, malformed payloads, instrumental tracks, and synchronized lyrics remains unchanged.

When no custom proxy is configured, the constructed request URL remains the direct `https://lrclib.net/api/get?...` URL, preserving current default behavior.

### Settings presentation

The visible proxy label and description are updated in English, Korean, and Japanese to describe a shared lyrics-provider proxy. The copy states that it applies to Musixmatch desktop requests and LRCLIB. Internal persisted field names stay unchanged.

## Testing

Use test-driven development with focused unit coverage:

- a configured proxy causes LRCLIB to fetch `baseUrl + encodeURIComponent(upstreamUrl)`;
- the proxied request retains the LRCLIB user-agent header and does not use Cosmos;
- no configured proxy preserves the direct LRCLIB URL;
- track metadata remains encoded in the upstream URL before that URL is proxy-encoded;
- the shared URL helper preserves existing Musixmatch direct and proxied behavior;
- existing LRCLIB status, payload-validation, and lyric-parsing tests remain green;
- settings translations remain complete for English, Korean, and Japanese.

Before completion, run the repository-required `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` commands.
