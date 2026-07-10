# Intro Gate and Syllable Wake Design

## Summary

AuraLyrics will keep its current lyrics loading behavior, but change what happens after timed lyrics become ready near the beginning of a track.

- If the first vocal begins within two seconds of the current play start or resume position, lyrics appear immediately without an intermediate cover presentation.
- If a longer leading instrumental section remains, the Aurora Editorial track metadata presentation stays visible until the first vocal begins. Because lyrics are already loaded, this held presentation has no `LOADING` label or progress line.
- The transition uses the existing playback synchronizer rather than a wall-clock timer, so pause, resume, seek, and resync cannot drift away from lyric time.
- The visible synthetic karaoke corner icon is removed. Synthetic timing instead uses a Syllable Wake treatment embedded in the active lyric gradient and glow.

No setting, persistence key, cache format, provider behavior, or lyric document format changes.

## Goals

1. Avoid showing a cover presentation when vocals begin almost immediately.
2. Let a long opening instrumental keep the track presentation on screen until the first vocal.
3. Preserve correct lyric activation and syllable progress when the cover presentation is held.
4. Reevaluate a held intro on playback resume without ever returning to the cover after lyrics have appeared.
5. Replace the synthetic karaoke icon with a subtle, playback-driven treatment that belongs to the lyrics UI.
6. Preserve existing loading, no-lyrics, error, local-track, instrumental, provider, cache, settings, and native karaoke behavior.

## Non-goals

- Showing the cover again during later instrumental breaks.
- Returning to the cover after lyrics have been revealed once for the current track.
- Adding a configurable intro threshold or a Syllable Wake setting.
- Delaying static lyrics, which have no reliable vocal timing.
- Changing pseudo-karaoke generation or native syllable timing.
- Using a fixed timeout to drive the intro transition.

## Intro timing model

### First vocal time

A pure helper derives the first renderable vocal start time from a ready lyric document.

- `StaticLyrics`: no timed first vocal; reveal immediately.
- `LineLyrics`: minimum `startTime` among `type: "vocal"` entries.
- `SyllableLyrics`: minimum vocal start among lead and background vocals in all vocal sets.
- A document containing only interludes has no first vocal and reveals through the existing non-vocal behavior rather than holding forever.

The decision is based on the first vocal, not on whether the provider supplied an explicit leading interlude. Generated gaps and provider interludes therefore behave consistently.

### Two-second decision

`INTRO_IMMEDIATE_THRESHOLD_SEC` is a fixed internal constant with value `2`.

When timed lyrics first become ready, AuraLyrics resyncs the playback clock and computes:

```text
remaining = firstVocalStartSec - playbackTimestampSec
```

- No first vocal: reveal immediately.
- `remaining <= 2`: reveal immediately.
- `remaining > 2`: hold the intro presentation.
- Playback is already at or past the first vocal: reveal immediately.

The two-second threshold is evaluated when ready lyrics are accepted and when playback resumes while the intro is still held. It is not a continuously moving early-reveal boundary. A long intro that was intentionally held remains visible until the actual first vocal, unless playback is paused and resumed with two seconds or less remaining.

### Held intro presentation

Once lyrics are ready but the intro is held, the renderer shows Aurora Editorial track metadata in an intro-ready mode:

- album cover thumbnail;
- title;
- `artist · album`;
- no `LOADING` label;
- no progress line;
- no `NOW PLAYING` label.

This mode is semantically separate from loading and failure metadata even if it reuses the persistent metadata layout.

## State and ownership

A small presentation controller or equivalent explicit state in `ExtensionApp` owns the intro gate for the current track.

```text
idle -> loading -> holding-intro -> lyrics-revealed
                   \--------------> lyrics-revealed
```

The gate stores only the latest current `ReadyTrackSessionSnapshot` while holding. It does not copy lyric data or own playback time.

The gate resets on:

- track change;
- no-track transition;
- PiP close;
- application destroy;
- session invalidation or refresh that replaces the ready load state.

All ready-snapshot paths go through one presentation entry point:

- initial lyrics load;
- waveform or pseudo-karaoke enrichment;
- structural settings presentation.

If the intro is held, enrichment and settings results replace the pending snapshot after their existing generation, presentation-revision, track, session, and load-state guards pass. They do not mount lyrics early. If lyrics are already revealed, these paths keep their current remount/live-update behavior.

## Playback and synchronization

The intro gate never uses `setTimeout` or elapsed wall-clock time.

### Tick behavior

While a ready snapshot is held, the normal `PlaybackSynchronizer` continues to update even though the lyrics DOM is not mounted.

On each tick:

- if the gate is not holding, current behavior continues;
- if the synchronized timestamp is before the first vocal, the cover presentation stays visible;
- if the timestamp reaches or passes the first vocal, the latest pending snapshot is mounted exactly once.

Immediately after mounting, the renderer is synchronized to the same playback timestamp before the next painted frame. This first synchronization updates active/sung/idle classes, syllable gradient progress, interlude state, viewport focus, and scroll position without advancing a separate clock.

### Pause and resume

- Pausing does not advance the synchronizer or reveal lyrics.
- On resume, AuraLyrics resyncs from Spotify first.
- If the intro is still held and the first vocal is now two seconds or less away, lyrics reveal immediately.
- If more than two seconds remain, the intro stays held until the first vocal.
- If lyrics were already revealed, pause and resume never re-enter the intro presentation.

### Seek behavior

- A playing seek is observed by the existing 250 ms probe and 1.25 second snap rules.
- If a held intro jumps to or past the first vocal, the next synchronized tick reveals lyrics immediately.
- A seek while paused is honored by the resume resync.
- Seeking backward after lyrics were revealed does not return to the cover.

## Syllable Wake

### Presentation contract

Synthetic timing remains explicit in the DOM and accessibility tree, but not as a visible icon.

- The lyrics scene gets a stable synthetic timing class or data attribute when `timingSource === "synthetic"`.
- Native timing does not get this state.
- The current visible `.aura-timing-marker` corner shape is removed.
- A visually hidden description retains the localized accessible label for synthetic timing.

### Visual behavior

Syllable Wake reuses existing per-syllable playback progress rather than running a decorative looping sweep.

- The already-sung side of an active synthetic syllable receives a subtle theme-accent tint that blends into the normal foreground.
- The transition boundary creates a soft wake as lyric progress moves through the syllable.
- The active synthetic vocal group gets a low-amplitude ambient halo. Its motion may breathe slowly, but it must remain subordinate to lyric progress and must not add layout space or pointer interaction.
- Native syllable lyrics retain their current gradient, glow, and spring presentation.
- Line and static lyrics do not receive Syllable Wake.

The effect uses the adaptive theme accent, foreground, glow, and existing motion CSS variables. It must remain readable on both light and dark album themes.

### Motion settings

- `motionIntensity` scales the ambient part of the wake.
- `motionEnabled: false` disables independent breathing while retaining the playback-position tint.
- `reduceMotion: true` disables independent breathing and transitions immediately to the progress-derived visual state.
- The effect must not create a second animation clock for syllable progress.

## Error and edge behavior

- Slow network: existing `LOADING` metadata remains until the load resolves.
- Same-turn cache hit with a first vocal within two seconds: final DOM contains lyrics, not metadata.
- Load error, no lyrics, and local tracks: existing persistent metadata remains unchanged.
- Instrumental provider result: existing full album-art mode remains unchanged.
- Static lyrics: reveal immediately after loading.
- Stale track, session, enrichment, settings, or theme results cannot reveal or replace another track's held intro.
- A timed document with no vocal must not leave the cover held indefinitely.

## Testing

### Pure policy tests

- first vocal extraction for static, line, syllable, generated leading interlude, background vocal, and interlude-only documents;
- immediate threshold at `1.999`, `2.000`, and just above `2.000` seconds;
- already-past-first-vocal and no-first-vocal decisions;
- resume decision is separate from the held intro's normal reveal deadline.

### Extension integration tests

- same-turn cache hit with early vocals never leaves a metadata overlay;
- slow load still shows `LOADING` while unresolved;
- long intro switches from loading metadata to intro-ready metadata without label or progress;
- held intro remains until the synchronized first-vocal timestamp;
- reveal mounts the latest pending snapshot exactly once and immediately activates the correct lyric row;
- pause freezes the held state;
- resume with more than two seconds remaining keeps the cover;
- resume with two seconds or less remaining reveals immediately;
- pause/resume after reveal never returns to the cover;
- seek past the first vocal reveals on synchronized time;
- stale track and PiP close discard the pending intro;
- enrichment and structural settings update the pending snapshot without early mount.

### Renderer and style tests

- synthetic timing uses a root state and a visually hidden localized description;
- the old visible corner icon is absent;
- native timing does not receive the synthetic state;
- Syllable Wake consumes existing syllable progress and adaptive theme variables;
- native gradients remain unchanged;
- motion disabled and reduced motion remove independent breathing;
- dark and light theme contrast remains within existing requirements.

### Visual tests

- update the synthetic karaoke snapshot to Syllable Wake;
- add or update an intro-ready metadata snapshot without `LOADING` or progress;
- retain existing native karaoke, line sync, interlude, instrumental, and Aurora light/dark snapshots.

## Compatibility

- No new user setting.
- No changes to settings keys, normalization, presets, or translations except removal of the visible marker styling while preserving its existing localized accessible label.
- No changes to lyrics cache v2, provider ordering, retry, cooldown, canonical-only storage, pseudo-karaoke synthesis, or playback synchronization thresholds.
- No change to full album-art instrumental mode or persistent metadata failure behavior.
