# Pseudo-karaoke audio-analysis retry design

## Problem

AuraLyrics can receive valid line-synced lyrics while synthesized karaoke remains unavailable. The two features use independent inputs: line timing comes from a lyrics provider, while pseudo-karaoke also requires `Spicetify.getAudioData()` segments.

The current audio-analysis service converts an exception into `undefined` and caches that result for the lifetime of the extension. The track-session controller then caches a `null` synthesis result for the same line-lyrics object. A temporary analysis failure therefore becomes sticky: setting changes do not retry it, and a manual lyrics refresh clears only the synthesis cache, not the audio-analysis cache.

## Goals

- Keep the first line-lyrics presentation immediate and non-blocking.
- Recover automatically when audio analysis is temporarily unavailable during app startup or a track change.
- Bound Spotify audio-analysis requests so failures cannot create an unbounded retry loop.
- Preserve the existing line-lyrics fallback when analysis is permanently unavailable or unsuitable.
- Let an explicit lyrics refresh force a fresh analysis attempt.
- Preserve stale-track and stale-settings guards already enforced by `TrackSessionController`.

## Non-goals

- Do not change the pseudo-karaoke alignment algorithm or its tuning constants.
- Do not delay extension startup until `Spicetify.getAudioData` exists.
- Do not add a new setting, notification, or persistent cache format.
- Do not retry native syllable lyrics or static lyrics, which do not need synthesis.

## Design

### Audio-analysis acquisition

`AudioAnalysisWaveformService.getAnalysis()` remains the single shared acquisition path for waveform and pseudo-karaoke consumers. It keeps in-flight request deduplication by track URI and performs at most three attempts for an acquisition cycle:

1. immediately;
2. after 400 ms;
3. after a further 1,200 ms.

An analysis is a positive cache entry when it contains at least one structurally usable segment: finite start, finite positive duration. Positive entries remain cached by track URI because Spotify audio analysis is immutable for a track.

Exceptions, `undefined`, and responses without usable segments are retryable. After the third unsuccessful attempt, the service returns the last partial response when one exists, otherwise `undefined`. This preserves any tempo or beat information that can still improve interlude rendering.

The exhausted result is held in a five-second negative cache. This prevents the waveform enrichment and pseudo-karaoke enrichment from immediately starting two independent three-request cycles. After the cooldown expires, a later settings presentation or track reload may begin a new bounded cycle.

The service exposes URI-scoped invalidation. Manual refresh uses it before starting waveform/profile loading, so a user-requested refresh bypasses both positive and negative analysis cache entries.

Invalidation also advances a per-URI acquisition generation and detaches the URI from any older in-flight cycle. The next caller therefore starts a fresh request instead of sharing pre-refresh work. An older cycle may finish for its original caller, but it may populate the cache or clear the in-flight entry only when its captured generation and request identity are still current. This prevents pre-refresh completion from overwriting newer analysis state.

### Synthesis caching

`TrackSessionController` caches only successful synthesized lyrics. A `null` result falls back to the original line lyrics but is not retained in `pseudoKaraokeByUri`. This allows a later presentation to retry after the audio-analysis negative-cache cooldown or after manual refresh.

Successful synthesis keeps the current URI plus exact-source-identity memoization. Settings toggles can therefore switch between line and synthesized views without rebuilding successful output.

### Presentation and concurrency

The initial ready snapshot still contains native line lyrics and is returned as soon as lyrics loading completes. Analysis retries happen only in asynchronous enrichment, so the UI is never blank or delayed by the retry schedule.

Existing generation and presentation-revision checks remain authoritative. If the track or settings change while a retry is pending, the old result may populate only its URI-scoped analysis cache; it cannot overwrite the current rendered snapshot.

### Failure behavior

If all attempts fail, AuraLyrics silently keeps line-synced lyrics, matching current best-effort behavior. The failure is recoverable instead of permanent. No user-facing error is added because line lyrics remain a valid presentation and transient analysis failures should not create repeated notifications.

## Testing

Add focused unit coverage for:

- `undefined` followed by successful analysis;
- an exception followed by successful analysis;
- empty segments followed by successful analysis;
- three failed attempts returning the existing seeded/line fallback;
- in-flight consumers sharing one retry cycle;
- positive cache reuse and five-second negative-cache expiry;
- explicit invalidation forcing a new acquisition cycle;
- a pre-invalidation in-flight cycle being unable to overwrite post-invalidation cache state;
- failed pseudo-karaoke synthesis not being memoized;
- manual refresh invalidating analysis before profile loading;
- stale enrichment remaining unable to overwrite a newer track.

Before release, run the repository-required `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`, plus `npm run package` to verify release assets.

## Release

Ship this as patch version `1.0.2`. Update package metadata and release-facing notes according to the repository's existing release workflow, commit only scoped files, create tag `v1.0.2`, push the commit and tag, and verify that the GitHub release workflow completes successfully.
