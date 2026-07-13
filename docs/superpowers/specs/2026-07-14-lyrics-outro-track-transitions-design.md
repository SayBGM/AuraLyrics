# 가사 아웃트로 및 곡 전환 설계

## 요약

AuraLyrics는 시간 정보가 있는 가사의 마지막 보컬이 끝난 뒤 2초가 실제 재생 시각상 지난 경우 곡 정보 화면을 표시한다. 이 판단은 timeout이 아니라 현재 동기화된 재생 시각과 절대 임계값을 비교해 수행한다.

- 가사 종료 아웃트로: 가사 화면 전체가 위로 나가고 현재 곡 정보가 아래에서 들어온다.
- 다음 곡: 기존 화면이 왼쪽으로 나가고 다음 곡 정보가 오른쪽에서 들어온다.
- 이전 곡: 기존 화면이 오른쪽으로 나가고 이전 곡 정보가 왼쪽에서 들어온다.
- 외부 조작처럼 방향을 판별할 수 없는 변경: 기존 화면이 위로 나가고 새 곡 정보가 아래에서 들어온다.
- 곡의 자연 종료로 다음 곡이 재생되는 경우는 다음 곡으로 판정해 왼쪽 전환을 사용한다.

마지막 보컬 뒤 남은 곡 길이가 2초보다 짧으면 현재 곡 정보 아웃트로는 건너뛴다. 그러나 자연스럽게 다음 곡으로 넘어갈 때의 왼쪽 전환은 유지한다. 이 경우 마지막 가사 화면이 왼쪽으로 나가고 다음 곡 정보가 오른쪽에서 들어온다.

새 사용자 설정, 저장 키, 캐시 형식, Provider 동작, 가사 문서 형식은 추가하거나 변경하지 않는다.

## 목표

1. 마지막으로 실제 렌더되는 보컬 종료 후 2초가 지난 재생 위치에서 현재 곡 정보를 보여준다.
2. PiP를 늦게 열거나 가사가 늦게 준비되거나 임계값 이후로 탐색해도 곡 정보를 즉시 보여준다.
3. 곡 정보 상태에서 가사 구간으로 돌아가면 가사 화면을 즉시 복원하고, 다시 임계값을 지나면 아웃트로를 재실행한다.
4. 다음·이전·자연 종료·방향 불명 곡 변경에 합의된 방향의 화면 전체 콘텐츠 전환을 적용한다.
5. 현재 곡 정보 아웃트로를 표시할 시간이 부족해도 다음 곡 전환은 끊기지 않게 한다.
6. 빠른 로드, 연속 스킵, 오래된 비동기 결과가 진행 중인 전환을 끊거나 최신 곡을 덮지 않게 한다.
7. 기존 인트로 Gate, pseudo-karaoke, waveform enrichment, 재생 동기화, 오류·instrumental 표시 동작을 보존한다.

## 비목표

- 2초 대기 시간이나 전환 방향을 사용자 설정으로 노출하는 것.
- 정적 가사에 곡 종료 시각을 추정해 아웃트로를 적용하는 것.
- 마지막 보컬 뒤 남은 시간이 부족할 때 2초를 임의로 단축하는 것.
- 재생 컨트롤, 닫기 버튼, 테두리 프레임까지 이동시키는 것.
- Spotify의 모든 외부 재생 조작 원인을 완벽하게 복원하는 것.
- 기존 가사·메타데이터 레이아웃을 재설계하는 것.

## 핵심 시간 모델

### 마지막 렌더 보컬 종료 시각

순수 helper `lastRenderedVocalEndSec(lyrics, syncPreference)`가 현재 렌더 설정에서 실제로 보이는 마지막 보컬의 종료 시각을 계산한다.

- `StaticLyrics`: 시간 정보가 없으므로 `undefined`.
- `LineLyrics`: 모든 `type: "vocal"` 항목의 `endTime` 최댓값.
- `SyllableLyrics`와 `prefer-syllable`: lead와 background 보컬의 `endTime` 최댓값.
- `SyllableLyrics`와 `line-only`: 실제 line 변환에 쓰이는 lead 보컬의 `endTime` 최댓값. 숨겨진 background는 제외한다.
- vocal이 없고 interlude만 있는 문서: `undefined`.
- Provider 또는 생성 interlude는 종료 시각 계산에서 제외한다.

구조적 설정 변경으로 `syncPreference`가 바뀌면 현재 snapshot과 새 설정으로 종료 시각을 다시 계산한다.

### 2초 절대 임계값

`OUTRO_METADATA_DELAY_SEC`는 값이 `2`인 고정 내부 상수다.

```text
metadataThresholdSec = lastRenderedVocalEndSec + 2
shouldShowMetadata = playbackTimestampSec >= metadataThresholdSec
```

이는 “종료를 감지한 뒤 2초짜리 timeout을 시작”하는 모델이 아니다. 다음 모든 경우에 snapshot을 받아들이거나 동기화한 바로 그 시점의 재생 시각으로 판단한다.

- 최초 ready 가사 수신
- PiP 열기 또는 다시 열기
- 일시정지 후 재개
- 재생 중 seek snap
- 일시정지 상태에서 progress 이벤트로 감지한 seek
- waveform 또는 pseudo-karaoke enrichment
- 구조적 설정 변경

이미 임계값을 지났다면 곡 정보 화면을 즉시 선택한다. 임계값 전이라면 가사를 유지하고 일반 재생 tick에서 임계값 도달을 판단한다. 재생이 멈추면 동기화된 재생 시각도 진행되지 않으므로 대기 시간 역시 진행되지 않는다.

`metadataThresholdSec`가 트랙 duration보다 크면 현재 곡 정보 아웃트로는 표시하지 않는다. 임계값을 duration으로 clamp하거나 대기 시간을 단축하지 않는다.

## 상태와 소유권

### `OutroPresentationController`

새 순수 상태 컨트롤러가 현재 playback track epoch의 아웃트로 판단을 소유한다.

```text
inactive
  -> lyrics(snapshot, threshold)
  -> metadata(snapshot, threshold)
  -> lyrics(snapshot, threshold)   # backward seek
```

컨트롤러는 다음 최소 상태만 가진다.

- 현재 ready snapshot
- 계산된 `metadataThresholdSec`
- 현재 표현이 `lyrics`인지 `metadata`인지
- 현재 playback track epoch 식별자

`accept(snapshot, settings, timestampSec)`와 `evaluate(timestampSec)`는 다음 결과 중 하나를 반환한다.

- `none`: DOM 변경 없음
- `show-lyrics`: 최신 snapshot을 가사로 표시
- `show-metadata`: snapshot의 track을 persistent 곡 정보로 표시

임계값 이후 `show-metadata`는 같은 방향 진행에서 정확히 한 번만 반환한다. 이후 임계값 전으로 seek하면 `show-lyrics`를 한 번 반환하고, 다시 임계값을 지나면 `show-metadata`를 다시 반환할 수 있다.

상태는 다음 상황에서 초기화한다.

- 실제 player `trackChanged` 이벤트. 동일 URI 반복 재생도 새 epoch로 처리한다.
- no-track 전환
- PiP session 종료
- 애플리케이션 destroy

수동 가사 새로고침, enrichment, 구조적 설정 변경은 epoch를 새로 만들지 않고 최신 snapshot과 임계값을 교체한다.

### 곡 이동 방향

`TrackTransitionDirectionController`가 다음 한 번의 `trackChanged`에 사용할 intent를 관리한다.

- PiP 다음 버튼: `next`를 기록한 뒤 `player.next()` 호출.
- PiP 이전 버튼: `previous`를 기록한 뒤 `player.previous()` 호출.
- 기록된 intent는 다음 실제 `trackChanged`에서 한 번만 소비한다.
- intent가 오래 남지 않도록 트랙 변경 실패 또는 제한 시간 경과 시 폐기한다.

[Spicetify Player의 공식 `songchange` 이벤트](https://spicetify.app/docs/development/api-wrapper/methods/player)는 새 player state를 제공하지만 변경 원인을 직접 제공하지 않는다. 명시적 intent가 없는 변경은 이전 트랙의 마지막으로 관측한 progress와 duration을 사용한다.

- 이전 progress가 duration 종료 구간 안이면 자연 종료에 의한 `next`로 추론한다.
- 그렇지 않으면 `unknown`이다.
- 종료 구간은 `NATURAL_END_TOLERANCE_SEC = 2`로 고정하고 순수 정책 테스트로 경계를 명시한다.
- 명시적 `previous` 또는 `next` intent가 항상 추론보다 우선한다.

`SpicetifyPlayerAdapter`는 공식 `onprogress` 이벤트의 마지막 progress를 트랙별로 보존하고, `trackChanged` payload에 직전 트랙 progress를 함께 전달한다. 새 트랙의 첫 progress가 직전 값을 덮기 전에 songchange 처리에서 소비한다. 외부 조작이 실제 종료 2초 안에서 발생하면 자연 종료로 분류될 수 있다는 제한은 허용한다. 내부의 불안정한 Queue API에는 의존하지 않는다.

### 방향 매핑

| 원인 | 나가는 방향 | 들어오는 방향 |
|---|---|---|
| 현재 가사 종료 아웃트로 | 위 | 아래에서 위 |
| 명시적 다음 | 왼쪽 | 오른쪽에서 왼쪽 |
| 자연 종료 후 다음 곡 | 왼쪽 | 오른쪽에서 왼쪽 |
| 명시적 이전 | 오른쪽 | 왼쪽에서 오른쪽 |
| 방향 불명 변경 | 위 | 아래에서 위 |

곡 변경 전 현재 화면이 metadata인지 lyrics인지는 방향을 바꾸지 않는다. 따라서 현재 곡 정보 아웃트로가 시간 부족으로 생략된 자연 종료에서도 마지막 가사가 왼쪽으로 나가고 다음 곡 loading metadata가 오른쪽에서 들어온다.

## 장면 전환

### 콘텐츠 장면

기존 `LyricsRenderer`의 `mount`, `showTrackMetadata`, `showStatus`, `showAlbumArt`는 장면 DOM을 먼저 만든 뒤 공통 scene presenter에 전달하도록 정리한다.

scene presenter는 전환 중 기존 장면과 새 장면을 동시에 유지한다.

1. 현재 장면을 outgoing plane으로 고정한다.
2. 새 장면을 viewport 크기의 incoming plane에 마운트한다.
3. 방향 class를 추가해 두 plane을 함께 이동한다.
4. 전환 완료 후 outgoing을 제거하고 incoming을 정상 장면으로 승격한다.

전환 시간은 목업에서 승인한 `720ms`, easing은 `cubic-bezier(0.22, 1, 0.36, 1)`을 사용한다. 별도 JavaScript animation loop를 만들지 않고 CSS transform과 opacity로 실행한다.

슬라이드 대상은 `.pip-content` 안의 가사·상태·곡 정보 콘텐츠 전체다. `.pip-controls`, 닫기 버튼, border frame은 고정해 전환 도중에도 조작 위치와 포커스가 움직이지 않게 한다.

### 배경과 테마

`DocumentPipController`는 현재 단일 `.pip-cover`를 두 장의 cover plane으로 확장한다.

- incoming cover가 로드되면 outgoing cover와 짧게 교차 페이드한다.
- cover가 없거나 로드에 실패하면 기존 fallback background를 사용한다.
- 새 track theme는 incoming 콘텐츠에 적용하며, 전환 중 outgoing 콘텐츠는 전환 시작 시점의 theme CSS 값을 보존한다.
- 전환 완료 후 새 theme를 session의 정상 theme으로 승격하고 오래된 inline snapshot을 제거한다.

scrim과 vignette는 viewport에 고정한다. 따라서 콘텐츠 방향은 명확하게 보이면서 재생 컨트롤과 텍스트 대비가 흔들리지 않는다.

### 전환 중 최신 렌더 보존

장면 전환은 monotonically increasing transition generation을 사용한다.

- 전환 중 새로운 트랙 변경이 오면 현재 animation을 취소하고 가장 최신 track metadata를 새 목표로 사용한다.
- 같은 트랙의 가사 load, enrichment, 구조적 설정 결과가 먼저 도착하면 최신 렌더 요청 하나만 보류한다.
- 전환 완료 시 generation, track URI, session이 모두 현재인 경우에만 보류한 요청을 적용한다.
- 오래된 요청은 기존 TrackSession generation guard와 scene transition generation guard 중 하나에서 폐기한다.

다음 곡의 첫 ready snapshot이 전환보다 빨리 도착해도 최소한 승인된 곡 정보 진입 animation은 끝까지 보여준다. 완료 직후 Intro Gate가 최신 timestamp에서 intro 또는 lyrics 표시를 결정한다.

## ExtensionApp 통합 흐름

### ready snapshot 표시

모든 ready snapshot 진입점은 Intro Gate를 거친 뒤 Outro Controller를 거친다.

```text
ready snapshot
  -> Intro Gate: loading/intro 유지 여부
  -> lyrics 공개 가능
  -> Outro Controller: 현재 timestamp가 마지막 보컬 + 2초 이후인지 판단
  -> lyrics 또는 current-track metadata
```

따라서 late load 또는 late PiP open에서 가사 DOM을 잠깐 마운트했다가 metadata로 바꾸는 flash가 발생하지 않는다.

### tick과 seek

- 재생 중 tick: synchronizer update 후 Intro Gate와 Outro Controller를 순서대로 평가한다.
- 가사 장면이면 기존 renderer update를 계속한다.
- metadata 장면이면 가사 animation update는 중단하지만 Outro Controller는 timestamp를 계속 평가한다.
- backward seek로 threshold 이전이 되면 최신 snapshot을 즉시 가사로 remount하고 같은 timestamp로 `renderer.update(timestamp, 0)`를 호출한다.
- 일시정지 중 seek는 새 `onprogress` 구독으로 synchronizer를 resync하고 같은 정책을 즉시 평가한다.

### 곡 변경

`onTrackChanged`는 기존 track/session 정보를 초기화하기 전에 방향을 결정한다.

1. pending 명시적 intent 소비.
2. intent가 없으면 이전 track의 마지막 progress와 duration으로 자연 종료 판단.
3. 새 track epoch 시작 및 기존 async generation 무효화.
4. 새 track cover/theme 로드를 시작하고 loading metadata scene 구성.
5. 현재 장면 종류와 무관하게 결정된 방향으로 새 metadata scene 전환.
6. 가사 load 결과는 전환 완료까지 최신 값 하나만 보류.

no-track과 오류는 방향 animation을 강제하지 않고 기존 상태 표시 규칙을 유지한다.

## 모션 및 접근성

- `motionEnabled: false` 또는 `reduceMotion: true`이면 시간 정책과 방향 판정은 유지하되 DOM은 즉시 교체한다.
- 전환 중 중복 장면이 접근성 트리에 동시에 노출되지 않게 outgoing plane은 새 장면이 준비된 시점에 `aria-hidden="true"`로 전환한다.
- metadata scene의 기존 `aria-label`, 제목, 가수·앨범 정보는 그대로 유지한다.
- 장면 wrapper는 pointer event를 outgoing에서 제거하고 incoming에서만 허용한다.
- controls는 scene 바깥에 있으므로 keyboard focus와 버튼 위치가 유지된다.

## 오류 및 경계 동작

- 마지막 보컬 없음 또는 static 가사: 현재 곡 정보 아웃트로 없음.
- 마지막 보컬 + 2초가 duration 이후: 현재 곡 정보 아웃트로 없음.
- 위 조건에서 자연 종료: 마지막 가사에서 다음 곡 metadata로 왼쪽 전환.
- PiP late open, late ready, threshold 이후 seek: 현재 곡 metadata 즉시 표시.
- threshold 이전 backward seek: 가사 즉시 복귀, 이후 threshold 재통과 시 아웃트로 재실행.
- pause가 threshold 전에 시작됨: 재생 시각이 멈추므로 metadata로 바뀌지 않음.
- pause 시점이 이미 threshold 이후이거나 paused seek가 threshold 이후임: metadata 즉시 표시.
- 연속 next/previous: 현재 transition 취소, 최신 곡과 최신 intent만 유지.
- 새 cover 로드 실패: fallback background와 새 metadata는 정상 표시.
- 오래된 cover/theme/load/enrichment/settings 결과: generation 또는 URI guard에서 폐기.
- same-URI 반복 trackChanged: 새 epoch와 새 방향 판정을 시작.
- instrumental, no-lyrics, provider error, unsupported local: 기존 persistent metadata 또는 album-art 정책을 유지하되 곡 변경 진입 animation은 적용 가능.

## 테스트

### 순수 정책 테스트

- line lyrics에서 interlude를 제외한 마지막 vocal 종료 시각.
- syllable `prefer-syllable`에서 lead보다 늦는 background 포함.
- syllable `line-only`에서 숨겨진 background 제외.
- static 및 interlude-only에서 종료 시각 없음.
- threshold 직전, 정확히 일치, 직후 판단.
- late accept에서 즉시 metadata.
- metadata 이후 backward seek로 lyrics, 재통과로 metadata.
- threshold가 duration 이후여도 clamp하지 않음.
- 명시적 next/previous intent의 일회성 소비와 만료.
- 자연 종료 tolerance 직전·경계·초과 및 unknown fallback.

### Player Adapter 테스트

- `onprogress` attach/detach.
- songchange가 직전 트랙 progress를 새 track payload와 함께 방출.
- 첫 새-track progress가 이전 값을 오염시키지 않음.
- progress가 없는 경우 undefined로 안전하게 fallback.

### ExtensionApp 통합 테스트

- 마지막 보컬 + 2초에 current metadata를 정확히 한 번 표시.
- late load와 late PiP open에서 lyrics flash 없이 metadata 직접 표시.
- pause 전 threshold 미도달 시 유지, resume resync 후 올바른 즉시 판단.
- 재생 중 및 일시정지 중 backward seek에서 lyrics 복귀.
- 명시적 next 왼쪽, previous 오른쪽.
- 자연 종료 왼쪽, unknown 위쪽.
- current metadata 아웃트로가 생략된 자연 종료에서도 lyrics-to-next-metadata 왼쪽 전환.
- transition 중 ready load가 완료돼도 animation 종료까지 보류.
- rapid skip에서 최신 track metadata와 최신 direction만 남음.
- same URI 반복, PiP close, destroy에서 상태 초기화.
- enrichment와 구조적 설정이 threshold를 앞뒤로 이동할 때 최신 snapshot 기준 표시.
- 양수·음수 `lyricsDelayMs`에서 renderer와 같은 timestamp 사용.

### 렌더러·PiP 테스트

- 위·왼쪽·오른쪽 direction class와 incoming/outgoing plane 구성.
- transition 완료 후 outgoing DOM, 임시 class, inline theme snapshot 정리.
- 취소된 transition callback이 최신 scene을 제거하지 않음.
- reduce motion과 motion disabled에서 즉시 교체.
- transition 중 outgoing `aria-hidden`, pointer-events 차단.
- cover double buffer 교차 전환과 load 실패 fallback.
- controls, close, border frame이 scene plane 바깥에 유지.

### 시각 테스트

- 마지막 가사에서 current metadata로 위쪽 전환.
- current metadata에서 next metadata로 왼쪽 전환.
- current metadata에서 previous metadata로 오른쪽 전환.
- 짧은 tail에서 마지막 가사에서 next metadata로 왼쪽 전환.
- reduce-motion 최종 상태.

기존 정적 snapshot은 최종 정지 상태를 보존한다. 방향 동작은 animation 시작·중간·완료 상태를 명시적으로 고정하거나 Playwright transition event를 제어해 검증한다.

## 호환성과 배포

- 새 설정과 마이그레이션 없음.
- lyrics cache v2와 Provider 결과 형식 변경 없음.
- Spicetify 공식 `onprogress` 이벤트만 runtime surface에 추가하고 불안정한 Queue/Platform API는 사용하지 않는다.
- 번들 구조는 기존 단일 IIFE를 유지한다.
- 성능상 동시에 존재하는 scene과 cover는 transition 동안 최대 두 개이며 완료 또는 취소 즉시 오래된 plane을 제거한다.
