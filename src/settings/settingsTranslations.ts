import type { UiLanguage } from "./SettingsStore";

export type TranslationKey =
	| "advanced"
	| "alignment"
	| "animations"
	| "background"
	| "blur"
	| "clearCache"
	| "contextLines"
	| "debugMode"
	| "dim"
	| "fontScale"
	| "general"
	| "generateMusixmatchToken"
	| "glow"
	| "heroDetail"
	| "heroEyebrow"
	| "heroTitle"
	| "inactiveBlur"
	| "intensity"
	| "interludeStyle"
	| "language"
	| "lyrics"
	| "lyricsDelay"
	| "motion"
	| "moveDown"
	| "moveUp"
	| "musixmatchProxyBaseUrl"
	| "musixmatchProxyMode"
	| "musixmatchProxyModeCustomDescription"
	| "musixmatchProxyModeDefaultDescription"
	| "musixmatchToken"
	| "preset"
	| "providerOrder"
	| "providers"
	| "pseudoKaraoke"
	| "reduceMotion"
	| "refreshCurrentLyrics"
	| "requestingToken"
	| "resetSettings"
	| "saturation"
	| "showInterludes"
	| "sync"
	| "tokenMissing"
	| "tokenUpdated"
	| "vignette";

export type OptionGroup = "alignment" | "interlude" | "language" | "musixmatchProxyMode" | "preset" | "sync";

const TRANSLATIONS: Record<UiLanguage, Record<TranslationKey, string>> = {
	en: {
		advanced: "Advanced",
		alignment: "Alignment",
		animations: "Animations",
		background: "Background",
		blur: "Blur",
		clearCache: "Clear cache",
		contextLines: "Context lines",
		debugMode: "Debug mode",
		dim: "Dim",
		fontScale: "Font scale",
		general: "General",
		generateMusixmatchToken: "Generate Musixmatch token",
		glow: "Glow",
		heroDetail: "Lyric sync, motion, ambience, and providers in one focused surface.",
		heroEyebrow: "AURALYRICS CONTROL",
		heroTitle: "Tune the PiP stage.",
		inactiveBlur: "Inactive blur",
		intensity: "Intensity",
		interludeStyle: "Interlude style",
		language: "Language",
		lyrics: "Lyrics",
		lyricsDelay: "Lyrics delay (ms)",
		motion: "Motion",
		moveDown: "Move {provider} down",
		moveUp: "Move {provider} up",
		musixmatchProxyBaseUrl: "Proxy server URL",
		musixmatchProxyMode: "Musixmatch proxy",
		musixmatchProxyModeCustomDescription:
			"Route desktop requests through a proxy that takes the target URL as a query parameter, e.g. https://your-proxy.example.com/?url=",
		musixmatchProxyModeDefaultDescription: "Request directly from Musixmatch's official servers.",
		musixmatchToken: "Musixmatch token",
		preset: "Preset",
		providerOrder: "Provider order: {order}",
		providers: "Providers",
		pseudoKaraoke: "Synthesized karaoke",
		reduceMotion: "Reduce motion",
		refreshCurrentLyrics: "Refresh current lyrics",
		requestingToken: "Requesting Musixmatch token...",
		resetSettings: "Reset settings",
		saturation: "Saturation",
		showInterludes: "Show interludes",
		sync: "Sync",
		tokenMissing: "Musixmatch token was not returned.",
		tokenUpdated: "Musixmatch token updated.",
		vignette: "Vignette",
	},
	ko: {
		advanced: "고급",
		alignment: "정렬",
		animations: "애니메이션",
		background: "배경",
		blur: "블러",
		clearCache: "캐시 지우기",
		contextLines: "문맥 줄 수",
		debugMode: "디버그 모드",
		dim: "어둡게",
		fontScale: "글자 크기",
		general: "일반",
		generateMusixmatchToken: "Musixmatch 토큰 생성",
		glow: "글로우",
		heroDetail: "가사 싱크, 모션, 배경감, 제공자를 한 화면에서 조정합니다.",
		heroEyebrow: "AURALYRICS 제어",
		heroTitle: "PiP 무대를 조정하세요.",
		inactiveBlur: "비활성 블러",
		intensity: "강도",
		interludeStyle: "인터루드 스타일",
		language: "언어",
		lyrics: "가사",
		lyricsDelay: "가사 지연 (ms)",
		motion: "모션",
		moveDown: "{provider} 아래로 이동",
		moveUp: "{provider} 위로 이동",
		musixmatchProxyBaseUrl: "프록시 서버 주소",
		musixmatchProxyMode: "Musixmatch 프록시",
		musixmatchProxyModeCustomDescription:
			"타겟 URL을 쿼리 파라미터로 받는 프록시로 desktop 요청을 우회합니다. 예: https://your-proxy.example.com/?url=",
		musixmatchProxyModeDefaultDescription: "Musixmatch 공식 서버로 직접 요청합니다.",
		musixmatchToken: "Musixmatch 토큰",
		preset: "프리셋",
		providerOrder: "제공자 순서: {order}",
		pseudoKaraoke: "노래방 자동 합성",
		providers: "제공자",
		reduceMotion: "모션 줄이기",
		refreshCurrentLyrics: "현재 가사 새로고침",
		requestingToken: "Musixmatch 토큰 요청 중...",
		resetSettings: "설정 초기화",
		saturation: "채도",
		showInterludes: "인터루드 표시",
		sync: "싱크",
		tokenMissing: "Musixmatch 토큰이 반환되지 않았습니다.",
		tokenUpdated: "Musixmatch 토큰이 업데이트되었습니다.",
		vignette: "비네트",
	},
	ja: {
		advanced: "詳細",
		alignment: "配置",
		animations: "アニメーション",
		background: "背景",
		blur: "ぼかし",
		clearCache: "キャッシュを削除",
		contextLines: "前後の行数",
		debugMode: "デバッグモード",
		dim: "暗さ",
		fontScale: "文字サイズ",
		general: "一般",
		generateMusixmatchToken: "Musixmatch トークンを生成",
		glow: "グロー",
		heroDetail: "歌詞同期、モーション、背景感、プロバイダーを一画面で調整します。",
		heroEyebrow: "AURALYRICS コントロール",
		heroTitle: "PiP ステージを調整。",
		inactiveBlur: "非アクティブぼかし",
		intensity: "強度",
		interludeStyle: "インタールードスタイル",
		language: "言語",
		lyrics: "歌詞",
		lyricsDelay: "歌詞の遅延 (ms)",
		motion: "モーション",
		moveDown: "{provider} を下へ移動",
		moveUp: "{provider} を上へ移動",
		musixmatchProxyBaseUrl: "プロキシサーバーURL",
		musixmatchProxyMode: "Musixmatchプロキシ",
		musixmatchProxyModeCustomDescription:
			"ターゲットURLをクエリパラメータで受け取るプロキシ経由でdesktopリクエストを迂回します。例: https://your-proxy.example.com/?url=",
		musixmatchProxyModeDefaultDescription: "Musixmatch公式サーバーに直接リクエストします。",
		musixmatchToken: "Musixmatch トークン",
		preset: "プリセット",
		providerOrder: "プロバイダー順: {order}",
		pseudoKaraoke: "カラオケ自動合成",
		providers: "プロバイダー",
		reduceMotion: "モーションを減らす",
		refreshCurrentLyrics: "現在の歌詞を更新",
		requestingToken: "Musixmatch トークンをリクエスト中...",
		resetSettings: "設定をリセット",
		saturation: "彩度",
		showInterludes: "インタールード表示",
		sync: "同期",
		tokenMissing: "Musixmatch トークンが返されませんでした。",
		tokenUpdated: "Musixmatch トークンを更新しました。",
		vignette: "ビネット",
	},
};

const OPTION_LABELS: Record<OptionGroup, Record<UiLanguage, Record<string, string>>> = {
	alignment: {
		en: { center: "Center", left: "Left", natural: "Natural" },
		ko: { center: "가운데", left: "왼쪽", natural: "자연" },
		ja: { center: "中央", left: "左", natural: "自然" },
	},
	interlude: {
		en: { dots: "Dots", frame: "Frame", wave: "Wave" },
		ko: { dots: "점", frame: "프레임", wave: "웨이브" },
		ja: { dots: "ドット", frame: "フレーム", wave: "波形" },
	},
	language: {
		en: { en: "English", ja: "日本語", ko: "한국어" },
		ko: { en: "English", ja: "日本語", ko: "한국어" },
		ja: { en: "English", ja: "日本語", ko: "한국어" },
	},
	musixmatchProxyMode: {
		en: { custom: "Custom", default: "Default" },
		ko: { custom: "커스텀", default: "기본값" },
		ja: { custom: "カスタム", default: "デフォルト" },
	},
	preset: {
		en: { clean: "Clean", custom: "Custom", immersive: "Immersive", karaoke: "Karaoke" },
		ko: { clean: "깔끔함", custom: "사용자 지정", immersive: "몰입형", karaoke: "가라오케" },
		ja: { clean: "クリーン", custom: "カスタム", immersive: "没入", karaoke: "カラオケ" },
	},
	sync: {
		en: { "line-only": "Line only", "prefer-syllable": "Prefer syllables" },
		ko: { "line-only": "줄 단위만", "prefer-syllable": "음절 우선" },
		ja: { "line-only": "行のみ", "prefer-syllable": "音節優先" },
	},
};

export const translate = (key: TranslationKey, language: UiLanguage): string => TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key];

export const formatTranslation = (key: TranslationKey, values: Record<string, string>, language: UiLanguage): string => {
	let text = translate(key, language);
	for (const [name, value] of Object.entries(values)) {
		text = text.replace(`{${name}}`, value);
	}
	return text;
};

export const translatedOptionLabel = (group: OptionGroup, value: string, language: UiLanguage): string =>
	OPTION_LABELS[group][language]?.[value] ?? OPTION_LABELS[group].en[value] ?? value;
