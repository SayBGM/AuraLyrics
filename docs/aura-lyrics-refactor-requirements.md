# AuraLyrics Refactor Requirements

## Goal
현재 UI/동작을 유지하면서 코드 책임을 명확히 나눈다. 리팩토링의 성공 기준은 “새 기능처럼 보이지 않고, 다음 수정이 쉬워지는 것”이다.

## User-Facing Requirements
- PiP 가사는 기존처럼 앨범 아트 배경, 3줄 중심 표시, hover 기반 컨트롤을 유지한다.
- 인터루드는 설정에서 `dots`, `frame`, `wave` 중 선택할 수 있고 기본값은 `dots`다.
- `frame` 인터루드는 PiP 프레임 진행률과 가사 흐림 효과를 사용한다.
- `dots` 인터루드는 기존 `...` 느낌의 pill/dot 표현을 사용한다.
- `wave` 인터루드는 Spicetify audio analysis가 있으면 해당 데이터를 쓰고, 실패하면 deterministic seeded waveform으로 fallback한다.
- 단어 단위 싱크에서만 괄호 가사를 별도 echo로 분리한다. line-only 모드는 원문 줄을 건드리지 않는다.
- 괄호 echo는 괄호를 제거하고 우측 정렬로 표시한다. 단독 괄호 줄은 글자 크기를 줄이지 않는다.
- 설정 변경은 PiP가 열려 있을 때 즉시 반영되어야 한다.
- provider는 Spotify, LRCLIB, Musixmatch만 유지한다. Netease는 제외한다.

## Structural Requirements
- `SettingsStore`는 저장/로드/migration만 담당한다. 설정 타입, 기본값, preset, normalization은 별도 schema 모듈이 담당한다.
- `LyricsRenderer`는 mount/update 조율자 역할만 담당한다. 인터루드 key/progress 계산과 waveform map 생성은 별도 순수 함수로 분리한다.
- `SyllableVocals`는 DOM 생성과 animation만 담당한다. 괄호 파싱/타이밍 분배는 순수 함수로 분리한다.
- `ExtensionApp`은 앱 lifecycle 조율자 역할만 담당한다. album accent 추출과 interlude waveform map 생성은 별도 서비스/헬퍼로 분리한다.
- CSS는 여전히 단일 `pipStyles` 번들 문자열로 export하되, 내부 스타일 그룹은 더 작게 분리 가능한 구조를 유지한다.

## Regression Guard
- `typecheck`, `lint`, `test`, `build`가 모두 통과해야 한다.
- 새로 분리되는 순수 함수는 직접 unit test를 가진다.
- 기존 DOM 테스트는 사용자-facing 동작 보호용으로 유지한다.
