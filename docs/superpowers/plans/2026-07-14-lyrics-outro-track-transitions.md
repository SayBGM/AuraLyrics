# Lyrics Outro and Track Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마지막 렌더 보컬 종료 2초 뒤 현재 곡 정보를 보여주고, 곡 변경 원인에 따라 전체 콘텐츠를 위·왼쪽·오른쪽으로 전환한다.

**Architecture:** 재생 시각 정책, playback epoch 상태, 이동 intent/자연 종료 판정을 순수 모듈로 분리하고 `ExtensionApp`이 Intro Gate 다음에 Outro Controller를 조율한다. `LyricsRenderer`는 generation 기반 scene presenter로 모든 콘텐츠를 교체하며, `DocumentPipController`는 double-buffer cover를 관리한다. 기존 `TrackSessionController`의 URI/generation guard와 새 transition generation을 함께 사용해 빠른 스킵과 늦은 비동기 결과를 차단한다.

**Tech Stack:** TypeScript, DOM/CSS, Spicetify Player API, Vitest/jsdom, Playwright/Chromium, Vite.

**Design:** `docs/superpowers/specs/2026-07-14-lyrics-outro-track-transitions-design.md`

---

## File map

**Create**

- `src/app/OutroPresentationPolicy.ts` — 마지막 렌더 보컬 종료 시각과 2초 임계값 계산.
- `src/app/OutroPresentationController.ts` — playback epoch별 lyrics/metadata 표현 상태.
- `src/app/TrackTransitionDirectionController.ts` — 명시적 이동 intent FIFO와 자연 종료 fallback 판정.
- `src/renderer/SceneTransitionController.ts` — 두 scene plane, 방향 class, generation, theme snapshot 수명주기.
- `src/pip/PipCoverTransitionController.ts` — 두 cover plane의 load/failure/crossfade 수명주기.
- `src/shared/themeCssProperties.ts` — 적용과 outgoing freeze가 함께 사용하는 theme CSS property 목록.
- `src/styles/pip/transitionStyles.ts` — scene slide 및 cover crossfade 스타일.
- `tests/app/OutroPresentationPolicy.test.ts`
- `tests/app/OutroPresentationController.test.ts`
- `tests/app/TrackTransitionDirectionController.test.ts`
- `tests/renderer/SceneTransitionController.test.ts`
- `tests/pip/PipCoverTransitionController.test.ts`

**Modify**

- `src/app/ExtensionApp.ts` — Outro 통합, progress/seek 평가, 곡 변경 방향 결정, transition 중 후속 표현 보류.
- `src/player/SpicetifyPlayerAdapter.ts` — URI가 붙은 마지막 progress 보존 및 songchange payload.
- `src/runtime/spicetify.d.ts` — 공식 `onprogress` 이벤트 타입.
- `src/renderer/LyricsRenderer.ts` — 모든 scene 생성을 공통 presenter로 라우팅.
- `src/pip/DocumentPipController.ts` — cover controller 사용과 session 정리.
- `src/styles/pipStyles.ts` — transition stylesheet 포함.
- `tests/player/SpicetifyPlayerAdapter.test.ts`
- `tests/renderer/LyricsRenderer.test.ts`
- `tests/pip/DocumentPipController.test.ts`
- `tests/app/ExtensionApp.test.ts`
- `tests/styles/pipStyles.test.ts`
- `tests/visual/harness/main.ts`
- `tests/visual/lyrics-layout.visual.spec.ts`
- `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/*.png`

---

### Task 1: 마지막 렌더 보컬과 아웃트로 임계값 정책

**Files:**

- Create: `src/app/OutroPresentationPolicy.ts`
- Test: `tests/app/OutroPresentationPolicy.test.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing vocal-end tests**

Static, line+trailing interlude, interlude-only, syllable lead/background, `line-only`를 실제 lyrics fixture로 검증한다.

```ts
expect(lastRenderedVocalEndSec(staticLyrics, "prefer-syllable")).toBeUndefined();
expect(lastRenderedVocalEndSec(lineWithTrailingInterlude, "prefer-syllable")).toBe(8);
expect(lastRenderedVocalEndSec(interludeOnly, "prefer-syllable")).toBeUndefined();
expect(lastRenderedVocalEndSec(syllableWithLateBackground, "prefer-syllable")).toBe(12);
expect(lastRenderedVocalEndSec(syllableWithLateBackground, "line-only")).toBe(10);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run tests/app/OutroPresentationPolicy.test.ts`

Expected: FAIL because `OutroPresentationPolicy` does not exist.

- [ ] **Step 3: Implement the smallest vocal-end helper**

```ts
export const OUTRO_METADATA_DELAY_SEC = 2;

export const lastRenderedVocalEndSec = (
	lyrics: LyricsDocument,
	syncPreference: SyncPreference,
): number | undefined => {
	if (lyrics.type === "static") return undefined;
	let latest: number | undefined;
	if (lyrics.type === "line") {
		for (const item of lyrics.content) {
			if (item.type === "vocal") latest = latest === undefined ? item.endTime : Math.max(latest, item.endTime);
		}
		return latest;
	}
	for (const item of lyrics.content) {
		if (item.type !== "vocal") continue;
		const endTimes =
			syncPreference === "line-only"
				? [item.lead.endTime]
				: [item.lead.endTime, ...(item.background ?? []).map((vocal) => vocal.endTime)];
		for (const endTime of endTimes) {
			latest = latest === undefined ? endTime : Math.max(latest, endTime);
		}
	}
	return latest;
};
```

분기 후 loop 안에서 `item.type !== "vocal"`을 먼저 제외하므로 별도 type guard나 `maximum()` helper 없이 interlude-only 입력도 `undefined`가 된다.

- [ ] **Step 4: Write failing threshold and natural-end boundary tests**

```ts
expect(outroMetadataThresholdSec(lineEndingAt8, "prefer-syllable", 12)).toBe(10);
expect(outroMetadataThresholdSec(lineEndingAt8, "prefer-syllable", 10)).toBe(10);
expect(outroMetadataThresholdSec(lineEndingAt8, "prefer-syllable", 9.999)).toBeUndefined();
expect(isNaturalTrackEnd({ previousProgressSec: 98, previousDurationSec: 100 })).toBe(true);
expect(isNaturalTrackEnd({ previousProgressSec: 97.999, previousDurationSec: 100 })).toBe(false);
expect(isNaturalTrackEnd({ previousProgressSec: undefined, previousDurationSec: 100 })).toBe(false);
```

- [ ] **Step 5: Implement unclamped threshold and exact tolerance**

```ts
export const NATURAL_END_TOLERANCE_SEC = 2;

export const outroMetadataThresholdSec = (
	lyrics: LyricsDocument,
	syncPreference: SyncPreference,
	durationSec: number,
): number | undefined => {
	const endSec = lastRenderedVocalEndSec(lyrics, syncPreference);
	if (endSec === undefined) return undefined;
	const thresholdSec = endSec + OUTRO_METADATA_DELAY_SEC;
	return thresholdSec <= durationSec ? thresholdSec : undefined;
};

export type PreviousTrackProgress = {
	previousProgressSec?: number;
	previousDurationSec?: number;
};

export const isNaturalTrackEnd = ({ previousProgressSec, previousDurationSec }: PreviousTrackProgress = {}): boolean =>
	previousProgressSec !== undefined &&
	previousDurationSec !== undefined &&
	previousProgressSec >= previousDurationSec - NATURAL_END_TOLERANCE_SEC;
```

- [ ] **Step 6: Run GREEN, typecheck, and commit**

Run: `npx vitest run tests/app/OutroPresentationPolicy.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/app/OutroPresentationPolicy.ts tests/app/OutroPresentationPolicy.test.ts
git commit -m "feat: add lyrics outro timing policy"
```

---

### Task 2: Playback epoch 아웃트로 상태 컨트롤러

**Files:**

- Create: `src/app/OutroPresentationController.ts`
- Test: `tests/app/OutroPresentationController.test.ts`
- Use: `src/app/OutroPresentationPolicy.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
controller.beginTrackEpoch("spotify:track:a");
expect(controller.accept(snapshot, settings, 9.999)).toEqual({ kind: "show-lyrics", snapshot });
expect(controller.evaluate(10)).toEqual({ kind: "show-metadata", snapshot });
expect(controller.evaluate(11)).toEqual({ kind: "none" });
expect(controller.evaluate(9)).toEqual({ kind: "show-lyrics", snapshot });
expect(controller.evaluate(10)).toEqual({ kind: "show-metadata", snapshot });
```

추가로 threshold 이후 late accept는 metadata만 반환하고, static/interlude-only/짧은 tail은 lyrics만 반환하는지 검증한다.

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/app/OutroPresentationController.test.ts`

Expected: FAIL because the controller is missing.

- [ ] **Step 3: Implement explicit inactive/lyrics/metadata state**

```ts
export type OutroPresentationResult =
	| { kind: "none" }
	| { kind: "show-lyrics"; snapshot: ReadyTrackSessionSnapshot }
	| { kind: "show-metadata"; snapshot: ReadyTrackSessionSnapshot };

export class OutroPresentationController {
	beginTrackEpoch(uri: string): void;
	endTrackEpoch(): void;
	accept(snapshot: ReadyTrackSessionSnapshot, settings: ExtensionSettings, timestampSec: number): OutroPresentationResult;
	evaluate(timestampSec: number): OutroPresentationResult;
	currentKind(): "inactive" | "lyrics" | "metadata";
}
```

`accept()`는 동일 epoch에서 snapshot/settings가 바뀔 때 threshold를 항상 재계산한다. `evaluate()`는 threshold 양쪽을 건널 때만 DOM 결과를 반환한다.

- [ ] **Step 4: Add refresh/settings/enrichment and epoch reset tests**

- 새 snapshot이 threshold를 앞당기거나 뒤로 미는 경우 현재 timestamp에서 즉시 재결정.
- 같은 URI의 새 `beginTrackEpoch()`가 fresh state 생성.
- `endTrackEpoch()` 뒤 `accept/evaluate`는 `none`.
- session discard는 snapshot을 비우되 앱이 다시 accept할 수 있도록 epoch 규칙을 보존.

- [ ] **Step 5: Implement snapshot replacement and reset API**

`discardSession()`을 추가해 PiP close에서 snapshot/표현을 비우고, 실제 track epoch 종료와 구분한다. 앱 destroy/no-track은 `endTrackEpoch()`를 호출한다.

- [ ] **Step 6: Run GREEN and commit**

Run: `npx vitest run tests/app/OutroPresentationController.test.ts tests/app/OutroPresentationPolicy.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/app/OutroPresentationController.ts tests/app/OutroPresentationController.test.ts
git commit -m "feat: add outro presentation controller"
```

---

### Task 3: 곡 이동 intent FIFO와 방향 판정

**Files:**

- Create: `src/app/TrackTransitionDirectionController.ts`
- Test: `tests/app/TrackTransitionDirectionController.test.ts`
- Use: `src/app/OutroPresentationPolicy.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing FIFO and timeout tests with an injected clock**

```ts
let nowMs = 1_000;
const directions = new TrackTransitionDirectionController(() => nowMs);
directions.enqueue("next");
directions.enqueue("previous");
expect(directions.consume({ previousProgressSec: 20, previousDurationSec: 100 })).toBe("next");
expect(directions.consume({ previousProgressSec: 20, previousDurationSec: 100 })).toBe("previous");

directions.enqueue("next");
nowMs += 5_000;
expect(directions.consume({ previousProgressSec: 20, previousDurationSec: 100 })).toBe("next");
directions.enqueue("previous");
nowMs += 5_001;
expect(directions.consume({ previousProgressSec: 20, previousDurationSec: 100 })).toBe("unknown");
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/app/TrackTransitionDirectionController.test.ts`

Expected: FAIL because the controller is missing.

- [ ] **Step 3: Implement intent pruning and one-item consumption**

```ts
export const NAVIGATION_INTENT_TIMEOUT_MS = 5_000;
export type TrackTransitionDirection = "next" | "previous" | "unknown";

public enqueue(direction: "next" | "previous"): void {
	this.pruneExpired();
	this.pending.push({ direction, createdAtMs: this.nowMs() });
}

public consume(progress: PreviousTrackProgress = {}): TrackTransitionDirection {
	this.pruneExpired();
	return this.pending.shift()?.direction ?? (isNaturalTrackEnd(progress) ? "next" : "unknown");
}
```

만료 조건은 `age > 5000`; 정확히 5000ms는 유효하다.

- [ ] **Step 4: Add reset and inference priority tests**

- 명시적 previous/next가 end tolerance보다 우선.
- progress/duration 누락은 unknown.
- `clear()` 뒤 pending 없음.
- 두 요청/두 trackChanged는 순서대로 두 intent 소비.

- [ ] **Step 5: Implement `clear()` and run GREEN**

Run: `npx vitest run tests/app/TrackTransitionDirectionController.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/TrackTransitionDirectionController.ts tests/app/TrackTransitionDirectionController.test.ts
git commit -m "feat: classify track transition direction"
```

---

### Task 4: Player progress 문맥을 기존 EventEmitter에 보존

**Files:**

- Modify: `src/player/SpicetifyPlayerAdapter.ts`
- Modify: `src/runtime/spicetify.d.ts`
- Modify: `tests/player/SpicetifyPlayerAdapter.test.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing adapter event tests**

- 기존 `trackChanged`/`playbackChanged` EventEmitter 구조를 유지한 채 `onprogress` listener attach/detach.
- progress는 수신 시점의 current URI와 함께 저장.
- songchange payload는 새 track과 직전 URI에 해당하는 progress/duration을 함께 전달.
- progress가 없으면 `undefined`.
- 새 track URI의 progress가 먼저 관측돼도 직전 track slot을 덮지 않음.

```ts
expect(trackChanges.at(-1)).toEqual({
	track: nextTrack,
	previousTrackUri: previousTrack.uri,
	previousProgressSec: 98,
	previousDurationSec: 100,
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/player/SpicetifyPlayerAdapter.test.ts`

Expected: FAIL on missing progress context/type.

- [ ] **Step 3: Extend the existing EventEmitter payloads**

```ts
export type TrackChangedEvent = {
	track: TrackIdentity | undefined;
	previousTrackUri?: string;
	previousProgressSec?: number;
	previousDurationSec?: number;
};

public readonly trackChanged = new EventEmitter<TrackChangedEvent>();
public readonly playbackChanged = new EventEmitter<boolean>();
public readonly progressChanged = new EventEmitter<number>();
```

새 adapter interface 파일이나 subscribe 메서드를 만들지 않는다. `ExtensionApp.start()`는 현재처럼 `.subscribe()` disposer를 저장한다. `spicetify.d.ts`에는 공식 API event shape대로 `onprogress` listener를 `(event: { data: number }) => void` overload로 선언한다.

- [ ] **Step 4: Implement per-URI progress storage**

Adapter는 attach 시 초기화하는 `currentTrackUri`와 `Map<string, { progressSec; durationSec }>`를 유지한다. `onprogress(event)`는 `event.data / 1000`을 `progressChanged`로 emit하고, 해당 시점 `getCurrentTrack()`의 URI slot에 기록하되 `currentTrackUri` 자체는 바꾸지 않는다. `songchange`는 먼저 기존 `currentTrackUri` slot을 flat `TrackChangedEvent`로 복사하고, 그 다음 새 track을 읽어 `currentTrackUri`를 갱신한 뒤 event를 emit한다. 이 순서 덕분에 새 URI progress가 먼저 관측돼도 이전 slot을 보존한다. 소비한 과거 slot은 제거해 무한 증가를 막는다.

- [ ] **Step 5: Add paused-seek progress callback tests**

`progressChanged.subscribe()`가 `event.data`의 ms를 sec로 바꿔 받으며, adapter `detach()`가 정확한 DOM-style listener를 제거하는지 검증한다.

- [ ] **Step 6: Run GREEN and commit**

Run: `npx vitest run tests/player/SpicetifyPlayerAdapter.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/player/SpicetifyPlayerAdapter.ts src/runtime/spicetify.d.ts tests/player/SpicetifyPlayerAdapter.test.ts
git commit -m "feat: preserve previous track progress context"
```

---

### Task 5: Generation 기반 scene transition controller

**Files:**

- Create: `src/renderer/SceneTransitionController.ts`
- Create: `src/shared/themeCssProperties.ts`
- Create: `src/styles/pip/transitionStyles.ts`
- Test: `tests/renderer/SceneTransitionController.test.ts`
- Modify: `src/styles/pipStyles.ts`
- Modify: `tests/styles/pipStyles.test.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing plane/direction tests**

```ts
const result = controller.present(nextScene, { direction: "next", animate: true });
expect(root.querySelector("[data-scene-plane='outgoing']")?.getAttribute("aria-hidden")).toBe("true");
expect(root.querySelector("[data-scene-plane='incoming']")?.contains(nextScene)).toBe(true);
expect(root.classList.contains("scene-transition-next")).toBe(true);
```

`previous`, `unknown/up`, outro `up`, no-animation immediate replacement을 각각 검증한다.

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/renderer/SceneTransitionController.test.ts`

Expected: FAIL because the controller is missing.

- [ ] **Step 3: Implement presenter and 720ms cleanup contract**

```ts
export const SCENE_TRANSITION_DURATION_MS = 720;
export type SceneTransitionDirection = "up" | "next" | "previous";
export type SceneTransitionHandle = {
	generation: number;
	settled: Promise<{ generation: number; completed: boolean }>;
};

present(scene: HTMLElement, options: {
	direction?: SceneTransitionDirection;
	animate: boolean;
}): SceneTransitionHandle;
cancel(): void;
destroy(): void;
```

전환 시작 시 generation을 증가시키고 기존 timer/listener를 취소한다. 완료 callback은 캡처한 generation이 현재와 같을 때만 outgoing을 제거하고 incoming을 승격한다. outgoing은 즉시 `aria-hidden="true"`, `pointer-events: none`이 된다.

- [ ] **Step 4: Add stale callback and rapid replacement tests**

- 두 번째 `present()` 뒤 첫 번째 720ms callback이 최신 scene을 제거하지 않음.
- 완료 후 임시 plane/class가 모두 정리됨.
- `destroy()` 뒤 timer가 DOM을 다시 건드리지 않음.

- [ ] **Step 5: Add theme snapshot tests before implementing styles**

host의 theme 변수를 바꿔도 outgoing plane은 전환 시작 값으로 유지되고, 완료 후 inline snapshot이 제거되는지 검증한다. snapshot 대상은 현재 테마 서비스가 설정하는 `--pip-*` CSS custom property를 `src/shared/themeCssProperties.ts`의 `THEME_CSS_PROPERTIES` 한 곳에서 관리한다. `DocumentPipController.applyTheme()`도 Task 7에서 이 배열을 import해 적용 목록과 freeze 목록의 drift를 막는다.

```ts
host.style.setProperty("--pip-background-color", "rgb(1 2 3)");
controller.present(first, { animate: false });
controller.present(second, { direction: "next", animate: true });
host.style.setProperty("--pip-background-color", "rgb(4 5 6)");
expect(outgoing.style.getPropertyValue("--pip-background-color")).toBe("rgb(1 2 3)");
```

- [ ] **Step 6: Implement theme freeze and transition CSS**

CSS는 `transform`과 `opacity`만 animation 대상으로 사용한다. duration `720ms`, easing `cubic-bezier(0.22, 1, 0.36, 1)`을 변수로 공유한다. scene plane만 움직이며 controls/close/border는 `.pip-content` 바깥에 남는다. reduced motion에서는 transition duration이 0이 아니라 JS가 `animate: false`로 즉시 교체한다.

- [ ] **Step 7: Run tests and commit**

Run: `npx vitest run tests/renderer/SceneTransitionController.test.ts tests/styles/pipStyles.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/renderer/SceneTransitionController.ts src/shared/themeCssProperties.ts src/styles/pip/transitionStyles.ts src/styles/pipStyles.ts tests/renderer/SceneTransitionController.test.ts tests/styles/pipStyles.test.ts
git commit -m "feat: add directional scene transitions"
```

---

### Task 6: LyricsRenderer의 모든 표현을 공통 scene으로 통합

**Files:**

- Modify: `src/renderer/LyricsRenderer.ts`
- Modify: `tests/renderer/LyricsRenderer.test.ts`
- Use: `src/renderer/SceneTransitionController.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing renderer transition tests**

- 기존 lyrics에서 persistent metadata로 `up` 전환.
- metadata에서 새 metadata로 `next`/`previous` 전환.
- `showStatus`, `showAlbumArt`, `mount`도 동일 presenter를 사용.
- `reduceMotion` 또는 `motionEnabled: false`면 즉시 단일 scene.
- 전환 중 renderer update는 outgoing이 아니라 current lyrics scene의 groups만 갱신.

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/renderer/LyricsRenderer.test.ts`

Expected: FAIL because renderer methods replace children immediately.

- [ ] **Step 3: Introduce presentation options without breaking existing callers**

```ts
export type ScenePresentationOptions = {
	direction?: "up" | "next" | "previous";
	animate?: boolean;
};

mount(root, mountOptions, presentation?: ScenePresentationOptions): SceneTransitionHandle;
showTrackMetadata(root, metadata, settings, presentation?: ScenePresentationOptions): SceneTransitionHandle;
showStatus(root, status, settings, presentation?: ScenePresentationOptions): SceneTransitionHandle;
showAlbumArt(root, presentation?: ScenePresentationOptions): SceneTransitionHandle;
```

기존 호출은 `direction`이 없으므로 즉시 교체해 snapshot 동작을 유지한다.

- [ ] **Step 4: Refactor scene construction away from `destroy()`**

새 private `presentScene()`이 이전 animated groups/controllers를 outgoing scene과 함께 정리할 cleanup closure로 묶는다. 새 scene의 groups/controllers만 renderer current state로 승격한다. `destroy()`는 presenter와 모든 pending cleanup을 종료한다.

- [ ] **Step 5: Add transition handle and completion tests**

각 public render 메서드는 presenter가 즉시 만든 `{ generation, settled }` handle을 반환한다. `settled`는 정상 완료에서 `completed: true`, 새 전환 또는 destroy로 취소되면 `completed: false`로 반드시 resolve한다. Renderer는 URI/session을 알지 못하며 ready snapshot을 보류하거나 필터링하지 않는다. 보류 책임은 Task 9의 `ExtensionApp` 한 곳에만 둔다.

- [ ] **Step 6: Run GREEN and commit**

Run: `npx vitest run tests/renderer/LyricsRenderer.test.ts tests/renderer/SceneTransitionController.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/renderer/LyricsRenderer.ts tests/renderer/LyricsRenderer.test.ts
git commit -m "refactor: route renderer output through scene presenter"
```

---

### Task 7: Cover double buffer와 360ms crossfade

**Files:**

- Create: `src/pip/PipCoverTransitionController.ts`
- Test: `tests/pip/PipCoverTransitionController.test.ts`
- Modify: `src/pip/DocumentPipController.ts`
- Modify: `tests/pip/DocumentPipController.test.ts`
- Modify: `src/styles/pip/transitionStyles.ts`
- Use: `src/shared/themeCssProperties.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing load/crossfade/failure tests**

- 최초 cover는 단일 active plane.
- 다음 URL은 incoming `load` 전까지 outgoing 유지.
- load 뒤 360ms 동안 두 plane, 이후 old 제거.
- `error` 또는 undefined URL은 fallback background로 정상 정리.
- 빠른 세 URL에서 오래된 load/timeout은 최신 cover를 제거하지 않음.
- `motionEnabled: false` 또는 `reduceMotion: true`에서 load 뒤 즉시 단일 active cover로 교체.

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/pip/PipCoverTransitionController.test.ts`

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement generation-guarded two-plane controller**

```ts
export const COVER_CROSSFADE_DURATION_MS = 360;

setCover(url: string | undefined, options?: { animate?: boolean }): void;
destroy(): void;
```

동일 URL은 새 image를 만들지 않는다. `load/error` listener와 timeout은 generation 검사 후에만 DOM을 정리한다.

- [ ] **Step 4: Wire the controller into DocumentPipController**

기존 한 장 `.pip-cover` 생성을 `.pip-cover-layer`로 바꾸고 `PipSession.setCover` public contract는 유지한다. session closure가 보유한 current settings에서 `animate: settings.motionEnabled && !settings.reduceMotion`을 cover controller에 전달한다. `DocumentPipController`의 private theme property 배열은 제거하고 shared `THEME_CSS_PROPERTIES`를 import한다. PiP close에서 controller를 destroy한다. scrim/vignette/controls/close/border DOM 순서는 그대로 두어 scene slide 바깥에 남게 한다.

- [ ] **Step 5: Add CSS and structural assertions**

Cover plane은 viewport absolute positioning, opacity만 transition한다. 구조 테스트로 `.pip-content`와 controls/close/border가 sibling이며 cover layer 역시 content 바깥인지 검증한다.

- [ ] **Step 6: Run GREEN and commit**

Run: `npx vitest run tests/pip/PipCoverTransitionController.test.ts tests/pip/DocumentPipController.test.ts tests/styles/pipStyles.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/pip/PipCoverTransitionController.ts src/pip/DocumentPipController.ts src/styles/pip/transitionStyles.ts tests/pip/PipCoverTransitionController.test.ts tests/pip/DocumentPipController.test.ts
git commit -m "feat: crossfade track covers"
```

---

### Task 8: ExtensionApp에 절대 재생 시각 아웃트로 통합

**Files:**

- Modify: `src/app/ExtensionApp.ts`
- Modify: `tests/app/ExtensionApp.test.ts`
- Use: `src/app/OutroPresentationController.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing outro integration tests**

- 마지막 vocal+2초 직전은 lyrics, 정확히 임계값에서 persistent metadata 한 번.
- late load/PiP open은 lyrics flash 없이 metadata 직접 표시.
- 짧은 tail, static, interlude-only는 metadata 아웃트로 없음.
- threshold 이전 pause는 유지, resume resync 뒤 즉시 올바른 표현.
- 재생 중 backward seek는 lyrics 복귀 후 같은 timestamp로 `renderer.update(timestamp, 0)`.
- 재통과 시 metadata 재표시.
- 양/음 `lyricsDelayMs` 모두 renderer와 같은 synchronized timestamp 사용.

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/app/ExtensionApp.test.ts -t "outro"`

Expected: FAIL because Outro Controller is not wired.

- [ ] **Step 3: Route ready snapshots Intro Gate then Outro Controller**

```text
presentReadySnapshot
  -> introGate.accept(snapshot, settings, playbackSynchronizer.timestampSec)
  -> if reveal: outroController.accept(snapshot, settings, playbackSynchronizer.timestampSec)
  -> show-lyrics or show-metadata
```

`show-metadata`는 snapshot track을 persistent metadata로 렌더하고 lyrics DOM을 먼저 mount하지 않는다. enrichment, refresh, structural settings도 동일 함수로 들어온다.

- [ ] **Step 4: Evaluate outro on every synchronized path**

- playing tick: synchronizer update → intro tick → outro evaluate → lyrics일 때만 renderer update.
- resume: resync → intro resume → outro evaluate.
- `onprogress`: resync; paused 상태에서도 intro/outro를 즉시 평가.
- backward seek `show-lyrics`: mount 후 `renderer.update(timestamp, 0)`.

- [ ] **Step 5: Add/reset lifecycle hooks**

실제 trackChanged/same URI repeat는 `beginTrackEpoch`, no-track/destroy는 `endTrackEpoch`, PiP close는 `discardSession`. 수동 refresh와 settings/enrichment는 epoch를 바꾸지 않는다.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx vitest run tests/app/ExtensionApp.test.ts tests/app/OutroPresentationController.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/app/ExtensionApp.ts tests/app/ExtensionApp.test.ts
git commit -m "feat: show track metadata after lyrics outro"
```

---

### Task 9: ExtensionApp 곡 변경 방향과 후속 표현 보류 통합

**Files:**

- Modify: `src/app/ExtensionApp.ts`
- Modify: `tests/app/ExtensionApp.test.ts`
- Use: `src/app/TrackTransitionDirectionController.ts`

Use `@superpowers:test-driven-development`.

- [ ] **Step 1: Write failing control-intent and direction tests**

- 다음 callback 진입 즉시 enqueue한 뒤 player next 호출; trackChanged는 left/next.
- 이전은 right/previous.
- intent 없이 직전 progress가 duration-2 이상이면 next.
- 그 외 unknown은 up.
- 두 번 빠른 next와 두 trackChanged가 FIFO 두 항목 소비.
- no-track, PiP close, destroy는 queue clear.

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run tests/app/ExtensionApp.test.ts -t "track transition"`

Expected: FAIL because track changes have no direction.

- [ ] **Step 3: Enqueue controls and classify before resetting the old session**

`onTrackChanged(event)` 첫 줄에서 flat payload 자체를 `directionController.consume(event)`에 전달한다. `consume(progress?: PreviousTrackProgress)`는 `undefined` 또는 모든 값이 빠진 객체를 `unknown`으로 처리한다. 그 뒤에만 track session/intro/outro epoch를 무효화한다. no-track은 animation 없이 기존 waiting status를 표시하고 queue를 전부 지운다.

- [ ] **Step 4: Freeze outgoing theme before starting asynchronous incoming work**

새 track 흐름의 순서는 다음과 같이 고정한다.

```text
classify direction
build loading metadata scene
renderer starts transition and snapshots outgoing theme
session.setCover(next cover)
start applyTrackTheme(next theme)
start lyrics load
```

따라서 async theme가 매우 빨리 완료돼도 outgoing은 이전 CSS 값, incoming은 새 값을 사용한다.

- [ ] **Step 5: Write failing transition/async race tests**

- current metadata 아웃트로가 생략된 짧은 tail에서도 lyrics→next loading metadata가 left.
- 720ms 전에 ready snapshot이 오면 metadata 진입이 먼저 끝나고 최신 ready만 적용.
- 720ms 전에 empty/error/instrumental/unsupported-local이 오면 진입을 끊지 않고 완료 직후 기존 최종 표현 적용.
- rapid skip에서 오래된 transition completion/load/theme/cover가 최신 track을 제거하지 않음.
- same URI repeat도 새 generation과 새 transition.
- instrumental/error/unsupported local의 기존 최종 표현은 유지하면서 진입 animation 가능.

- [ ] **Step 6: Implement the app-owned single pending-presentation slot keyed by session/epoch/URI**

`ExtensionApp`만 `activeTrackTransition`과 `pendingTrackPresentation`을 소유한다. 앱은 private `TrackSessionController.generation`을 읽지 않고, 실제 `trackChanged`마다 증가시키는 자체 `playbackTrackEpoch` counter를 추가한다. loading metadata render가 반환한 handle generation을 저장한다.

```ts
type PendingTrackPresentation =
	| { kind: "load-state"; snapshot: TrackSessionSnapshot }
	| { kind: "ready"; snapshot: ReadyTrackSessionSnapshot };
```

active track transition 중 `renderLoadState()`와 모든 ready/enrichment/settings 재표시 진입점은 공통 `requestTrackPresentation()`으로 들어가 가장 최신 요청 하나만 보류하며 renderer에는 전달하지 않는다. handle의 `settled` callback은 `completed === true`이고 캡처한 `{ session, playbackTrackEpoch, transitionGeneration, uri }`가 모두 현재 active handle과 일치할 때만 그 handle의 pending을 꺼낸다. 오래되거나 취소된 callback은 새 active transition 또는 전역 pending을 clear하지 않고 그대로 return한다. 적용 전에 현재 `activeTrackTransition`을 먼저 clear해 요청이 다시 보류되지 않게 한다. `load-state`는 기존 즉시 render helper를 사용한다. `ready`는 요청 시각을 저장하지 않고 settlement 직후 `playbackSynchronizer.resync()`한 다음 최신 `playbackSynchronizer.timestampSec`로 Intro Gate→Outro Controller를 실행한다. snapshot인 경우 기존 `trackSession.isCurrent(snapshot)`도 다시 검사한다. 다음 trackChanged는 자기 pending/handle을 새로 소유한다.

테스트에서 ready가 전환 도중 도착한 뒤 720ms 사이에 첫 보컬 또는 outro 임계값을 통과하도록 player progress를 전진시킨다. settlement 후 오래된 저장 시각의 intro/lyrics를 잠깐 표시하지 않고 최신 시각에 맞는 lyrics/metadata를 바로 선택해야 한다. 또한 취소된 이전 handle의 settlement가 새 handle의 pending을 지우지 않는지 검증한다.

- [ ] **Step 7: Run focused integration tests and commit**

Run: `npx vitest run tests/app/ExtensionApp.test.ts tests/app/TrackTransitionDirectionController.test.ts tests/renderer/LyricsRenderer.test.ts`

Expected: PASS.

```bash
git add src/app/ExtensionApp.ts tests/app/ExtensionApp.test.ts
git commit -m "feat: animate directional track changes"
```

---

### Task 10: Visual harness and motion-state coverage

**Files:**

- Modify: `tests/visual/harness/main.ts`
- Modify: `tests/visual/lyrics-layout.visual.spec.ts`
- Modify: `tests/visual/__screenshots__/lyrics-layout.visual.spec.ts/*.png`

Use `@superpowers:test-driven-development` for deterministic harness assertions.

- [ ] **Step 1: Add deterministic harness scenarios**

Add named scenarios for:

- lyrics outro up at animation start/mid/end.
- current metadata→next metadata left.
- current metadata→previous metadata right.
- short-tail lyrics→next metadata left.
- reduced-motion final state.

Harness는 임의 sleep 대신 fake/controllable transition state 또는 CSS class/data attribute를 노출해 정확한 phase를 선택한다.

- [ ] **Step 2: Add visual assertions and confirm RED**

Run: `npm run test:visual -- --grep "outro|track transition"`

Expected: FAIL because new screenshots do not exist or differ.

- [ ] **Step 3: Verify fixed elements and final states**

Start/mid screenshot에서도 controls, close, border frame 좌표가 동일한지 DOM bounding box assertion을 추가한다. reduced motion은 중복 plane이 없고 즉시 incoming 최종 scene만 존재해야 한다.

- [ ] **Step 4: Update only intentional snapshots**

Run: `npm run test:visual:update -- --grep "outro|track transition"`

Review every generated PNG for direction, clipping, readable contrast, and fixed controls.

- [ ] **Step 5: Re-run visual tests and commit**

Run: `npm run test:visual -- --grep "outro|track transition"`

Expected: PASS.

```bash
git add tests/visual/harness/main.ts tests/visual/lyrics-layout.visual.spec.ts tests/visual/__screenshots__/lyrics-layout.visual.spec.ts
git commit -m "test: cover lyrics outro transitions visually"
```

---

### Task 11: Full regression verification and cleanup

**Files:**

- Verify all changed files from Tasks 1–10.
- Update: `docs/superpowers/plans/2026-07-14-lyrics-outro-track-transitions.md` checkboxes only as work completes.

Use `@superpowers:verification-before-completion`.

- [ ] **Step 1: Run formatter/check and inspect its diff**

Run: `npm run format`

Then: `git status --short && git diff --check && git diff --stat`

Expected: only feature-scoped files; no whitespace errors.

- [ ] **Step 2: Run required repository checks separately**

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run test`

Run: `npm run build`

Expected: all exit 0. Record test file/test counts and build result from fresh output.

- [ ] **Step 3: Run the complete visual suite**

Run: `npm run test:visual`

Expected: exit 0. If font-only drift appears, inspect it explicitly; do not automatically accept unrelated snapshots.

- [ ] **Step 4: Audit final behavior against the design**

Check each design edge case: absolute timestamp, exact threshold, short tail skip, backward seek/re-cross, pause/resume, explicit next/previous FIFO, natural/unknown, rapid skip, same URI, reduced motion, cover failure, stale async work, fixed controls.

- [ ] **Step 5: Commit only remaining formatting/test-plan bookkeeping**

Use `git status --short` to enumerate the exact remaining feature files. Stage those literal paths one by one; do not stage `.superpowers/` brainstorming artifacts or unrelated files. If formatting produced no remaining changes, skip this commit.

```bash
git commit -m "chore: finalize lyrics outro transitions"
```

- [ ] **Step 6: Request code review**

Use `@superpowers:requesting-code-review` against the design spec and implementation plan. Address blocking findings with `@superpowers:receiving-code-review`, then rerun all affected checks before claiming completion.
