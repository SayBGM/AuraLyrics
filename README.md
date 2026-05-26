# AuraLyrics

[한국어 README](README.ko.md)

A polished Document Picture-in-Picture lyrics extension for Spicetify.

AuraLyrics turns the current album art into a soft blurred backdrop and renders synced lyrics with DOM, CSS, and spring-based motion. It is designed as a modern TypeScript replacement for Spicetify's classic `popupLyrics` extension, without Canvas rendering.

## Features

- Document Picture-in-Picture lyrics window for Spotify desktop through Spicetify.
- Album-art background with blur, dim, saturation, vignette, and inactive-line blur controls.
- Line-synced and syllable/word-synced rendering.
- Spring-based syllable animation with glow, scale, y-offset, and gradient text fill.
- Clean line-mode fallback that animates whole lines without fake text-fill progress.
- Three-line focus layout: previous, current, next.
- Final lyric scroll handling for seek-to-ending cases.
- Provider fallback across Spotify, Musixmatch, and LRCLIB.
- Musixmatch richsync support for word timing when available.
- Musixmatch captcha/rate-limit cooldown fallback.
- Desktop-to-mobile Musixmatch token generation fallback.
- Persistent lyrics cache with first-priority-provider-only cache policy.
- PiP playback controls for previous, play/pause, next, and close.
- Responsive settings modal with live visual updates.

## Installation

AuraLyrics is distributed as a single Spicetify extension file: `aura-lyrics.js`.

### macOS / Linux

```sh
curl -fsSL https://github.com/SayBGM/AuraLyrics/releases/latest/download/install.sh | sh
```

### Windows PowerShell

```powershell
iwr https://github.com/SayBGM/AuraLyrics/releases/latest/download/install.ps1 -UseB | iex
```

### Manual Install

1. Download `aura-lyrics.js` from the latest release.
2. Copy it into your Spicetify extensions folder.
3. Enable it:

```sh
spicetify config extensions aura-lyrics.js
spicetify apply
```

## Usage

- Left-click the Topbar button to open or close the PiP lyrics window.
- Right-click the Topbar button to open settings.
- Move the pointer inside the PiP window to reveal playback controls.
- Drag the PiP window itself to reposition it.

Document Picture-in-Picture does not allow extensions to programmatically set the window position. AuraLyrics only controls the PiP content, not the OS-managed PiP placement.

## Providers

AuraLyrics supports three lyric providers:

- Spotify
- Musixmatch
- LRCLIB

Provider order and enabled state are configurable in settings.

Cache behavior is intentionally conservative: lyrics are cached only when the current first-priority enabled provider succeeds. Fallback provider results are shown immediately, but they are not persisted as the canonical cached result. This prevents temporary fallback lyrics, such as LRCLIB after a Musixmatch captcha, from sticking around as if they came from the primary provider.

## Musixmatch Notes

Musixmatch may occasionally return captcha, rate-limit, blocked, or `401/403/429` responses. AuraLyrics handles that by temporarily skipping Musixmatch and falling through to the next provider instead of showing an immediate error.

Token generation uses two attempts:

1. Desktop endpoint: `apic-desktop.musixmatch.com` with `app_id=web-desktop-app-v1.0`.
2. Mobile fallback endpoint: `apic-appmobile.musixmatch.com` with `app_id=mac-ios-v2.0`.

If both fail, the settings UI reports that both desktop and mobile token requests failed.

## Settings

Settings are grouped into:

- General: preset, lyrics delay, font scale.
- Background: album background, blur, dim, saturation, vignette, inactive blur.
- Lyrics: sync preference, alignment, centered active-line scroll, context lines, interludes.
- Motion: animation, intensity, glow, reduced motion.
- Providers: provider order, enabled state, Musixmatch token.
- Advanced: debug mode, refresh lyrics, clear cache, reset settings.

The default visual preset is `Immersive`.

## Development

Install dependencies:

```sh
npm install
```

Run checks:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

Build the release asset:

```sh
npm run package
```

Useful scripts:

- `npm run dev`: watch build.
- `npm run build`: produce `dist/aura-lyrics.js`.
- `npm run test`: run Vitest tests.
- `npm run lint`: run Biome checks.
- `npm run format`: apply Biome formatting.
- `npm run package`: build release assets and checksums.

## Tech Stack

- TypeScript
- Vite
- Vanilla DOM + CSS
- Document Picture-in-Picture API
- Vitest + jsdom
- Biome

## Project Status

AuraLyrics currently focuses on lyrics display, provider fallback, cache behavior, settings, and lightweight PiP playback controls. It intentionally does not add a full player UI inside PiP.

## Disclaimer

AuraLyrics is an unofficial Spicetify extension and is not affiliated with Spotify, Spicetify, Musixmatch, or LRCLIB.
