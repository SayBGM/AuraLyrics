# AuraLyrics

Spicetify를 위한 깔끔한 Document Picture-in-Picture 가사 확장입니다.

AuraLyrics는 현재 재생 중인 앨범 커버를 부드러운 blur 배경으로 사용하고, DOM, CSS, Spring 기반 모션으로 동기화 가사를 렌더링합니다. Spicetify의 기존 `popupLyrics`를 현대적인 TypeScript 확장으로 다시 만든 프로젝트이며, Canvas 렌더링은 사용하지 않습니다.

## 주요 기능

- Spotify 데스크톱 Spicetify 환경에서 Document Picture-in-Picture 가사 창 제공.
- 앨범 커버 기반 blur, dim, saturation, vignette 배경.
- Line sync와 syllable/word sync 렌더링 지원.
- Syllable 단위 glow, scale, y-offset, gradient text fill Spring 애니메이션.
- Line sync에서는 글자 채움 없이 라인 전체 active/sung/idle 애니메이션만 사용.
- 이전 가사, 현재 가사, 다음 가사 중심의 3줄 레이아웃.
- 곡 끝 무가사 구간으로 seek해도 마지막 가사 위치까지 자연스럽게 스크롤.
- Spotify, Musixmatch, LRCLIB, Netease provider fallback.
- Musixmatch richsync 기반 word timing 우선 지원.
- Musixmatch captcha/rate-limit 감지 후 cooldown fallback.
- Musixmatch token desktop 발급 실패 시 mobile endpoint fallback.
- 1순위 provider 성공 결과만 저장하는 persistent lyrics cache.
- PiP 내부 이전 곡, 재생/일시정지, 다음 곡, 닫기 컨트롤.
- 열린 PiP에도 즉시 반영되는 반응형 설정 모달.

## 설치

AuraLyrics는 Spicetify가 읽을 수 있는 단일 확장 파일 `aura-lyrics.js`로 배포됩니다.

### macOS / Linux

```sh
curl -fsSL https://github.com/backgwangmin/spotify-lyris/releases/latest/download/install.sh | sh
```

### Windows PowerShell

```powershell
iwr https://github.com/backgwangmin/spotify-lyris/releases/latest/download/install.ps1 -UseB | iex
```

### 수동 설치

1. 최신 release에서 `aura-lyrics.js`를 내려받습니다.
2. Spicetify extensions 폴더에 파일을 복사합니다.
3. 확장을 활성화합니다.

```sh
spicetify config extensions aura-lyrics.js
spicetify apply
```

## 사용법

- Topbar 버튼을 좌클릭하면 PiP 가사 창을 열거나 닫습니다.
- Topbar 버튼을 우클릭하면 설정 창을 엽니다.
- PiP 창 안에서 마우스나 포인터를 움직이면 재생 컨트롤이 나타납니다.
- PiP 창 자체는 사용자가 직접 드래그해서 위치를 옮길 수 있습니다.

Document Picture-in-Picture API는 확장 코드가 창 위치를 직접 지정하는 것을 허용하지 않습니다. AuraLyrics는 PiP 내부 콘텐츠만 제어하고, 창 위치는 OS와 브라우저/CEF가 관리합니다.

## 가사 Provider

지원 provider는 다음 네 가지입니다.

- Spotify
- Musixmatch
- LRCLIB
- Netease

설정에서 provider on/off와 우선순서를 조정할 수 있습니다.

캐시는 일부러 보수적으로 동작합니다. 현재 설정의 1순위 enabled provider가 성공했을 때만 가사를 저장합니다. 2순위 이하 fallback provider 결과는 바로 표시하지만 persistent cache에는 저장하지 않습니다. 예를 들어 Musixmatch captcha 때문에 LRCLIB로 fallback된 가사가 다음 재생부터 1순위 결과처럼 고정되는 일을 막기 위한 정책입니다.

## Musixmatch 참고사항

Musixmatch는 간헐적으로 captcha, rate-limit, blocked, `401/403/429` 응답을 반환할 수 있습니다. AuraLyrics는 이런 응답을 즉시 에러 화면으로 보여주지 않고, Musixmatch를 잠시 건너뛴 뒤 다음 provider로 자연스럽게 fallback합니다.

Token 생성은 두 단계로 시도합니다.

1. Desktop endpoint: `apic-desktop.musixmatch.com`, `app_id=web-desktop-app-v1.0`
2. Mobile fallback endpoint: `apic-appmobile.musixmatch.com`, `app_id=mac-ios-v2.0`

두 endpoint가 모두 실패하면 설정 UI에 desktop/mobile token 요청이 모두 실패했다는 메시지를 표시합니다.

## 설정

설정은 다음 섹션으로 구성됩니다.

- General: preset, aspect ratio, lyrics delay, font scale.
- Background: album background, blur, dim, saturation, vignette, inactive blur.
- Lyrics: sync preference, alignment, vertical position, context lines, interludes.
- Motion: animation, intensity, glow, reduced motion.
- Providers: provider order, enabled state, Musixmatch token.
- Advanced: debug mode, refresh lyrics, clear cache, reset settings.

기본 visual preset은 `Immersive`입니다.

## 개발

의존성 설치:

```sh
npm install
```

검증 명령:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

Release asset 생성:

```sh
npm run package
```

주요 script:

- `npm run dev`: watch build.
- `npm run build`: `dist/aura-lyrics.js` 생성.
- `npm run test`: Vitest 테스트 실행.
- `npm run lint`: Biome 검사 실행.
- `npm run format`: Biome 포맷 적용.
- `npm run package`: release asset과 checksum 생성.

## 기술 스택

- TypeScript
- Vite
- Vanilla DOM + CSS
- Document Picture-in-Picture API
- Vitest + jsdom
- Biome

## 프로젝트 상태

AuraLyrics는 현재 가사 표시, provider fallback, 캐시 정책, 설정, 가벼운 PiP 재생 컨트롤에 집중합니다. PiP 내부에 완전한 플레이어 UI를 넣는 것은 v1 범위에 포함하지 않습니다.

## 면책

AuraLyrics는 비공식 Spicetify 확장이며 Spotify, Spicetify, Musixmatch, LRCLIB, Netease와 공식적으로 관련이 없습니다.
