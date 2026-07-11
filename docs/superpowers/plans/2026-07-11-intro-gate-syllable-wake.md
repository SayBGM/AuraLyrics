# Intro Gate 및 Syllable Wake 구현 계획

> **에이전트 작업자 필수 사항:** 이 계획을 작업 단위로 구현할 때 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 반드시 사용한다. 진행 상태는 체크박스(`- [ ]`)로 추적한다.

**목표:** 긴 시작 간주에서는 가사 싱크를 유지하면서 오로라 곡 정보 화면을 보여주고, 첫 보컬이 2초 이내면 화면을 건너뛰며, 가상 노래방 코너 아이콘을 재생 진행률 기반 Syllable Wake로 대체한다.

**구조:** 첫 보컬 판단을 담당하는 순수 policy와 playback track epoch 단위의 상태형 Intro Gate를 추가하고, `ExtensionApp`의 모든 ready snapshot 경로를 Gate로 통합한다. Gate는 `PlaybackSynchronizer.timestampSec`만 사용한다. `LyricsRenderer`는 synthetic timing을 접근 가능한 scene 상태로 노출하고 기존 음절 진행률로 Syllable Wake를 표현한다. `TrackTheme`에는 앨범 테마에서도 읽기 쉬운 대비 안전 wake foreground를 추가한다.

**기술 스택:** TypeScript, DOM/CSS, Spicetify API, Vitest/jsdom, Playwright/Chromium, Vite.

**설계 문서:** `docs/superpowers/specs/2026-07-11-intro-gate-syllable-wake-design.md`

---

## 파일 구성

**새로 생성**

- `src/app/IntroPresentationPolicy.ts` — 실제 표시되는 첫 보컬 계산과 2초 판단을 담당하는 순수 함수.
- `src/app/IntroPresentationGate.ts` — playback epoch의 revealed latch와 pending snapshot 수명주기.
- `tests/app/IntroPresentationPolicy.test.ts` — 첫 보컬 계산과 임계값 테스트.
- `tests/app/IntroPresentationGate.test.ts` — hold/reveal/refresh/PiP 수명주기 테스트.

**수정**

- `src/app/ExtensionApp.ts` — Gate 조율, resume/tick 공개, 최초 timestamp 동기화, ready snapshot 라우팅.
- `src/app/TrackPresentationState.ts` — 명시적인 intro-ready presentation 상태.
- `src/app/TrackThemeService.ts` — 대비 안전 `syntheticWakeForeground`.
- `src/renderer/LyricsRenderer.ts` — synthetic scene 상태, 접근성 설명, 즉시 timestamp 동기화.
- `src/renderer/components/TrackMetadata.ts` — label/진행선이 없는 `intro` metadata 모드.
- `src/renderer/components/SyllableVocals.ts` — 두 번째 시계 없이 진행률 기반 wake 변수 노출.
- `src/pip/DocumentPipController.ts` — wake foreground CSS 변수 적용.
- `src/styles/pip/baseStyles.ts` — fallback wake 변수와 visually hidden utility.
- `src/styles/pip/lyricsStyles.ts` — 기존 marker 스타일 제거 및 Syllable Wake 스타일.
- `tests/app/ExtensionApp.test.ts` — 최초 load, resume, seek, delay, enrichment/settings 경합 통합 테스트.
- `tests/app/TrackThemeService.test.ts` — wake 대비 fixture.
- `tests/renderer/LyricsRenderer.test.ts` — synthetic 접근성, native 격리, 즉시 sync.
- `tests/renderer/SyllableVocals.test.ts` — wake 진행률 및 모션 설정.
- `tests/pip/DocumentPipController.test.ts` — 테마 CSS 변수 적용/초기화.
- `tests/styles/pipStyles.test.ts` — marker 제거, wake selector, reduced-motion.
- `tests/visual/harness/main.ts` — intro-ready 및 Syllable Wake 시나리오.
- `tests/visual/lyrics-layout.visual.spec.ts` — Syllable Wake 및 intro-ready 시각 assertion.
- `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/*.png` — 갱신된 baseline.

---

### 작업 1: 순수 인트로 표시 정책

**파일**

- 생성: `src/app/IntroPresentationPolicy.ts`
- 생성: `tests/app/IntroPresentationPolicy.test.ts`

`@superpowers:test-driven-development`를 사용한다.

- [ ] **1단계: 첫 보컬 계산 실패 테스트 작성**

Static, 생성된 시작 interlude가 있는 line, interlude-only, syllable lead/background, `line-only`의 lead-only 시각을 포함한다.

```ts
expect(firstRenderedVocalStartSec(staticLyrics, "prefer-syllable")).toBeUndefined();
expect(firstRenderedVocalStartSec(lineLyricsWithIntro, "prefer-syllable")).toBe(8);
expect(firstRenderedVocalStartSec(syllableWithEarlyBackground, "prefer-syllable")).toBe(4);
expect(firstRenderedVocalStartSec(syllableWithEarlyBackground, "line-only")).toBe(7);
```

- [ ] **2단계: RED 확인**

실행: `npx vitest run tests/app/IntroPresentationPolicy.test.ts`

예상: `IntroPresentationPolicy`가 없어서 FAIL.

- [ ] **3단계: 최소 계산 helper 구현**

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

`minimum()`은 이 모듈 내부에 두고 빈 배열에서는 `undefined`를 반환한다.

- [ ] **4단계: 2초 판단 실패 테스트 작성**

```ts
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 8.001, applyImmediateThreshold: true })).toBe("reveal");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 8, applyImmediateThreshold: true })).toBe("reveal");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 7.999, applyImmediateThreshold: true })).toBe("hold");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 9, applyImmediateThreshold: false })).toBe("hold");
expect(introDecision({ firstVocalStartSec: 10, timestampSec: 10, applyImmediateThreshold: false })).toBe("reveal");
```

- [ ] **5단계: RED 확인 후 최소 구현 및 GREEN 확인**

실행: `npx vitest run tests/app/IntroPresentationPolicy.test.ts`

```ts
export const introDecision = ({
  firstVocalStartSec,
  timestampSec,
  applyImmediateThreshold,
}: IntroDecisionInput): "hold" | "reveal" => {
  if (firstVocalStartSec === undefined) return "reveal";
  const remaining = firstVocalStartSec - timestampSec;
  return remaining <= (applyImmediateThreshold ? INTRO_IMMEDIATE_THRESHOLD_SEC : 0)
    ? "reveal"
    : "hold";
};
```

예상: PASS.

- [ ] **6단계: 타입검사 및 커밋**

실행: `npm run typecheck`

```bash
git add src/app/IntroPresentationPolicy.ts tests/app/IntroPresentationPolicy.test.ts
git commit -m "feat: add intro presentation timing policy"
```

---

### 작업 2: 재생 트랙 epoch 단위 Intro Gate

**파일**

- 생성: `src/app/IntroPresentationGate.ts`
- 생성: `tests/app/IntroPresentationGate.test.ts`
- 사용: `src/app/IntroPresentationPolicy.ts`

`@superpowers:test-driven-development`를 사용한다.

- [ ] **1단계: hold/reveal 수명주기 실패 테스트 작성**

실제 `ReadyTrackSessionSnapshot` fixture로 다음을 검증한다.

- 긴 인트로는 `hold`.
- 빠른 보컬은 `reveal`.
- 일반 tick은 2초 임계값을 사용하지 않음.
- 첫 보컬 시각의 tick에서 정확히 한 번 공개.
- resume은 2초 임계값 사용.
- 한 번 공개된 뒤에는 과거 시각이나 refresh에서도 다시 hold하지 않음.

```ts
gate.beginTrackEpoch();
expect(gate.accept(snapshotAt10, settings, 0)).toMatchObject({ kind: "hold" });
expect(gate.tick(8.5)).toEqual({ kind: "none" });
expect(gate.resume(8.5)).toMatchObject({ kind: "reveal", snapshot: snapshotAt10 });
expect(gate.accept(refreshedSnapshotAt10, settings, 0)).toMatchObject({ kind: "reveal" });
```

- [ ] **2단계: RED 확인**

실행: `npx vitest run tests/app/IntroPresentationGate.test.ts`

예상: Gate가 없어서 FAIL.

- [ ] **3단계: 최소 명시적 상태 머신 구현**

```ts
export type IntroGateResult =
  | { kind: "none" }
  | { kind: "hold"; snapshot: ReadyTrackSessionSnapshot; firstVocalStartSec: number }
  | { kind: "reveal"; snapshot: ReadyTrackSessionSnapshot };
```

필수 public API:

```ts
class IntroPresentationGate {
  beginTrackEpoch(): void;
  endTrackEpoch(): void;
  hasActiveEpoch(): boolean;
  discardPendingSession(): void; // revealed latch는 보존
  accept(snapshot: ReadyTrackSessionSnapshot, settings: ExtensionSettings, timestampSec: number): IntroGateResult;
  resume(timestampSec: number): IntroGateResult;
  tick(timestampSec: number): IntroGateResult;
  isHolding(): boolean;
}
```

`accept()`는 최신 snapshot/settings로 첫 보컬을 항상 다시 계산한다. `reveal`을 반환할 때는 먼저 latch를 설정한다.

- [ ] **4단계: deadline 교체 실패 테스트 추가**

Held snapshot이 다음 값으로 교체되는 경우를 검증한다.

- 현재 시각보다 과거로 앞당겨진 첫 보컬
- 2초 이내로 앞당겨진 첫 보컬
- hold를 연장하는 더 늦은 첫 보컬
- `line-only`에서 `prefer-syllable`로 변경되어 더 이른 background가 표시되는 경우

- [ ] **5단계: 최신 pending 교체 구현 및 GREEN 확인**

실행: `npx vitest run tests/app/IntroPresentationGate.test.ts`

예상: 공개 시 항상 최신 snapshot을 반환하며 PASS.

- [ ] **6단계: session/epoch 수명 실패 테스트 추가**

- 공개 전 `discardPendingSession()`은 pending만 제거하고 playback epoch는 보존.
- 공개 후 `discardPendingSession()`도 latch 보존.
- `endTrackEpoch()` 뒤 새 `beginTrackEpoch()`는 fresh latch 생성.
- 공개 후 no-track reset.
- 같은 URI라도 repeat playback event면 fresh epoch 생성.

- [ ] **7단계: 수명주기 규칙 구현 및 재실행**

실행: `npx vitest run tests/app/IntroPresentationGate.test.ts`

예상: PASS.

- [ ] **8단계: 커밋**

```bash
git add src/app/IntroPresentationGate.ts tests/app/IntroPresentationGate.test.ts
git commit -m "feat: add playback epoch intro gate"
```

---

### 작업 3: 인트로 준비 완료 곡 정보와 기본 애플리케이션 라우팅

**파일**

- 수정: `src/renderer/components/TrackMetadata.ts:3-60`
- 수정: `src/app/TrackPresentationState.ts:4-32`
- 수정: `src/app/ExtensionApp.ts:40-440`
- 수정: `tests/renderer/LyricsRenderer.test.ts`
- 수정: `tests/app/ExtensionApp.test.ts`

`@superpowers:test-driven-development`를 사용한다.

- [ ] **1단계: intro metadata scene 실패 테스트 작성**

```ts
renderer.showTrackMetadata(root, { mode: "intro", track }, DEFAULT_SETTINGS);
expect(root.querySelector(".track-metadata-scene.intro")).not.toBeNull();
expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
expect(root.querySelector(".track-metadata-progress")).toBeNull();
expect(root.textContent).toContain(track.title);
```

- [ ] **2단계: RED 확인 후 명시적 모드 추가**

실행: `npx vitest run tests/renderer/LyricsRenderer.test.ts -t "intro metadata"`

`TrackMetadataViewModel["mode"]`를 `"loading" | "persistent" | "intro"`로 변경한다. Eyebrow와 진행선은 `loading`에서만 만든다.

- [ ] **3단계: 빠른 보컬과 긴 인트로 애플리케이션 실패 테스트 작성**

가능하면 실제 `TrackSessionController`와 fake player timestamp를 사용한다.

```ts
// 첫 보컬까지 1.5초
await internals.loadCurrentTrack(false);
expect(root.querySelector(".lyrics-track")).not.toBeNull();
expect(root.querySelector(".track-metadata-scene")).toBeNull();

// 첫 보컬까지 8초
await internals.loadCurrentTrack(false);
expect(root.querySelector(".track-metadata-scene.intro")).not.toBeNull();
expect(root.querySelector(".track-metadata-eyebrow")).toBeNull();
expect(root.querySelector(".track-metadata-progress")).toBeNull();
```

- [ ] **4단계: RED 확인**

실행: `npx vitest run tests/app/ExtensionApp.test.ts -t "intro"`

예상: 현재 코드는 모든 ready 가사를 즉시 마운트해 FAIL.

- [ ] **5단계: Ready snapshot을 Gate로 통합**

`IntroPresentationGate` 필드와 하나의 private 진입점을 추가한다.

```ts
private presentReadySnapshot(snapshot: ReadyTrackSessionSnapshot): void {
  const timestampSec = this.playbackSynchronizer.timestampSec;
  const result = this.introGate.accept(snapshot, this.settings.get(), timestampSec);
  if (result.kind === "hold") {
    this.renderPresentationState({ kind: "intro", track: snapshot.loadState.track });
    return;
  }
  if (result.kind === "reveal") {
    this.revealReadySnapshot(result.snapshot, timestampSec);
  }
}
```

모든 공개 원인은 다음 하나의 함수로 통합한다.

```ts
private revealReadySnapshot(snapshot: ReadyTrackSessionSnapshot, timestampSec: number): void {
  this.mountReadySnapshot(snapshot);
  this.renderer.update(timestampSec, 0);
}
```

최초 ready 판단 전에는 기존처럼 `playbackSynchronizer.resync()`를 호출한다. 판단에 사용한 timestamp, mount, 즉시 update의 timestamp가 동일해야 한다.

`TrackPresentationState`에 `{ kind: "intro"; track: TrackIdentity }`를 추가하고 no-lyrics 상태를 dispatch하지 않은 채 metadata mode `intro`를 렌더링한다.

- [ ] **6단계: 기존 loading/non-ready 상태와 epoch wiring 보존**

다음을 명시적으로 연결한다.

- `trackSession.load()` 전 기존 `loading` presentation 유지.
- error, no-lyrics, local, instrumental은 Gate를 통과하지 않음.
- `onTrackChanged(track)`는 `!session` 조기 반환 전에 처리한다. Defined track event는 항상 fresh epoch를 시작하고 `trackChanged(undefined)`는 epoch를 종료한다.
- `loadCurrentTrack()`의 no-track 분기도 방어적으로 epoch를 종료한다.
- `destroy()`는 epoch 종료.
- `closePip()`는 pending session만 버리고 revealed latch 보존.
- 최초 PiP open에서 현재 곡이 있고 `hasActiveEpoch()`가 false일 때만 epoch를 시작한다.
- Active epoch 상태의 PiP reopen과 수동 refresh는 새 epoch를 만들지 않는다.

PiP가 닫힌 상태의 defined/undefined `trackChanged`, 이미 곡이 재생 중인 최초 open, active epoch를 보존하는 reopen, destroy reset을 집중 테스트한다.

- [ ] **7단계: 집중 테스트 GREEN 확인**

```bash
npx vitest run tests/app/IntroPresentationPolicy.test.ts tests/app/IntroPresentationGate.test.ts tests/app/ExtensionApp.test.ts tests/renderer/LyricsRenderer.test.ts
```

- [ ] **8단계: 커밋**

```bash
git add src/app/ExtensionApp.ts src/app/TrackPresentationState.ts src/renderer/components/TrackMetadata.ts tests/app/ExtensionApp.test.ts tests/renderer/LyricsRenderer.test.ts
git commit -m "feat: hold track presentation through long intros"
```

---

### 작업 4: 재생 동기화, 재개·탐색, 대기 snapshot 경합

**파일**

- 수정: `src/app/ExtensionApp.ts:210-440`
- 수정: `tests/app/ExtensionApp.test.ts`
- 검증 대상: `src/player/PlaybackSynchronizer.ts`

`@superpowers:test-driven-development`를 사용한다.

- [ ] **1단계: tick/reveal 동기화 실패 테스트 작성**

Renderer spy로 이벤트 순서와 timestamp를 기록한다.

```ts
expect(events).toEqual([
  ["synchronizer-update", 8],
  ["mount", snapshot],
  ["update", 8, 0],
]);
```

Held intro는 `7.999`에서 유지되고 `8`에서 정확히 한 번 공개되며, 다음 frame 전에 올바른 row/음절 진행률이 활성화되는지 검증한다.

- [ ] **2단계: RED 확인 후 tick 기반 공개 구현**

실행: `npx vitest run tests/app/ExtensionApp.test.ts -t "synchronized intro"`

`tick()`에서:

1. 가사 DOM이 없어도 current snapshot이 ready면 `PlaybackSynchronizer`를 업데이트한다.
2. `introGate.tick(timestampSec)`을 호출한다.
3. 공개 결과면 공통 `revealReadySnapshot(snapshot, timestampSec)`을 호출한다.
4. Timeout을 만들지 않는다.

- [ ] **3단계: pause/resume 실패 테스트 작성**

- Pause 중 held intro 고정.
- Resume 시 2초보다 많이 남으면 유지.
- Resume 시 2초 이하면 resync 후 즉시 공개.
- 공개 후 resume으로 커버 재진입 없음.

- [ ] **4단계: resume 재평가 구현 및 재실행**

`onPlaybackChanged(true)`에서 `resync()`를 먼저 실행하고, `introGate.resume(timestampSec)` 결과를 동일한 `revealReadySnapshot()`으로 공개한다. Pause에서는 임계값을 판단하지 않는다.

- [ ] **5단계: delay 및 seek 실패 테스트 작성**

양수·음수 `lyricsDelayMs`의 최초·resume·tick 판단, 재생 중 첫 보컬 이후 seek, pause 중 seek 후 resume, 공개 후 backward seek, backward seek 후 수동 refresh를 검증한다.

- [ ] **6단계: 동기화된 timestamp만 사용**

Gate 또는 앱에서 raw player progress를 읽지 않는다. 기존 resync/probe 후 `playbackSynchronizer.timestampSec`만 사용한다.

- [ ] **7단계: enrichment/settings 교체 실패 테스트 작성**

Deferred snapshot으로 다음을 증명한다.

- 첫 보컬이 과거/더 이른 시각으로 이동하면 enriched snapshot으로 공개.
- 더 늦게 이동하면 hold 연장.
- 구조적 `syncPreference` 변경 시 표시되는 첫 보컬 재계산.
- 오래된 enrichment/settings 결과는 다른 곡을 교체하지 못함.
- 기존 presentation revision 규칙으로 waveform profile 보존.

- [ ] **8단계: Enrichment/settings를 공통 진입점으로 라우팅**

Snapshot을 accept하기 전에 기존 generation, session, track URI, load-state identity, `hasRenderableEnrichmentChanges()` 검사를 모두 유지한다.

Replacement accept 결과가 reveal이면 `revealReadySnapshot(snapshot, playbackSynchronizer.timestampSec)`을 사용한다. Initial ready, resume, tick, enrichment, settings replacement 각각에서 `mount -> 동일 timestamp update` 순서를 assertion한다. 일반 frame update와 seek snap/resync 테스트를 분리해 20초/1.25초 규칙을 혼동하지 않는다.

- [ ] **9단계: Gate lifetime 통합 테스트 작성 및 통과**

- Reveal → backward seek → manual refresh 후에도 가사 유지.
- 같은 playback epoch에서 reveal → PiP close/open 후 가사 유지.
- Hold 중 close는 pending 폐기, reopen 시 첫 보컬 근처/이후면 새 시각에서 공개.
- No-track은 latch 종료.
- 같은 URI 반복도 새 `trackChanged` 이벤트면 fresh latch.
- PiP가 닫힌 상태의 `trackChanged`가 fresh epoch 시작.
- PiP가 닫힌 상태의 `trackChanged(undefined)`가 epoch 종료.
- 이미 재생 중인 최초 PiP open은 epoch를 정확히 한 번 시작하고 reopen은 재시작하지 않음.
- `destroy()`는 현재 epoch 종료.

실행: `npx vitest run tests/app/ExtensionApp.test.ts tests/app/IntroPresentationGate.test.ts`

- [ ] **10단계: 커밋**

```bash
git add src/app/ExtensionApp.ts tests/app/ExtensionApp.test.ts tests/app/IntroPresentationGate.test.ts
git commit -m "fix: synchronize intro reveal with playback clock"
```

---

### 작업 5: 합성 타이밍 장면 상태와 접근성

**파일**

- 수정: `src/renderer/LyricsRenderer.ts:38-69,168-172`
- 수정: `src/styles/pip/baseStyles.ts`
- 수정: `src/styles/pip/lyricsStyles.ts:29-42`
- 수정: `tests/renderer/LyricsRenderer.test.ts:209-240`
- 수정: `tests/styles/pipStyles.test.ts`

`@superpowers:test-driven-development`를 사용한다.

- [ ] **1단계: 기존 folded-marker 테스트를 scene-state 실패 테스트로 교체**

```ts
renderer.mount(root, {
  lyrics: syllableLyrics,
  settings: koreanSettings,
  timingSource: "synthetic",
});
const scene = root.querySelector<HTMLElement>(".aura-lyrics");
const description = root.querySelector<HTMLElement>("[data-aura-synthetic-description]");

expect(scene?.classList.contains("synthetic-timing")).toBe(true);
expect(scene?.dataset.timingSource).toBe("synthetic");
expect(description?.textContent).toBe("가상 노래방 싱크");
expect(scene?.getAttribute("aria-describedby")).toBe(description?.id);
expect(root.querySelector(".aura-timing-marker")).toBeNull();
```

Native/missing timing, 영문/일문, 언어 remount도 추가한다.

- [ ] **2단계: RED 확인**

실행: `npx vitest run tests/renderer/LyricsRenderer.test.ts -t "synthetic timing"`

- [ ] **3단계: 접근 가능한 synthetic 상태 구현**

각 `LyricsRenderer` instance에 module counter 기반의 안정적이며 고유한 suffix를 부여한다. 예: `aura-synthetic-timing-description-${rendererInstanceId}`. Remount에서도 renderer별 ID를 재사용한다.

`data-aura-synthetic-description` hidden span을 만들고 `aria-describedby`로 연결하며 synthetic class/data attribute를 추가한다. 기존 보이는 marker/title/`role="img"` 구현은 제거한다.

같은 document에서 renderer 2개를 만들고 ID가 서로 다르며 각각 자기 현지화 설명을 참조하는지 테스트한다.

- [ ] **4단계: Marker CSS를 hidden utility로 교체**

`baseStyles.ts`에 `.aura-visually-hidden` utility를 추가하고 `lyricsStyles.ts`의 `.aura-timing-marker` 모양을 삭제한다.

- [ ] **5단계: 접근성 중심 browser assertion 추가**

Playwright 또는 집중 renderer 테스트에서 `aria-describedby` target을 resolve해 현지화 문구가 scene의 접근성 설명 source인지 검증한다. 연결되지 않은 hidden node의 존재만 검사하면 안 된다.

- [ ] **6단계: 집중 테스트 및 커밋**

```bash
npx vitest run tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
npm run typecheck
```

```bash
git add src/renderer/LyricsRenderer.ts src/styles/pip/baseStyles.ts src/styles/pip/lyricsStyles.ts tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
git commit -m "feat: replace synthetic timing marker with scene state"
```

---

### 작업 6: 대비 안전 Syllable Wake 테마 및 모션

**파일**

- 수정: `src/app/TrackThemeService.ts:6-18,70-158`
- 수정: `src/pip/DocumentPipController.ts:238-263` 및 `THEME_CSS_PROPERTIES`
- 수정: `src/styles/pip/baseStyles.ts:15-36`
- 수정: `src/styles/pip/lyricsStyles.ts:122-137,300-373`
- 수정: `src/renderer/components/SyllableVocals.ts:53-116`
- 수정: `tests/app/TrackThemeService.test.ts`
- 수정: `tests/pip/DocumentPipController.test.ts`
- 수정: `tests/renderer/SyllableVocals.test.ts`
- 수정: `tests/styles/pipStyles.test.ts`

`@superpowers:test-driven-development`를 사용한다.

- [ ] **1단계: 대비 안전 wake 색상 실패 테스트 작성**

`TrackTheme`에 다음 필드를 추가한다.

```ts
syntheticWakeForeground: string;
syntheticWakeRgb: string;
```

Dark, light, 중간 휘도, 저대비 accent palette에서 다음을 확인한다.

```ts
const surface = compositeThemeSurface(theme, worstCaseCoverPixel);
expect(contrastRatio(theme.syntheticWakeForeground, surface)).toBeGreaterThanOrEqual(4.5);
```

- [ ] **2단계: RED 확인 후 제한된 accent 혼합 구현**

실행: `npx vitest run tests/app/TrackThemeService.test.ts`

```ts
const wakeColorForSurface = (
  surface: string,
  foreground: string,
  accent: string
): string => {
  for (let step = 28; step >= 0; step -= 1) {
    const candidate = rgbToHex(
      blendRgb(requireRgb(foreground), requireRgb(accent), step / 100)
    );
    if (contrastRatio(candidate, surface) >= ACTIVE_CONTRAST_TARGET) {
      return candidate;
    }
  }
  return foreground;
};
```

`createTheme()`에서 이미 계산하는 동일한 worst-case scrimmed surface를 사용한다.

- [ ] **3단계: Wake 테마 변수 적용/초기화 TDD**

`tests/pip/DocumentPipController.test.ts`와 `tests/styles/pipStyles.test.ts`에 먼저 RED 테스트를 작성한다.

- 두 wake 변수 적용.
- Theme reset 시 두 변수 제거.
- Root fallback 값 존재.

실행:

```bash
npx vitest run tests/pip/DocumentPipController.test.ts tests/styles/pipStyles.test.ts
```

예상: 속성이 없어 FAIL.

이후 `--pip-synthetic-wake-color`, `--pip-synthetic-wake-rgb`를 theme property 목록, fallback root 변수, `DocumentPipController.applyTheme()`에 추가하고 PASS를 확인한다.

- [ ] **4단계: Syllable Wake 진행률 실패 테스트 작성**

Synthetic/native syllable scene을 25/50/75% 진행률에서 animate하고 synthetic element만 wake 진행 변수/class를 노출하는지 확인한다.

Synthetic `LineLyrics`와 `StaticLyrics`도 마운트해 scene은 접근 가능하게 synthetic으로 표시되지만 wake selector/변수는 적용되지 않는지 확인한다.

설정 테스트:

- `motionIntensity: 0`: halo opacity/진폭은 정확히 0, 진행 wake는 유지.
- `motionEnabled: false`: 독립 breathing class/animation 없음.
- `reduceMotion: true`: 독립 breathing transition 없이 즉시 진행 상태 반영.

- [ ] **5단계: 두 번째 진행 시계 없이 wake 구현**

`SyllableVocals.animate()`이 이미 설정하는 `--gradient-progress`를 재사용한다. 추가 숫자 변수가 필요하면 동일한 `progress`에서 계산한다. `requestAnimationFrame`, `setInterval`, 가사 sweep용 CSS animation을 추가하지 않는다.

Selector는 `.aura-lyrics.synthetic-timing` 아래로 제한해 native syllable 스타일을 가능한 한 그대로 유지한다.

- [ ] **6단계: 낮은 진폭 halo 추가**

Active synthetic vocal group에 pseudo-element 또는 additive shadow를 사용한다.

- 레이아웃 공간을 추가하지 않음.
- `pointer-events: none`.
- `--motion-intensity`로 opacity/진폭 조절.
- Intensity 0 또는 `.reduce-motion`에서 독립 halo가 0.
- Glyph opacity를 낮추거나 대비 안전 foreground를 대체하지 않음.

- [ ] **7단계: 집중 테스트 GREEN 확인**

```bash
npx vitest run tests/app/TrackThemeService.test.ts tests/pip/DocumentPipController.test.ts tests/renderer/SyllableVocals.test.ts tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
npm run typecheck
npm run lint
```

- [ ] **8단계: 커밋**

```bash
git add src/app/TrackThemeService.ts src/pip/DocumentPipController.ts src/renderer/components/SyllableVocals.ts src/styles/pip/baseStyles.ts src/styles/pip/lyricsStyles.ts tests/app/TrackThemeService.test.ts tests/pip/DocumentPipController.test.ts tests/renderer/SyllableVocals.test.ts tests/renderer/LyricsRenderer.test.ts tests/styles/pipStyles.test.ts
git commit -m "feat: add contrast safe syllable wake"
```

---

### 작업 7: 시각 회귀, 전체 검증, 로컬 Spotify 설치

**파일**

- 수정: `tests/visual/harness/main.ts`
- 수정: `tests/visual/lyrics-layout.visual.spec.ts`
- 이름 변경: `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-timing-marker.png` → `synthetic-syllable-wake.png`
- 생성: `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/aurora-intro-ready.png`

완료를 주장하기 전에 `@superpowers:verification-before-completion`을 사용한다.

- [ ] **1단계: Intro-ready 시각 시나리오 추가**

`mode: "intro"` track metadata를 렌더링한다. 제목, byline, cover는 보이고 `.track-metadata-eyebrow`와 `.track-metadata-progress`는 없는지 확인한다.

Harness의 수동 `applyTheme()` mapping에 `TrackTheme.syntheticWakeForeground` 및 `syntheticWakeRgb`를 각각 `--pip-synthetic-wake-color`, `--pip-synthetic-wake-rgb`로 추가한다. Visual test가 fallback이 아니라 시나리오 theme 값을 사용하는지 두 변수를 제한된 assertion으로 확인한다.

- [ ] **2단계: Folded-corner 시각 테스트 교체**

`synthetic-word-sync`에서 다음을 확인한다.

- `.synthetic-timing` 존재.
- 연결된 hidden 설명이 올바름.
- `.aura-timing-marker` 없음.
- Active syllable이 wake 색상/진행 변수 사용.
- Native `word-sync`에는 synthetic 상태 없음.

`synthetic-syllable-wake.png`를 캡처한다.

- [ ] **3단계: 기존 baseline 이동 및 orphan 부재 확인**

```bash
git mv tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-timing-marker.png \
  tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-syllable-wake.png
test ! -e tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/synthetic-timing-marker.png
```

- [ ] **4단계: 시각 RED 확인 후 snapshot 생성 및 GREEN 확인**

```bash
npm run test:visual
npm run test:visual:update
npm run test:visual
```

예상: 첫 실행은 변경되거나 없는 Syllable Wake/intro-ready baseline 때문에 FAIL. Update 후 의도한 snapshot을 작성하고 마지막 실행은 PASS. 두 PNG를 직접 확인한다.

- [ ] **5단계: 시각 baseline과 harness/spec 변경 커밋**

```bash
git add tests/visual/harness/main.ts tests/visual/lyrics-layout.visual.spec.ts tests/visual/__screenshots__
git commit -m "test: cover intro gate and syllable wake visuals"
```

`git status --short`가 깨끗한지 확인한다. 최종 리뷰 대상 HEAD에는 이 커밋이 포함돼야 한다.

- [ ] **6단계: Fresh 전체 검증 실행**

각 명령의 exit code와 출력을 직접 확인한다.

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:visual
git diff --check
git status --short
```

예상:

- TypeScript exit `0`.
- Biome exit `0`.
- 모든 Vitest file/test PASS.
- Vite build exit `0`.
- 모든 Playwright test PASS.
- whitespace 오류 없음.
- 이미 커밋된 candidate HEAD에서 worktree가 깨끗함.

- [ ] **7단계: 실제 최종 HEAD 코드 리뷰 요청**

`@superpowers:requesting-code-review`에 구현 base SHA와 product code, unit test, visual spec, snapshot baseline을 모두 포함한 현재 HEAD를 전달한다. Critical/Important 문제는 새 커밋에서 모두 수정한다.

- [ ] **8단계: 리뷰 수정마다 전체 suite 재실행**

리뷰 수정 후에는 일부 테스트만 실행하지 말고 6단계를 전부 반복한다. Reviewer가 APPROVED할 때까지 재검토한다. 승인된 HEAD에서 `git status --short`와 `git diff --check`가 깨끗해야 한다.

- [ ] **9단계: Clean reviewed HEAD를 빌드하고 로컬 설치**

모든 리뷰와 fresh 검증이 끝난 뒤 실행한다.

```bash
npm run build
cp dist/aura-lyrics.js ~/.spicetify/Extensions/aura-lyrics.js
shasum -a 256 dist/aura-lyrics.js ~/.spicetify/Extensions/aura-lyrics.js
spicetify apply
spicetify config extensions
```

두 SHA-256 값이 다르면 `spicetify apply` 전에 중단한다. 일치하면 적용하고 `aura-lyrics.js`가 활성 상태인지 확인한다. 외부 로컬 설치는 기존 사용자 승인/escalation 경계를 따른다.

- [ ] **10단계: 브랜치 완료 인계**

`@superpowers:finishing-a-development-branch`로 로컬 병합, PR, 유지, 폐기 옵션을 제시한다. 사용자 선택 없이 push 또는 merge하지 않는다.
