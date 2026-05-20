# AuraLyrics 요구사항 정리

## 1. 제품 목표
- 기존 `popupLyrics`처럼 Topbar 버튼으로 PiP 가사를 열고, 설정 화면은 우클릭/설정 진입으로 접근한다.
- 기존 Canvas 기반 PiP 대신 Document Picture-in-Picture API를 사용한다.
- 렌더링은 Canvas가 아니라 DOM, CSS, Spring 기반 애니메이션으로 구현한다.
- 앨범 커버를 blur 배경으로 쓰고, `beautiful-lyrics`처럼 유연하고 부드러운 가사 애니메이션을 제공한다.
- v1은 PiP 내부 복잡한 재생 화면보다 가사 표시, provider fallback, 설정, 캐시, 기본 재생 조작에 집중한다.

## 2. PiP 창과 재생 조작
- Document Picture-in-Picture API의 `requestWindow({ width, height })`로 PiP 창을 생성한다.
- API 제약상 코드로 PiP 창의 `left/top` 위치를 지정하거나 `moveTo/moveBy`로 이동하지 않는다.
- 사용자가 직접 창을 드래그해 이동할 수 있도록 PiP 내부 content는 drag region을 막지 않아야 한다.
- 가사 row는 클릭 기능이 없으므로 `button`이 아니라 non-interactive `div`로 렌더링한다.
- PiP 전체에서 마우스/포인터 움직임이 감지되면 재생 컨트롤을 표시한다.
- 컨트롤은 움직임이 없으면 자동으로 숨긴다.
- 하단 컨트롤은 이전 곡, 재생/일시정지, 다음 곡 버튼을 제공한다.
- 닫기 버튼은 하단 컨트롤과 분리해 우측 상단에 표시한다.

## 3. 가사 표시 UX
- 기본 화면은 이전 가사, 현재 가사, 다음 가사 3줄 중심으로 표시한다.
- 현재 가사는 다음 가사가 시작되기 전까지 active highlight를 유지한다.
- 마지막 가사가 끝난 뒤 무가사 구간으로 seek해도 스크롤은 마지막 가사 위치까지 자연스럽게 이동한다.
- active line이 없는 곡 끝 구간에서는 마지막 sung line을 스크롤/visible context 기준으로 사용한다.
- Line sync에서는 글자 채움 progress를 쓰지 않는다.
- Line sync는 라인 전체 active/sung/idle 애니메이션으로 표현한다.
- Syllable/word sync가 있을 때만 gradient fill, glow, scale, y-offset 애니메이션을 적용한다.
- line 단위 가사에서 `♪`, `♫ ♪`처럼 음표만 있는 줄은 일반 lyric이 아니라 interlude로 처리한다.
- interlude는 작은 `...`보다 눈에 띄는 pill 형태와 pulse/dot animation으로 표시한다.
- 마지막 가사 아래에는 작은 출처 표시를 붙인다. 예: `Source: lrclib`.

## 4. 가사 Provider와 동기화
- Provider는 Spotify, Musixmatch, Netease, LRCLIB 4종을 지원한다.
- 설정된 provider 우선순서와 enabled 상태에 따라 fallback한다.
- 설정 화면에서 provider별 on/off와 우선순서 변경을 지원한다.
- Musixmatch token은 사용자가 직접 입력할 수 있고, `spicetify/cli`의 `token.get` 방식으로 생성 버튼도 제공한다.
- Musixmatch token 생성은 desktop endpoint를 먼저 시도한다.
- desktop token 생성이 실패하거나 token을 반환하지 않으면 `lyrics-plus` 방식의 mobile endpoint를 한 번 fallback으로 시도한다.
- desktop token endpoint는 `apic-desktop.musixmatch.com`과 `app_id=web-desktop-app-v1.0`을 사용한다.
- mobile token endpoint는 `apic-appmobile.musixmatch.com`, `app_id=mac-ios-v2.0`, iOS Musixmatch 형태의 headers를 사용한다.
- desktop/mobile token 생성이 모두 실패하면 두 endpoint가 모두 실패했다는 메시지를 표시한다.
- Musixmatch는 line subtitle보다 `track.richsync.get` word timing을 우선 시도한다.
- Musixmatch richsync가 있으면 word/token timing을 내부 `SyllableLyrics`로 normalize한다.
- richsync가 없거나 실패하면 기존 subtitle line lyrics로 fallback한다.
- Musixmatch가 captcha, rate-limit, blocked, too many attempts 또는 `401/403/429` 성격의 응답을 반환하면 `temporarily-unavailable`로 분류한다.
- Musixmatch temporary block은 일반 provider error로 표시하지 않고, 즉시 다음 provider로 fallback한다.
- temporary block 상태의 Musixmatch는 기본 10분 cooldown 동안 요청 자체를 건너뛴다.
- Musixmatch temporary block은 전체 lyrics retry budget을 소모하지 않도록 처리한다.
- 가사 로드가 provider error로 실패하면 전체 로드를 최대 3회까지 재시도하고, 모두 실패한 뒤 `Lyrics failed`를 표시한다.
- `no-lyrics`, `instrumental`, `unsupported-local`처럼 확정 결과는 재시도하지 않는다.

## 5. 가사 캐시
- 가사는 곡 URI 기준으로 캐시한다.
- 캐시는 provider 출처와 normalized lyrics를 함께 저장한다.
- 캐시는 현재 설정의 1순위 enabled provider가 성공했을 때만 저장한다.
- 2순위 이하 fallback provider 결과는 표시만 하고 persistent cache에는 저장하지 않는다.
- 저장된 캐시가 현재 설정의 1순위 enabled provider와 다르면 cache hit로 사용하지 않는다.
- Musixmatch captcha 등으로 fallback된 가사가 다음 재생에서 1순위 결과처럼 고정되지 않아야 한다.
- 앱 재시작 후에도 유지되도록 `Spicetify.LocalStorage` 기반 persistent cache를 사용한다.
- 기본 TTL은 14일이다.
- 기본 최대 캐시 개수는 80곡이다.
- 최대 개수를 넘으면 오래된 항목부터 정리한다.
- 설정의 `Clear cache` 액션으로 캐시를 삭제할 수 있다.
- LocalStorage quota나 storage 실패가 발생해도 가사 로딩 성공을 provider 실패로 바꾸지 않는다.
- persistent cache write는 best-effort로 처리하고, 실패 시에도 메모리 캐시는 유지한다.
- 현재 규모에서는 IndexedDB보다 LocalStorage 기반 캐시로 충분하다.
- 향후 수백~수천 곡, 검색, provider별 versioning이 필요해지면 IndexedDB 전환을 검토한다.

## 6. 배경과 비주얼 설정
- 기본 프리셋은 `immersive`다.
- 앨범 커버를 배경으로 표시하고 blur, dim, saturation, vignette를 적용한다.
- 배경 on/off, blur, dim, saturation, vignette 값은 설정에서 조정할 수 있다.
- 설정 변경은 PiP root CSS 변수에 반영되어 열린 PiP에도 즉시 적용된다.
- 주변 줄은 inactive blur를 적용할 수 있다.
- 설정에서 inactive blur 강도를 조절할 수 있다.
- 폰트 크기는 고정 px가 아니라 PiP 창 크기에 따라 자동으로 변한다.
- 폰트 크기는 `clamp()`와 `vmin` 기반으로 계산하고, 설정에서는 `Font scale`만 조정한다.

## 7. 설정 화면
- 설정 화면은 Spicetify PopupModal 안에서 깨지지 않아야 한다.
- 작은 모달 폭에서도 좌우 스크롤이 생기지 않도록 responsive layout을 사용한다.
- 설정 섹션은 General, Background, Lyrics, Motion, Providers, Advanced로 구성한다.
- Provider 순서 변경 버튼은 모달 밖으로 click event가 bubble되지 않아야 한다.
- 설정 화면 버튼은 disabled처럼 보이지 않아야 한다.
- 일반 액션 버튼은 명확한 active 색상으로 표시하고, icon button의 disabled 상태만 낮은 opacity로 구분한다.

## 8. 상태와 오류 화면
- 재생 중인 트랙이 없으면 waiting 상태를 표시한다.
- 가사 로딩 중에는 loading 상태를 표시한다.
- 가사가 없거나 instrumental이면 no lyrics/instrumental 상태를 구분한다.
- provider 실패는 retry 후에도 실패할 때만 error로 표시한다.
- 에러 화면에는 `Retry current track` 액션을 제공한다.
- Musixmatch captcha/rate-limit은 사용자에게 `Lyrics failed`로 바로 노출하지 않고 provider fallback/cooldown으로 흡수한다.
- debug 목적의 provider source는 debugMode와 무관하게 마지막 가사 아래에 작게 표시한다.

## 9. 기술 스택과 빌드
- TypeScript로 구현한다.
- Vite로 Spicetify용 단일 IIFE JS 파일을 빌드한다.
- React 없이 Vanilla DOM + CSS를 사용한다.
- CSS는 JS bundle 안에 inline string으로 포함한다.
- Vitest + jsdom으로 unit/DOM 테스트를 작성한다.
- Biome 2로 lint/format을 관리한다.
- npm + `package-lock.json`을 사용한다.
- 배포 산출물은 `dist/aura-lyrics.js` 단일 파일이다.

## 10. CI/CD와 설치
- PR/main push에서 typecheck, lint, test, build를 실행한다.
- release workflow는 tag/manual dispatch에서 release asset을 만든다.
- release asset은 `aura-lyrics.js`, `install.sh`, `install.ps1`, `SHA256SUMS`를 포함한다.
- 설치 스크립트는 Spicetify CLI 존재 여부를 확인한다.
- 설치 스크립트는 extension 폴더에 JS 파일을 내려받고 `spicetify config extensions aura-lyrics.js`, `spicetify apply`를 수행한다.

## 11. 테스트 요구사항
- Spring 수렴과 sleeping 상태를 테스트한다.
- LRC/enhanced LRC parser를 테스트한다.
- Musixmatch richsync parser와 provider 우선순위를 테스트한다.
- Musixmatch captcha/rate-limit 감지와 cooldown fallback을 테스트한다.
- Musixmatch token desktop 실패 후 mobile endpoint fallback을 테스트한다.
- Lyrics normalizer가 음표-only line을 interlude로 바꾸는지 테스트한다.
- Lyrics cache의 persistence, TTL, eviction을 테스트한다.
- Lyrics cache가 1순위 provider 성공일 때만 저장되고 fallback provider 결과를 cache hit로 사용하지 않는지 테스트한다.
- SettingsStore migration과 기본값을 테스트한다.
- SettingsView provider 순서 변경과 modal event bubbling 방지를 테스트한다.
- DocumentPipController controls, settings application, pointer movement visibility를 테스트한다.
- LyricsRenderer active/sung/idle, 3줄 context, provider source 표시를 테스트한다.
- LyricsRenderer가 마지막 가사 이후 seek에서도 마지막 sung line을 기준으로 스크롤하는지 테스트한다.
- SpicetifyPlayerAdapter가 `pause/play`를 우선 사용하고 없을 때만 `togglePlay`로 fallback하는지 테스트한다.
- MusicStateMachine 전이를 테스트한다.

## 12. 구현 완료 상태
- Document Picture-in-Picture 기반 PiP shell 구현 완료.
- Topbar open/close와 설정 modal 구현 완료.
- DOM line/syllable renderer 구현 완료.
- 3줄 context 표시 구현 완료.
- Line mode와 syllable mode 애니메이션 분리 완료.
- Musixmatch token 생성과 richsync 우선 처리 구현 완료.
- Musixmatch token desktop-to-mobile fallback 구현 완료.
- Musixmatch captcha/rate-limit cooldown fallback 구현 완료.
- Provider 순서 설정 구현 완료.
- Persistent lyrics cache 구현 완료.
- 1순위 provider 전용 cache 저장/사용 정책 구현 완료.
- PiP playback controls 구현 완료.
- PiP playback pause/play fallback 구현 완료.
- 마지막 가사 이후 seek 스크롤 보정 구현 완료.
- 설정 즉시 반영 흐름 구현 완료.
- CI/CD와 설치 스크립트 초안 구현 완료.
