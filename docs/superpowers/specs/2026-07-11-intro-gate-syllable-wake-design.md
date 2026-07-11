# Intro Gate 및 Syllable Wake 설계

## 요약

AuraLyrics의 기존 가사 로딩 동작은 유지하되, 곡 앞부분에서 시간 정보가 있는 가사가 준비된 이후의 화면 전환 방식을 변경한다.

- 현재 재생 시작 또는 재개 위치에서 첫 보컬이 2초 이내에 시작하면, 중간 커버 화면 없이 가사를 즉시 표시한다.
- 더 긴 시작 간주가 남아 있으면 첫 보컬이 시작될 때까지 오로라 에디토리얼 곡 정보 화면을 유지한다. 이 시점에는 가사가 이미 준비됐으므로 `LOADING` 문구와 진행선을 표시하지 않는다.
- 화면 전환은 벽시계 타이머가 아니라 기존 재생 동기화 시계를 사용한다. 따라서 일시정지·재개·seek·재동기화 시 가사 시각과 어긋나지 않는다.
- 가상 노래방의 접힌 코너 아이콘을 제거한다. 대신 활성 가사의 그라디언트와 잔광 안에 스며드는 Syllable Wake 표현을 사용한다.

설정, 저장 키, 캐시 형식, Provider 동작, 가사 문서 형식은 변경하지 않는다.

## 목표

1. 보컬이 거의 바로 시작하는 곡에서는 커버 화면을 표시하지 않는다.
2. 긴 시작 간주에서는 첫 보컬까지 곡 정보 화면을 자연스럽게 유지한다.
3. 커버 화면을 유지하더라도 가사 활성 상태와 음절 진행률을 정확히 맞춘다.
4. 커버 유지 중 재생을 재개하면 남은 시간을 다시 판단하되, 같은 곡에서 가사가 한 번 표시된 뒤에는 커버로 돌아가지 않는다.
5. 가상 노래방 아이콘을 가사 UI 자체에 속하는 은은한 재생 연동 표현으로 대체한다.
6. 기존 로딩·가사 없음·오류·로컬 곡·instrumental·Provider·캐시·설정·native karaoke 동작을 보존한다.

## 비목표

- 곡 중간의 간주에서 커버 화면을 다시 표시하는 기능.
- 현재 재생 트랙 epoch에서 가사가 한 번 표시된 뒤 다시 커버 화면으로 돌아가는 기능.
- 인트로 임계값 또는 Syllable Wake 설정을 추가하는 것.
- 신뢰할 수 있는 보컬 시각이 없는 static 가사를 지연하는 것.
- pseudo-karaoke 생성 또는 native 음절 타이밍을 변경하는 것.
- 고정 timeout으로 인트로 전환을 구동하는 것.

## 인트로 시각 모델

### 첫 보컬 시각

순수 helper가 현재 렌더러 설정에서 실제로 표시되는 첫 보컬 시각을 계산한다.

- `StaticLyrics`: 시간 정보가 있는 첫 보컬이 없으므로 즉시 표시한다.
- `LineLyrics`: `type: "vocal"` 항목의 최소 `startTime`.
- `syncPreference: "prefer-syllable"`인 `SyllableLyrics`: 모든 vocal set의 lead와 background 보컬 시작 시각 중 최솟값. syllable group의 실제 범위와 일치한다.
- `syncPreference: "line-only"`인 `SyllableLyrics`: lead 보컬 시작 시각 중 최솟값. `syllableToLine()` 동작과 일치하며 렌더링하지 않는 background는 제외한다.
- interlude만 있는 문서는 첫 보컬이 없는 것으로 처리해 영구적으로 커버를 유지하지 않는다.

판단 기준은 Provider가 명시적 시작 interlude를 제공했는지가 아니라 실제로 표시되는 첫 보컬이다. 따라서 생성된 gap과 Provider interlude가 동일하게 동작한다. `syncPreference`처럼 표시 구조를 바꾸는 설정이 변경되면, 최신 pending snapshot과 현재 설정을 기준으로 첫 보컬을 다시 계산한다.

### 2초 판단

`INTRO_IMMEDIATE_THRESHOLD_SEC`는 값이 `2`인 고정 내부 상수다.

시간 정보가 있는 가사가 처음 준비되면 AuraLyrics는 재생 시계를 다시 동기화한 뒤 다음 값을 계산한다.

```text
remaining = firstVocalStartSec - playbackTimestampSec
```

- 첫 보컬 없음: 즉시 가사 표시.
- `remaining <= 2`: 즉시 가사 표시.
- `remaining > 2`: 인트로 화면 유지.
- 이미 첫 보컬 시각에 도달했거나 지난 경우: 즉시 가사 표시.

2초 임계값은 ready snapshot을 받아들일 때와 인트로 화면을 유지한 상태에서 재생을 재개할 때 적용한다. 매 프레임 이동하는 조기 공개 경계로 사용하지 않는다. 긴 인트로를 유지하기로 결정했다면 실제 첫 보컬까지 커버를 유지한다. 단, 일시정지 후 재개 시 남은 시간이 2초 이하면 즉시 가사를 표시한다.

### 인트로 유지 화면

가사는 준비됐지만 인트로를 유지하는 동안 렌더러는 오로라 에디토리얼 곡 정보 화면을 intro-ready 모드로 표시한다.

- 앨범 커버 썸네일
- 제목
- `가수 · 앨범`
- `LOADING` 문구 없음
- 진행선 없음
- `NOW PLAYING` 문구 없음

레이아웃은 persistent metadata를 재사용할 수 있지만, 의미상 loading 또는 실패 상태와 분리된 모드다.

## 상태와 소유권

`ExtensionApp`의 작은 presentation controller 또는 이에 준하는 명시적 상태가 현재 재생 트랙의 Intro Gate를 소유한다.

```text
idle -> loading -> holding-intro -> lyrics-revealed
                   \--------------> lyrics-revealed
```

Gate는 최신 `ReadyTrackSessionSnapshot`, 여기서 계산한 첫 보컬 시각, 현재 playback track epoch의 revealed latch만 저장한다. 가사 데이터를 복사하거나 재생 시각을 직접 소유하지 않는다.

Pending snapshot은 다음 상황에서 초기화한다.

- no-track 전환
- 애플리케이션 destroy
- 새로운 playback track epoch를 시작하는 실제 player `trackChanged` 이벤트. Spotify가 새 track 이벤트를 발생시키는 동일 URI 반복 재생도 포함한다.

`lyrics-revealed` latch는 load generation 또는 PiP session generation보다 오래 유지된다. 현재 playback track epoch에서는 다음 작업 후에도 유지된다.

- 수동 가사 새로고침
- ready load state 교체
- 구조적 설정 presentation
- 새 `trackChanged` 이벤트 없이 같은 곡을 재생하는 상태에서 PiP 닫기/다시 열기
- 일시정지·재개·뒤로 seek

따라서 위 작업들은 가사가 표시된 뒤 인트로 커버를 다시 만들 수 없다. no-track 전환, 애플리케이션 destroy, 새 player track epoch는 새로운 Gate 수명을 만든다.

PiP를 닫으면 session에 종속된 pending snapshot과 deadline은 버리지만 playback epoch의 revealed latch는 보존한다. PiP를 다시 열면 현재 곡을 기존 latch에 다시 로드한다. 이미 공개된 곡은 바로 가사를 표시하고, 아직 공개되지 않은 곡은 새로 동기화한 현재 위치에서 다시 판단한다.

모든 ready snapshot 경로는 하나의 presentation 진입점을 거친다.

- 최초 가사 로드
- waveform 또는 pseudo-karaoke enrichment
- 구조적 설정 presentation

인트로를 유지 중이면 enrichment와 설정 결과는 기존 generation, presentation revision, track, session, load-state guard를 통과한 뒤 pending snapshot을 교체한다. 교체된 snapshot과 현재 렌더러 설정으로 첫 보컬을 매번 다시 계산한다.

- 새 첫 보컬이 동기화된 현재 시각과 같거나 과거면 즉시 표시한다.
- 새 첫 보컬까지 2초 이하면 최초 ready 판단과 동일하게 즉시 표시한다.
- 첫 보컬이 더 늦어지고 2초보다 많이 남으면 deadline을 갱신하고 인트로를 유지한다.
- revealed latch가 설정된 뒤에는 이후 snapshot이 가사를 갱신할 수 있지만 다시 hold 상태를 만들 수 없다.

일반 tick은 가장 최근에 받아들인 pending snapshot에서 계산한 첫 보컬 시각을 사용한다. 가사가 이미 공개됐다면 enrichment와 설정 경로는 기존 remount/live-update 동작을 유지한다.

## 재생과 동기화

Intro Gate는 `setTimeout` 또는 벽시계 경과 시간을 사용하지 않는다.

### 재생 갱신 동작

Ready snapshot을 유지 중이면 가사 DOM이 아직 마운트되지 않았더라도 기존 `PlaybackSynchronizer`는 계속 업데이트된다.

각 tick에서 다음을 수행한다.

- Gate가 hold 상태가 아니면 기존 동작을 계속한다.
- 동기화된 시각이 첫 보컬 이전이면 커버 화면을 유지한다.
- 첫 보컬에 도달하거나 지나면 최신 pending snapshot을 정확히 한 번 마운트한다.

마운트 직후 다음 paint 전에 동일한 재생 시각으로 렌더러를 동기화한다. 호출 순서는 `synchronizer update/resync -> mount -> renderer update at the exact same timestamp`다. 첫 렌더러 update는 시간을 진행하지 않는 delta 또는 명시적 sync API를 사용한다. 별도 시계를 진행하지 않고 active/sung/idle class, 음절 gradient progress, interlude 상태, viewport focus, scroll 위치를 갱신한다.

Gate는 항상 `PlaybackSynchronizer.timestampSec`를 사용한다. 이 값은 player timestamp reader를 통해 이미 `lyricsDelayMs`를 반영한다. raw player progress를 별도로 읽지 않으므로 최초 판단·재개·seek·tick이 가사 렌더링과 같은 지연 적용 시각을 사용한다.

### 일시정지와 재개

- 일시정지 중에는 synchronizer가 진행되지 않으며 가사를 공개하지 않는다.
- 재개 시 먼저 Spotify 시각으로 다시 동기화한다.
- 인트로를 유지 중이고 첫 보컬까지 2초 이하면 즉시 가사를 공개한다.
- 2초보다 많이 남았으면 첫 보컬까지 인트로를 유지한다.
- 가사가 이미 공개됐다면 일시정지와 재개로 인트로 화면에 다시 진입하지 않는다.

### 탐색 동작

- 재생 중 seek는 기존 250ms probe와 1.25초 snap 규칙으로 감지한다.
- 인트로 유지 중 첫 보컬 이후로 이동하면 다음 동기화 tick에서 즉시 가사를 공개한다.
- 일시정지 중 seek는 재개 시 resync로 반영한다.
- 가사 공개 후 뒤로 seek해도 커버로 돌아가지 않는다.

## Syllable Wake

### 표시 계약

Synthetic timing 상태는 DOM과 접근성 트리에는 명시적으로 남지만, 보이는 아이콘은 사용하지 않는다.

- `timingSource === "synthetic"`이면 가사 scene에 안정적인 synthetic timing class 또는 data attribute를 추가한다.
- Native timing에는 이 상태를 추가하지 않는다.
- 현재 보이는 `.aura-timing-marker` 코너 모양을 제거한다.
- 안정적이며 고유한 ID를 가진 visually hidden 설명에 synthetic timing의 현지화 문구를 유지한다.
- `.aura-lyrics` scene은 `aria-describedby`로 해당 ID를 참조한다.
- 구조적 언어 변경 시 현지화 텍스트와 명시적 연결을 함께 갱신한다.

### 시각 동작

Syllable Wake는 장식용 반복 sweep이 아니라 기존 음절별 재생 진행률을 사용한다.

- 활성 synthetic 음절의 이미 재생된 부분은 테마 accent와 기존 foreground에서 계산한 대비 안전 wake foreground를 사용한다.
- 진행 경계가 음절을 통과하면서 부드러운 wake를 만든다.
- 활성 synthetic vocal group에는 진폭이 작은 ambient halo를 적용한다. 매우 느리게 호흡할 수 있지만 가사 진행보다 두드러지면 안 되며 레이아웃 공간이나 pointer interaction을 추가하지 않는다.
- Native syllable 가사의 기존 gradient, glow, spring 표현은 그대로 유지한다.
- Line과 static 가사에는 Syllable Wake를 적용하지 않는다.

테마 계층은 `TrackTheme`의 순수 색상·대비 utility로 `syntheticWakeForeground`를 계산한다. Accent 혼합 비율을 필요에 따라 낮춰 active lyric text에 사용되는 유효 scrim 배경에서 최소 `4.5:1` 대비를 유지한다. 기존 foreground와 wake foreground가 모두 기준을 통과해야 하며, active glyph 색상으로 accent만 단독 사용하지 않는다. Unit test는 dark, light, 중간 휘도, 의도적으로 저대비인 accent fixture를 포함한다. Halo는 가산 효과이며 glyph opacity를 낮추거나 대비 기준을 통과한 foreground를 대체할 수 없다.

### 모션 설정

- `motionIntensity`는 독립적인 ambient halo만 선형으로 조절한다. 값이 `0`이면 halo opacity와 호흡 진폭은 정확히 0이지만, 재생 진행률 wake는 source 표시로 남는다.
- `motionEnabled: false`는 독립 호흡을 비활성화하고 재생 위치에 따른 tint는 유지한다.
- `reduceMotion: true`는 독립 호흡을 비활성화하고 진행률 기반 시각 상태로 즉시 전환한다.
- 음절 진행을 위한 두 번째 animation clock을 만들지 않는다.

## 오류 및 경계 동작

- 느린 네트워크: load가 끝날 때까지 기존 `LOADING` metadata를 유지한다.
- 첫 보컬이 2초 이내인 same-turn cache hit: 최종 DOM에는 metadata가 아닌 가사가 존재한다.
- load 오류, 가사 없음, 로컬 곡: 기존 persistent metadata를 유지한다.
- Provider가 instrumental을 반환: 기존 전체 앨범 아트 모드를 유지한다.
- Static 가사: load 후 즉시 표시한다.
- 오래된 track, session, enrichment, settings, theme 결과는 다른 곡의 held intro를 공개하거나 교체할 수 없다.
- vocal이 없는 timed document는 커버를 영구적으로 유지하지 않는다.

## 테스트

### 순수 정책 테스트

- static, line, syllable, 생성된 시작 interlude, background vocal, interlude-only 문서의 첫 보컬 계산
- `1.999`, `2.000`, `2.000` 초과 경계
- 이미 첫 보컬이 지난 경우와 첫 보컬이 없는 경우
- resume 판단과 held intro의 일반 reveal deadline 분리

### 확장 프로그램 통합 테스트

- 보컬이 빠른 same-turn cache hit에서 metadata overlay가 남지 않음
- 느린 load 중에는 기존 `LOADING` 유지
- 긴 인트로에서 loading metadata가 label/진행선 없는 intro-ready metadata로 전환
- 동기화된 첫 보컬 시각까지 held intro 유지
- 최신 pending snapshot을 정확히 한 번 마운트하고 즉시 올바른 가사 행 활성화
- pause 중 held 상태 고정
- 재개 시 2초보다 많이 남으면 커버 유지
- 재개 시 2초 이하면 즉시 공개
- 공개 후 pause/resume으로 커버 복귀 없음
- 동기화 시각이 첫 보컬 이후로 seek되면 공개
- 오래된 track과 PiP close에서 pending intro 폐기
- enrichment와 구조적 설정이 조기 마운트 없이 pending snapshot 갱신
- `line-only`에서 background가 lead보다 먼저 시작해도 표시되는 lead 시각을 사용하고, hold 중 `syncPreference` 변경 시 재계산
- pending enrichment/settings가 첫 보컬을 앞당기거나 늦추거나 2초 구간/현재 시각 이전으로 이동할 때 최신 snapshot 기준으로 처리
- 공개 후 backward seek로 커버 복귀 없음
- 공개 후 backward seek와 수동 refresh를 수행해도 커버 복귀 없음
- 같은 playback track epoch에서 PiP close/open 후 revealed latch 유지
- 아직 공개 전 hold 상태에서 PiP close 시 pending 폐기, 재생 위치가 첫 보컬에 도달하거나 2초 이내가 된 뒤 reopen하면 새 동기화 시각에서 즉시 공개
- 공개 후 no-track 전환이 현재 Gate 수명을 종료하며 다음 유효 곡은 fresh latch 사용
- 새 `trackChanged` 이벤트가 같은 URI 반복 재생에서도 latch 초기화
- 양수·음수 `lyricsDelayMs`에서 최초·재개·tick 판단이 지연 적용된 동기화 시각 사용
- reveal 호출 순서가 resync/update, mount, 동일 timestamp의 즉시 renderer update

### 렌더러 및 스타일 테스트

- synthetic timing root 상태와 `aria-describedby`로 연결된 visually hidden 현지화 설명
- scene의 접근성 설명에 현지화된 synthetic timing 문구 포함 및 언어 변경 반영
- 기존 보이는 corner icon 없음
- native timing에는 synthetic 상태 없음
- Syllable Wake가 기존 음절 진행률과 adaptive theme 변수 사용
- native gradient 변경 없음
- motion disabled/reduced motion에서 독립 호흡 제거
- wake foreground가 dark, light, 중간 휘도, 저대비 accent fixture에서 `4.5:1` 통과
- `motionIntensity: 0`에서 독립 halo opacity/진폭이 0이고 진행 wake는 유지

### 시각 테스트

- synthetic karaoke snapshot을 Syllable Wake로 갱신
- `LOADING`과 진행선이 없는 intro-ready metadata snapshot 추가 또는 갱신
- 기존 native karaoke, line sync, interlude, instrumental, 오로라 light/dark snapshot 보존

## 호환성

- 새 사용자 설정 없음.
- 기존 현지화된 접근성 문구를 보존하면서 보이는 marker 스타일만 제거하므로 설정 키·정규화·preset·번역 변경 없음.
- lyrics cache v2, Provider 순서, retry, cooldown, canonical-only 저장, pseudo-karaoke 생성, 재생 동기화 임계값 변경 없음.
- 전체 앨범 아트 instrumental 모드와 persistent metadata 실패 동작 변경 없음.
