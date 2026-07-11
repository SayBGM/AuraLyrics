# Intro Gate and Syllable Wake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Aurora track metadata visible through long opening instrumentals without losing lyric sync, skip it for vocals within two seconds, and replace the synthetic karaoke corner icon with the playback-driven Syllable Wake treatment.

**Architecture:** Add a pure first-vocal policy and a stateful per-playback-epoch intro gate, then route every ready snapshot path in `ExtensionApp` through that gate. The gate consumes only `PlaybackSynchronizer.timestampSec`, while `LyricsRenderer` exposes synthetic timing through accessible scene state and existing syllable progress. Extend `TrackTheme` with a contrast-safe wake foreground so Syllable Wake remains readable across album themes.

**Tech Stack:** TypeScript, DOM/CSS, Spicetify APIs, Vitest/jsdom, Playwright/Chromium, Vite.

**Design reference:** `docs/superpowers/specs/2026-07-11-intro-gate-syllable-wake-design.md`

---

## File map

**Create**

- `src/app/IntroPresentationPolicy.ts` — pure first-rendered-vocal extraction and two-second decision.
- `src/app/IntroPresentationGate.ts` — playback-epoch reveal latch and pending snapshot lifecycle.
- `tests/app/IntroPresentationPolicy.test.ts` — timing extraction and boundary tests.
- `tests/app/IntroPresentationGate.test.ts` — hold/reveal/refresh/PiP lifecycle tests.

**Modify**

- `src/app/ExtensionApp.ts` — gate orchestration, resume/tick reveal, synchronized initial render, ready snapshot routing.
- `src/app/TrackPresentationState.ts` — explicit intro-ready presentation state.
- `src/app/TrackThemeService.ts` — contrast-safe `syntheticWakeForeground` theme value.
- `src/renderer/LyricsRenderer.ts` — synthetic scene state, accessible description, immediate timestamp synchronization.
- `src/renderer/components/TrackMetadata.ts` — explicit `intro` metadata mode without label/progress.
- `src/renderer/components/SyllableVocals.ts` — expose progress-derived wake variables without a second progress clock.
- `src/pip/DocumentPipController.ts` — publish wake foreground CSS variables.
- `src/styles/pip/baseStyles.ts` — fallback wake theme variables and visually hidden utility.
- `src/styles/pip/lyricsStyles.ts` — remove folded marker styling and add Syllable Wake styles.
- `tests/app/ExtensionApp.test.ts` — initial/load/resume/seek/delay/enrichment/settings integration.
- `tests/app/TrackThemeService.test.ts` — wake contrast fixtures.
- `tests/renderer/LyricsRenderer.test.ts` — synthetic accessibility/native isolation/immediate sync.
- `tests/renderer/SyllableVocals.test.ts` — wake progress and motion setting behavior.
- `tests/pip/DocumentPipController.test.ts` — theme CSS variable application/reset.
- `tests/styles/pipStyles.test.ts` — marker removal, wake selectors, reduced-motion rules.
- `tests/visual/harness/main.ts` — intro-ready and Syllable Wake scenarios.
- `tests/visual/lyrics-layout.visual.spec.ts` — Syllable Wake and intro-ready visual assertions.
- `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/*.png` — updated baselines.

---

### Task 1: Pure intro timing policy

**Files:**

- Create: `src/app/IntroPresentationPolicy.ts`
- Create: `tests/app/IntroPresentationPolicy.test.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing first-vocal extraction tests**

Cover static, line vocals with a generated leading interlude, interlude-only documents, syllable lead/background timing, and `line-only` lead-only timing.

```ts
expect(firstRenderedVocalStartSec(staticLyrics, "prefer-syllable")).toBeUndefined();
expect(firstRenderedVocalStartSec(lineLyricsWithIntro, "prefer-syllable")).toBe(8);
expect(firstRenderedVocalStartSec(syllableWithEarlyBackground, "prefer-syllable")).toBe(4);
expect(firstRenderedVocalStartSec(syllableWithEarlyBackground, "line-only")).toBe(7);
```

- [ ] **Step 2: Run the policy test to verify RED**

Run: `npx vitest run tests/app/IntroPresentationPolicy.test.ts`

Expected: FAIL because `IntroPresentationPolicy` does not exist.

- [ ] **Step 3: Implement the minimal extraction helper**

```ts
export const INTRO_IMMEDIATE_THRESHOLD_SEC = 2;

export const firstRenderedVocalStartSec = (
  lyrics: LyricsDocument,
  syncPreference: SyncPreference
): number | undefined => {
  if (lyrics.type === "static") return undefined;
  if (lyrics.type === "line") {
    return minimum(lyrics.content.filter(isVocal).map((item) => item.startTime));
  }
  return minimum(
    lyrics.content.filter(isVocalSet).flatMap((item) =>
      syncPreference === "line-only"
        ? [item.lead.startTime]
        : [item.lead.startTime, ...(item.background ?? []).map((vocal) => vocal.startTime)]
    )
  );
};
```

Keep `minimum()` local and return `undefined` for an empty list.

- [ ] **Step 4: Write failing two-second decision tests**

```ts
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 8.001, applyImmediateThreshold: true })).toBe("reveal");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 8, applyImmediateThreshold: true })).toBe("reveal");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 7.999, applyImmediateThreshold: true })).toBe("hold");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 9, applyImmediateThreshold: false })).toBe("hold");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 10, applyImmediateThreshold: false })).toBe("reveal");
```

- [ ] **Step 5: Verify RED, implement, and rerun GREEN**

Run: `npx vitest run tests/app/IntroPresentationPolicy.test.ts`

Implement:

```ts
export const introDecision = ({ firstVocalStartSec, timestampSec, applyImmediateThreshold }: IntroDecisionInput): "hold" | "reveal" => {
  if (firstVocalStartSec === undefined) return "reveal";
  const remaining = firstVocalStartSec - timestampSec;
  return remaining <= (applyImmediateThreshold ? INTRO_IMMEDIATE_THRESHOLD_SEC : 0) ? "reveal" : "hold";
};
```

Expected: PASS.

- [ ] **Step 6: Run typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/app/IntroPresentationPolicy.ts tests/app/IntroPresentationPolicy.test.ts
git commit -m "feat: add intro presentation timing policy"
```

---

### Task 2: Playback-epoch intro gate

**Files:**

- Create: `src/app/IntroPresentationGate.ts`
- Create: `tests/app/IntroPresentationGate.test.ts`
- Use: `src/app/IntroPresentationPolicy.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write the failing hold/reveal lifecycle tests**

Test these outcomes with real `ReadyTrackSessionSnapshot` fixtures:

- long intro accepts as `hold`;
- early vocal accepts as `reveal`;
- a normal tick does not use the two-second threshold;
- tick at the first vocal reveals exactly once;
- resume uses the threshold;
- once revealed, backward time and refresh never hold again.

```ts
gate.beginTrackEpoch();
expect(gate.accept(snapshotAt10, settings, 0)).toMatchObject({ kind: "hold" });
expect(gate.tick(8.5)).toEqual({ kind: "none" });
expect(gate.resume(8.5)).toMatchObject({ kind: "reveal", snapshot: snapshotAt10 });
expect(gate.accept(refreshedSnapshotAt10, settings, 0)).toMatchObject({ kind: "reveal" });
```

- [ ] **Step 2: Run the gate test to verify RED**

Run: `npx vitest run tests/app/IntroPresentationGate.test.ts`

Expected: FAIL because the gate does not exist.

- [ ] **Step 3: Implement the smallest explicit state machine**

Use a discriminated result type:

```ts
export type IntroGateResult =
  | { kind: "none" }
  | { kind: "hold"; snapshot: ReadyTrackSessionSnapshot; firstVocalStartSec: number }
  | { kind: "reveal"; snapshot: ReadyTrackSessionSnapshot };
```

Required public operations:

```ts
class IntroPresentationGate {
  beginTrackEpoch(): void;
  endTrackEpoch(): void;
  hasActiveEpoch(): boolean;
  discardPendingSession(): void; // preserve revealed latch
  accept(snapshot: ReadyTrackSessionSnapshot, settings: ExtensionSettings, timestampSec: number): IntroGateResult;
  resume(timestampSec: number): IntroGateResult;
  tick(timestampSec: number): IntroGateResult;
  isHolding(): boolean;
}
```

`accept()` always recomputes first vocal from the newest snapshot/settings. A result that reveals sets the latch before returning.

- [ ] **Step 4: Add failing replacement-deadline tests**

Test a held snapshot replaced by:

- an earlier first vocal already behind current time;
- an earlier first vocal within two seconds;
- a later first vocal that extends the hold;
- `line-only` changed to `prefer-syllable` with an earlier background vocal.

- [ ] **Step 5: Implement latest-pending replacement behavior and rerun GREEN**

Run: `npx vitest run tests/app/IntroPresentationGate.test.ts`

Expected: PASS, with the latest snapshot returned on reveal.

- [ ] **Step 6: Add failing session/epoch lifetime tests**

Cover:

- `discardPendingSession()` before reveal clears pending data but preserves the playback epoch;
- revealed latch survives `discardPendingSession()`;
- `endTrackEpoch()` and the next `beginTrackEpoch()` create a fresh latch;
- no-track reset after reveal;
- repeat playback can start a fresh epoch even with the same URI.

- [ ] **Step 7: Implement lifecycle reset rules and rerun**

Run: `npx vitest run tests/app/IntroPresentationGate.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/IntroPresentationGate.ts tests/app/IntroPresentationGate.test.ts
git commit -m "feat: add playback epoch intro gate"
```

---

### Task 3: Intro-ready metadata and basic application routing

**Files:**

- Modify: `src/renderer/components/TrackMetadata.ts:3-60`
- Modify: `src/app/TrackPresentationState.ts:4-32`
- Modify: `src/app/ExtensionApp.ts:40-440`
- Modify: `tests/renderer/LyricsRenderer.test.ts`
- Modify: `tests/app/ExtensionApp.test.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write a failing intro metadata scene test**

```ts
renderer.showTrackMetadata(root, { mode: "intro", track }, DEFAULT_SETTINGS);
expect(root.querySelector(".track-metadata-scene.intro")).not.toBeNull();
expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
expect(root.querySelector(".track-metadata-progress")).toBeNull();
expect(root.textContent).toContain(track.title);
```

- [ ] **Step 2: Verify RED and add the explicit mode**

Run: `npx vitest run tests/renderer/LyricsRenderer.test.ts -t "intro metadata"`

Change `TrackMetadataViewModel["mode"]` to `"loading" | "persistent" | "intro"`. Only `loading` creates the eyebrow and progress.

- [ ] **Step 3: Write failing early-vocal and long-intro application tests**

Use real `TrackSessionController` behavior where practical and a fake player timestamp.

```ts
// first vocal 1.5 seconds away
await internals.loadCurrentTrack(false);
expect(root.querySelector(".lyrics-track")).not.toBeNull();
expect(root.querySelector(".track-metadata-scene")).toBeNull();

// first vocal 8 seconds away
await internals.loadCurrentTrack(false);
expect(root.querySelector(".track-metadata-scene.intro")).not.toBeNull();
expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
expect(root.querySelector(".track-metadata-progress")).toBeNull();
```

- [ ] **Step 4: Run tests to verify RED**

Run: `npx vitest run tests/app/ExtensionApp.test.ts -t "intro"`

Expected: current code mounts all ready lyrics immediately.

- [ ] **Step 5: Route ready snapshots through the gate**

Add an `IntroPresentationGate` field and one private entry point, for example:

```ts
private presentReadySnapshot(snapshot: ReadyTrackSessionSnapshot): void {
  const result = this.introGate.accept(snapshot, this.settings.get(), this.playbackSynchronizer.timestampSec);
  if (result.kind === "hold") {
    this.renderPresentationState({ kind: "intro", track: snapshot.loadState.track });
    return;
  }
  if (result.kind === "reveal") {
    this.revealReadySnapshot(result.snapshot, this.playbackSynchronizer.timestampSec);
  }
}
```

All reveal causes use one method. It owns both mount and first-frame synchronization:

```ts
private revealReadySnapshot(snapshot: ReadyTrackSessionSnapshot, timestampSec: number): void {
  this.mountReadySnapshot(snapshot);
  this.renderer.update(timestampSec, 0);
}
```

Before the initial ready decision, call `playbackSynchronizer.resync()` exactly as current loading does. The accepted timestamp, mount, and immediate update must therefore be identical.

Add `{ kind: "intro"; track: TrackIdentity }` to `TrackPresentationState`, rendering metadata mode `intro` without dispatching a no-lyrics state.

- [ ] **Step 6: Preserve existing loading and non-ready states**

Keep the initial call to `renderPresentationState({ kind: "loading", track })` before `trackSession.load()`. Do not route error, no-lyrics, local, or instrumental states through the gate.

Wire playback-epoch lifecycle explicitly in this task:

- `onTrackChanged(track)` handles both branches before the `!session` early return: every defined player track event starts a fresh gate epoch, while `trackChanged(undefined)` ends it. PiP-closed changes, no-track events, and same-URI repeat events therefore cannot be missed;
- the defensive no-track branch in `loadCurrentTrack()` also ends the epoch, but it is not the only no-track reset path;
- `destroy()` ends the epoch;
- `closePip()` calls `discardPendingSession()` but preserves the revealed latch;
- the first PiP open calls `beginTrackEpoch()` only when a current track exists and `hasActiveEpoch()` is false. This covers an app that starts while Spotify is already playing and no player event was observed;
- PiP reopen with an active epoch and manual refresh never start a new epoch by themselves.

Add focused integration tests for defined and undefined `trackChanged` while PiP is closed, initial PiP open with an already-playing track, reopen preserving an active epoch, and `destroy()` reset. Full held/revealed close/reopen and repeat behavior remains in Task 4.

- [ ] **Step 7: Run focused tests GREEN**

Run:

```bash
npx vitest run tests/app/IntroPresentationPolicy.test.ts tests/app/IntroPresentationGate.test.ts tests/app/ExtensionApp.test.ts tests/renderer/LyricsRenderer.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/app/ExtensionApp.ts src/app/TrackPresentationState.ts src/renderer/components/TrackMetadata.ts tests/app/ExtensionApp.test.ts tests/renderer/LyricsRenderer.test.ts
git commit -m "feat: hold track presentation through long intros"
```

---

### Task 4: Playback synchronization, resume/seek, and pending snapshot races

**Files:**

- Modify: `src/app/ExtensionApp.ts:210-440`
- Modify: `tests/app/ExtensionApp.test.ts`
- Test against: `src/player/PlaybackSynchronizer.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing tick/reveal synchronization tests**

Use a renderer spy that records ordering and timestamps:

```ts
expect(events).toEqual([
  ["synchronizer-update", 8],
  ["mount", snapshot],
  ["update", 8, 0],
]);
```

Assert the held intro remains at `7.999`, reveals at `8`, mounts once, and the correct row/syllable progress is active before the next frame.

- [ ] **Step 2: Verify RED, then implement tick-driven reveal**

Run: `npx vitest run tests/app/ExtensionApp.test.ts -t "synchronized intro"`

In `tick()`:

1. update `PlaybackSynchronizer` whenever the current snapshot is ready, even when no lyrics DOM is mounted;
2. ask `introGate.tick(timestampSec)`;
3. if it reveals, call the shared `revealReadySnapshot(snapshot, timestampSec)`, which mounts and calls `renderer.update(timestampSec, 0)` before returning or continuing;
4. never schedule a timeout.

- [ ] **Step 3: Write failing pause/resume tests**

Cover:

- pause freezes a held intro;
- resume with `> 2` seconds remaining keeps it;
- resume with `<= 2` seconds remaining reveals immediately after resync;
- resume after reveal never re-enters cover.

- [ ] **Step 4: Implement resume reevaluation and rerun**

In `onPlaybackChanged(true)`, call `resync()` first, then `introGate.resume(timestampSec)`, then call the same `revealReadySnapshot(snapshot, timestampSec)` when returned. Do not evaluate threshold on pause.

- [ ] **Step 5: Write failing delay and seek tests**

Add positive and negative `lyricsDelayMs` fixtures for initial, resume, and tick decisions. Test playing seek past first vocal, paused seek followed by resume, backward seek after reveal, and backward seek plus manual refresh.

- [ ] **Step 6: Implement only through synchronized timestamps**

Do not read raw player progress in the gate or app. Reuse `playbackSynchronizer.timestampSec` after existing resync/probe behavior.

- [ ] **Step 7: Write failing enrichment/settings replacement tests**

Use deferred snapshots to prove:

- enrichment that moves first vocal earlier/past current time reveals with the enriched snapshot;
- enrichment that moves it later extends the hold;
- structural `syncPreference` change recomputes rendered first vocal;
- stale enrichment/settings results cannot replace another track;
- waveform profile remains preserved by existing presentation-revision logic.

- [ ] **Step 8: Route enrichment and settings through `presentReadySnapshot()`**

Keep all existing generation, session, track URI, load-state identity, and `hasRenderableEnrichmentChanges()` checks before accepting a replacement.

If replacement acceptance returns reveal, use `revealReadySnapshot(snapshot, playbackSynchronizer.timestampSec)` so initial ready, resume, tick, enrichment, and settings replacement all share the exact `mount -> update(same timestamp)` contract. Add an event-order assertion for each cause. Keep seek-snap/resync tests separate from the ordinary frame update test so the 20-second and 1.25-second synchronizer rules are not conflated.

- [ ] **Step 9: Write and pass gate lifetime integration tests**

Cover:

- reveal -> backward seek -> manual refresh stays lyrics;
- reveal -> PiP close/open on the same playback epoch stays lyrics;
- close while held discards pending, then reopen near/past first vocal reveals from the new position;
- no-track ends the latch;
- a new `trackChanged` event starts a new latch, including same-URI repeat.
- `trackChanged` while PiP is closed still starts the next epoch before returning;
- `trackChanged(undefined)` while PiP is closed still ends the epoch before returning;
- first PiP open with an already-playing track starts exactly one epoch, while reopen on the same active epoch does not restart it;
- application `destroy()` ends the current epoch.

Run: `npx vitest run tests/app/ExtensionApp.test.ts tests/app/IntroPresentationGate.test.ts`

- [ ] **Step 10: Commit**

```bash
git add src/app/ExtensionApp.ts tests/app/ExtensionApp.test.ts tests/app/IntroPresentationGate.test.ts
git commit -m "fix: synchronize intro reveal with playback clock"
```

---

### Task 5: Synthetic timing scene state and accessibility

**Files:**

- Modify: `src/renderer/LyricsRenderer.ts:38-69,168-172`
- Modify: `src/styles/pip/baseStyles.ts`
- Modify: `src/styles/pip/lyricsStyles.ts:29-42`
- Modify: `tests/renderer/LyricsRenderer.test.ts:209-240`
- Modify: `tests/styles/pipStyles.test.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Replace folded-marker tests with failing scene-state tests**

```ts
renderer.mount(root, { lyrics: syllableLyrics, settings: koreanSettings, timingSource: "synthetic" });
const scene = root.querySelector<HTMLElement>(".aura-lyrics");
const description = root.querySelector<HTMLElement>("[data-aura-synthetic-description]");

expect(scene?.classList.contains("synthetic-timing")).toBe(true);
expect(scene?.dataset.timingSource).toBe("synthetic");
expect(description?.textContent).toBe("가상 노래방 싱크");
expect(scene?.getAttribute("aria-describedby")).toBe(description?.id);
expect(root.querySelector(".aura-timing-marker")).toBeNull();
```

Add native timing, missing timing, English/Japanese, and language-remount cases.

- [ ] **Step 2: Run renderer tests to verify RED**

Run: `npx vitest run tests/renderer/LyricsRenderer.test.ts -t "synthetic timing"`

- [ ] **Step 3: Implement accessible synthetic state**

Give each `LyricsRenderer` instance a stable unique suffix from a module counter, for example `aura-synthetic-timing-description-${rendererInstanceId}`. Reuse that renderer-specific ID across remounts, create a hidden span with `data-aura-synthetic-description`, connect it with `aria-describedby`, and add the synthetic class/data attribute. Remove the visible marker/title/`role="img"` implementation.

Add a same-document test with two renderer instances: both IDs must differ and each scene must reference its own localized description.

- [ ] **Step 4: Replace marker CSS with a hidden utility**

Add an `.aura-visually-hidden` utility in `baseStyles.ts`. Delete the `.aura-timing-marker` shape from `lyricsStyles.ts`.

- [ ] **Step 5: Add an accessibility-focused browser assertion**

In Playwright or a focused renderer test, resolve the `aria-describedby` target and assert that the localized text is the scene's accessible description source. Do not only assert that an unrelated hidden node exists.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npx vitest run tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
npm run typecheck
```

```bash
git add src/renderer/LyricsRenderer.ts src/styles/pip/baseStyles.ts src/styles/pip/lyricsStyles.ts tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
git commit -m "feat: replace synthetic timing marker with scene state"
```

---

### Task 6: Contrast-safe Syllable Wake theme and motion

**Files:**

- Modify: `src/app/TrackThemeService.ts:6-18,70-158`
- Modify: `src/pip/DocumentPipController.ts:238-263` and `THEME_CSS_PROPERTIES`
- Modify: `src/styles/pip/baseStyles.ts:15-36`
- Modify: `src/styles/pip/lyricsStyles.ts:122-137,300-373`
- Modify: `src/renderer/components/SyllableVocals.ts:53-116`
- Modify: `tests/app/TrackThemeService.test.ts`
- Modify: `tests/pip/DocumentPipController.test.ts`
- Modify: `tests/renderer/SyllableVocals.test.ts`
- Modify: `tests/styles/pipStyles.test.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing contrast-safe wake color tests**

Extend `TrackTheme` with:

```ts
syntheticWakeForeground: string;
syntheticWakeRgb: string;
```

For dark, light, middle-luminance, and low-contrast accent palettes, assert:

```ts
const surface = compositeThemeSurface(theme, worstCaseCoverPixel);
expect(contrastRatio(theme.syntheticWakeForeground, surface)).toBeGreaterThanOrEqual(4.5);
```

- [ ] **Step 2: Verify RED and implement constrained accent blending**

Run: `npx vitest run tests/app/TrackThemeService.test.ts`

Implement a pure helper that tries the desired accent blend from strongest to weakest and falls back to foreground:

```ts
const wakeColorForSurface = (surface: string, foreground: string, accent: string): string => {
  for (let step = 28; step >= 0; step -= 1) {
    const candidate = rgbToHex(blendRgb(requireRgb(foreground), requireRgb(accent), step / 100));
    if (contrastRatio(candidate, surface) >= ACTIVE_CONTRAST_TARGET) return candidate;
  }
  return foreground;
};
```

Use the same worst-case scrimmed surface already computed in `createTheme()`.

- [ ] **Step 3: Publish and reset wake theme variables**

First write RED tests in `tests/pip/DocumentPipController.test.ts` and `tests/styles/pipStyles.test.ts` for applying both wake variables, removing both on theme reset, and providing fallback root values. Run:

```bash
npx vitest run tests/pip/DocumentPipController.test.ts tests/styles/pipStyles.test.ts
```

Expected: FAIL because the properties do not exist. Then add `--pip-synthetic-wake-color` and `--pip-synthetic-wake-rgb` to the theme property list, fallback root variables, and `DocumentPipController.applyTheme()`. Rerun and expect PASS.

- [ ] **Step 4: Write failing Syllable Wake progress tests**

Mount synthetic and native syllable scenes, animate to 25/50/75% progress, and assert synthetic elements expose the progress-driven wake variables/class while native elements do not.

Also mount synthetic `LineLyrics` and `StaticLyrics` fixtures and assert they do not receive wake selectors/variables even though the scene remains accessibly marked as synthetic timing.

Add settings tests:

- `motionIntensity: 0` -> halo opacity/amplitude exactly `0`, progress wake remains;
- `motionEnabled: false` -> no independent breathing class/animation;
- `reduceMotion: true` -> no independent breathing transition, immediate progress state.

- [ ] **Step 5: Implement wake state without a second progress clock**

Reuse `--gradient-progress` already set in `SyllableVocals.animate()`. If an additional numeric variable is needed, derive it in the same method from the same `progress`; do not add `requestAnimationFrame`, `setInterval`, or CSS animation for the lyric sweep.

Use selectors scoped to `.aura-lyrics.synthetic-timing` so native syllable styles remain byte-for-byte equivalent where possible.

- [ ] **Step 6: Add the low-amplitude halo**

Use a pseudo-element or additive shadow on active synthetic vocal groups. It must:

- add no layout size;
- use `pointer-events: none`;
- scale opacity/amplitude with `--motion-intensity`;
- resolve to zero independent halo at intensity zero or `.reduce-motion`;
- never reduce glyph opacity or replace the contrast-safe foreground.

- [ ] **Step 7: Run focused tests GREEN**

Run:

```bash
npx vitest run tests/app/TrackThemeService.test.ts tests/pip/DocumentPipController.test.ts tests/renderer/SyllableVocals.test.ts tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add src/app/TrackThemeService.ts src/pip/DocumentPipController.ts src/renderer/components/SyllableVocals.ts src/styles/pip/baseStyles.ts src/styles/pip/lyricsStyles.ts tests/app/TrackThemeService.test.ts tests/pip/DocumentPipController.test.ts tests/renderer/SyllableVocals.test.ts tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
git commit -m "feat: add contrast safe syllable wake"
```

---

### Task 7: Visual regression, full verification, and local Spotify install

**Files:**

- Modify: `tests/visual/harness/main.ts`
- Modify: `tests/visual/lyrics-layout.visual.spec.ts`
- Rename: `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-timing-marker.png` to `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-syllable-wake.png`
- Create: `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/aurora-intro-ready.png`

Use `@superpowers:verification-before-completion` before claiming completion.

- [ ] **Step 1: Add the intro-ready visual scenario**

Render track metadata with `mode: "intro"`. Assert title/byline/cover are visible and `.track-metadata-eyebrow` plus `.track-metadata-progress` are absent.

Update the harness's manual `applyTheme()` mapping to set `--pip-synthetic-wake-color` and `--pip-synthetic-wake-rgb` from `TrackTheme`. Visual tests must consume the scenario theme, not fallback values. Add a bounded harness assertion for both variables.

- [ ] **Step 2: Replace the folded-corner visual test**

Render `synthetic-word-sync` and assert:

- `.synthetic-timing` exists;
- linked hidden description is correct;
- no `.aura-timing-marker` exists;
- active syllables use wake color/progress variables;
- native `word-sync` has no synthetic state.

Capture `synthetic-syllable-wake.png`.

- [ ] **Step 3: Move the old baseline and verify no orphan remains**

Run before snapshot generation:

```bash
git mv tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-timing-marker.png \
  tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-syllable-wake.png
test ! -e tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-timing-marker.png
```

- [ ] **Step 4: Verify visual RED, then generate and verify GREEN**

Run:

```bash
npm run test:visual
npm run test:visual:update
npm run test:visual
```

Expected: the first run fails for the changed/missing Syllable Wake and intro-ready baselines; the update writes the intended snapshots; the final run passes. Inspect both PNGs directly.

- [ ] **Step 5: Commit visual baselines and harness/spec changes**

```bash
git add tests/visual/harness/main.ts tests/visual/lyrics-layout.visual.spec.ts tests/visual/__screenshots__
git commit -m "test: cover intro gate and syllable wake visuals"
```

Confirm `git status --short` is clean. The reviewed final HEAD must include this commit.

- [ ] **Step 6: Run the complete fresh verification suite**

Run each command and inspect its exit code/output:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:visual
git diff --check
git status --short
```

Expected:

- TypeScript exit `0`;
- Biome exit `0`;
- all Vitest files/tests pass;
- Vite build exit `0`;
- all Playwright tests pass;
- no whitespace errors;
- worktree is clean at the already committed candidate HEAD.

- [ ] **Step 7: Request final code review of the actual HEAD**

Use `@superpowers:requesting-code-review` with the implementation base SHA and the current HEAD that already contains product code, unit tests, visual specs, and snapshot baselines. Fix every Critical/Important issue in a new commit.

- [ ] **Step 8: After every review fix, rerun the complete suite**

Repeat Step 6 in full after each review fix, not only affected tests. Redispatch the reviewer until APPROVED. Confirm the approved HEAD is clean with `git status --short` and `git diff --check`.

- [ ] **Step 9: Build and install the clean reviewed HEAD locally**

After all reviews and fresh verification pass:

```bash
npm run build
cp dist/aura-lyrics.js ~/.spicetify/Extensions/aura-lyrics.js
shasum -a 256 dist/aura-lyrics.js ~/.spicetify/Extensions/aura-lyrics.js
spicetify apply
spicetify config extensions
```

Stop before `spicetify apply` if the two SHA-256 values do not match. After a match, apply and confirm `aura-lyrics.js` remains enabled. This external local install step requires the existing user authorization/escalation boundary.

- [ ] **Step 10: Hand off branch completion**

Use `@superpowers:finishing-a-development-branch` to offer local merge, PR, keep-as-is, or discard. Do not push or merge without the user's choice.
