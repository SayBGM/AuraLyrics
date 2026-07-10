# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

AuraLyrics is a Spicetify extension that renders synced Spotify lyrics in a Document Picture-in-Picture window using DOM + CSS + spring-based motion (no Canvas). It builds to a single IIFE bundle (`dist/aura-lyrics.js`) loaded by Spicetify on the Spotify desktop client.

## Commands

```sh
npm run typecheck      # tsc --noEmit
npm run lint           # Biome check (also lints config files + .github/workflows)
npm run format         # Biome check --write (apply formatting)
npm run test           # Vitest (jsdom), all tests/**/*.test.ts
npm run build          # Vite → dist/aura-lyrics.js
npm run package        # build + scripts/package-release.mjs (release assets)
```

Run a single test file or test:

```sh
npx vitest run tests/lyrics/pseudoKaraoke/buildPseudoKaraoke.test.ts
npx vitest run -t "passes interludes through unchanged"
```

Visual (Playwright/Chromium) tests are separate: `npm run test:visual` / `npm run test:visual:update`. CI tolerates font-rendering drift, so snapshot diffs may be expected.

Before finishing a change, run `typecheck`, `lint` (or `format`), `test`, and `build` — Biome enforces formatting and will fail lint on unformatted code.

## Runtime boundary

- The extension only runs inside Spicetify. `window.Spicetify` is the entire platform API surface, typed in `src/runtime/spicetify.d.ts`. `src/extension.ts` polls until `Player`, `CosmosAsync`, `LocalStorage`, and `Topbar` exist, then constructs and starts `ExtensionApp`.
- All external access goes through Spicetify: lyrics HTTP via `CosmosAsync`, audio analysis via `getAudioData`, persistence via `LocalStorage` (wrapped by `SpicetifyStorageAdapter`), the toggle button via `Topbar`.
- There is no dev server that runs the real extension; iterate via unit tests and `npm run build`, then load `dist/aura-lyrics.js` in Spicetify for manual verification.

## Architecture

Layered, with one-way dependency flow `lyrics → renderer → app`. `ExtensionApp` (`src/app/ExtensionApp.ts`) is the orchestrator that wires everything and owns the load→render pipeline.

**Lyrics loading** (`src/lyrics/`): `LyricsService.load()` tries providers in configured order (`ProviderRegistry`), with retries, per-provider cooldowns (for Musixmatch captcha/rate-limit), and a deliberate cache policy — results are persisted (`LyricsCache`) **only when the first-priority enabled provider succeeds**, so fallback results display but never stick as canonical. Provider results pass through `normalizeLyrics` then `addInterludes` before returning.

**Three lyric document types** (`src/lyrics/types.ts`): `StaticLyrics` (no timing), `LineLyrics` (per-line timing), `SyllableLyrics` (per-syllable/word timing → true karaoke). `LyricsRenderer.buildLyrics` branches on the type. The `syncPreference` setting downgrades syllable lyrics to line rendering (`line-only`) or prefers syllable rendering (`prefer-syllable`). Each content array mixes vocals with `Interlude` entries.

**Rendering** (`src/renderer/`): `LyricsRenderer.mount()` builds the DOM once; `update(timestamp, deltaTime)` is called every frame by `PlaybackClock` (requestAnimationFrame) from `ExtensionApp.tick`. `SyllableVocals` drives per-syllable spring animation (scale/yOffset/glow + gradient text-fill); `LineVocals` animates whole lines. Audio analysis also feeds interlude waveform visualization (`AudioAnalysisWaveformService` → `interludeWaveforms`).

**Playback sync**: lyric `startTime`/`endTime` are in **seconds** (see `parseTimestamp` in `LrcParser`), matching the `playbackTimestampSec` the renderer compares against. `ExtensionApp` advances time per frame and periodically resyncs / snaps to the player on seek. `lyricsDelayMs` is applied when reading the player timestamp, not baked into lyric data.

**Pseudo-karaoke synthesis** (`src/lyrics/pseudoKaraoke/`): when only `LineLyrics` are available and `pseudoKaraoke` is on with `prefer-syllable`, `ExtensionApp` synthesizes `SyllableLyrics` from line lyrics + Spotify audio analysis, so the existing syllable renderer shows karaoke. The algorithm is a port of `../ivLyrics/docs/PSEUDO_KARAOKE_ANALYSIS.md`: linguistic syllable weights × an audio "vocal mass curve" combined via mass-ratio inversion + beat/silence snapping + min-cost DP alignment. These modules are **pure functions and work in milliseconds internally**, converting `seconds ↔ ms` only at the `buildPseudoKaraoke.ts` boundary. The synthesized result is kept out of the persistent `LyricsCache` (it depends on settings); it lives in an in-memory map on `ExtensionApp` and is chosen at render time via `displayLyricsFor`, so toggling the setting takes effect live. Tuning constants live in `pseudoKaraoke/constants.ts`.

**Settings** (`src/settings/`): `ExtensionSettings` schema + presets in `settingsSchema.ts`, persisted via `SettingsStore`. `normalizeLoadedSettings` migrates/validates persisted shapes — when adding a setting, add it to the type, `DEFAULT_SETTINGS`, normalization, the `SettingsView` UI, and `settingsTranslations` (en/ko/ja, a `Record` so all three are required).

## Conventions

- Match the surrounding style; Biome owns formatting (tabs, double quotes). Vanilla TS + DOM only — no UI framework.
- New pure logic (parsers, pseudo-karaoke, weights) belongs under `src/lyrics/` with focused Vitest tests mirroring the path under `tests/`. Renderer/DOM behavior is exercised via jsdom unit tests and Playwright visual tests.
- The whole extension ships as one inlined IIFE bundle, so keep imports static-bundle-friendly (no runtime dynamic import expectations).
