import type { UiLanguage } from "./SettingsStore";

export type TranslationKey =
	| "advanced"
	| "alignment"
	| "animations"
	| "appearance"
	| "background"
	| "blur"
	| "clearCache"
	| "contextLines"
	| "currentTrackDelay"
	| "currentTrackDelayAdjust"
	| "currentTrackDelayDefaultSource"
	| "currentTrackDelayHint"
	| "currentTrackDelayOverrideSource"
	| "debugMode"
	| "defaultLyricsDelay"
	| "dim"
	| "fontScale"
	| "general"
	| "generateMusixmatchToken"
	| "glow"
	| "inactiveBlur"
	| "intensity"
	| "interludeStyle"
	| "language"
	| "lyrics"
	| "motion"
	| "moveDown"
	| "moveUp"
	| "musixmatchProxyBaseUrl"
	| "musixmatchProxyMode"
	| "musixmatchProxyModeCustomDescription"
	| "musixmatchProxyModeDefaultDescription"
	| "musixmatchToken"
	| "noCurrentTrackDelay"
	| "preset"
	| "providerEnabled"
	| "providerOrder"
	| "providers"
	| "pseudoKaraoke"
	| "reduceMotion"
	| "refreshCurrentLyrics"
	| "requestingToken"
	| "resetSettings"
	| "resetTrackDelay"
	| "saturation"
	| "showInterludes"
	| "showTranslation"
	| "settingsNavigation"
	| "settingsTitle"
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
		appearance: "Appearance",
		background: "Background",
		blur: "Blur",
		clearCache: "Clear cache",
		contextLines: "Context lines",
		currentTrackDelay: "Current song delay",
		currentTrackDelayAdjust: "Adjust current song lyrics by {amount} ms",
		currentTrackDelayDefaultSource: "Global default",
		currentTrackDelayHint: "− makes lyrics earlier; + makes them later.",
		currentTrackDelayOverrideSource: "Song-specific setting",
		debugMode: "Debug mode",
		defaultLyricsDelay: "Default lyrics delay (ms)",
		dim: "Dim",
		fontScale: "Font scale",
		general: "General",
		generateMusixmatchToken: "Generate Musixmatch token",
		glow: "Glow",
		inactiveBlur: "Inactive blur",
		intensity: "Intensity",
		interludeStyle: "Interlude style",
		language: "Language",
		lyrics: "Lyrics",
		motion: "Motion",
		moveDown: "Move {provider} down",
		moveUp: "Move {provider} up",
		musixmatchProxyBaseUrl: "Proxy server URL",
		musixmatchProxyMode: "Lyrics provider proxy",
		musixmatchProxyModeCustomDescription:
			"Route Musixmatch desktop and LRCLIB requests through a proxy that takes the target URL as a query parameter, e.g. https://your-proxy.example.com/?url=",
		musixmatchProxyModeDefaultDescription: "Request directly from the official Musixmatch and LRCLIB servers.",
		musixmatchToken: "Musixmatch token",
		noCurrentTrackDelay: "Play a Spotify song to adjust its lyrics delay.",
		preset: "Preset",
		providerEnabled: "{provider} enabled",
		providerOrder: "Provider order: {order}",
		providers: "Providers",
		pseudoKaraoke: "Synthesized karaoke",
		reduceMotion: "Reduce motion",
		refreshCurrentLyrics: "Refresh current lyrics",
		requestingToken: "Requesting Musixmatch token...",
		resetSettings: "Reset settings",
		resetTrackDelay: "Use global default",
		saturation: "Saturation",
		showInterludes: "Show interludes",
		showTranslation: "Show translation",
		settingsNavigation: "Settings navigation",
		settingsTitle: "AuraLyrics Settings",
		sync: "Sync",
		tokenMissing: "Musixmatch token was not returned.",
		tokenUpdated: "Musixmatch token updated.",
		vignette: "Vignette",
	},
	ko: {
		advanced: "고급",
		alignment: "정렬",
		animations: "애니메이션",
		appearance: "화면",
		background: "배경",
		blur: "블러",
		clearCache: "캐시 지우기",
		contextLines: "문맥 줄 수",
		currentTrackDelay: "현재 곡 지연",
		currentTrackDelayAdjust: "현재 곡 가사를 {amount}ms 조정",
		currentTrackDelayDefaultSource: "전역 기본값",
		currentTrackDelayHint: "−는 가사를 빠르게, +는 늦게 표시합니다.",
		currentTrackDelayOverrideSource: "곡별 설정",
		debugMode: "디버그 모드",
		defaultLyricsDelay: "기본 가사 지연 (ms)",
		dim: "어둡게",
		fontScale: "글자 크기",
		general: "일반",
		generateMusixmatchToken: "Musixmatch 토큰 생성",
		glow: "글로우",
		inactiveBlur: "비활성 블러",
		intensity: "강도",
		interludeStyle: "인터루드 스타일",
		language: "언어",
		lyrics: "가사",
		motion: "모션",
		moveDown: "{provider} 아래로 이동",
		moveUp: "{provider} 위로 이동",
		musixmatchProxyBaseUrl: "프록시 서버 주소",
		musixmatchProxyMode: "가사 제공자 프록시",
		musixmatchProxyModeCustomDescription:
			"타겟 URL을 쿼리 파라미터로 받는 프록시를 통해 Musixmatch desktop 및 LRCLIB 요청을 전송합니다. 예: https://your-proxy.example.com/?url=",
		musixmatchProxyModeDefaultDescription: "Musixmatch 및 LRCLIB 공식 서버로 직접 요청합니다.",
		musixmatchToken: "Musixmatch 토큰",
		noCurrentTrackDelay: "Spotify 곡을 재생하면 곡별 가사 지연을 조정할 수 있습니다.",
		preset: "프리셋",
		providerEnabled: "{provider} 사용",
		providerOrder: "제공자 순서: {order}",
		pseudoKaraoke: "노래방 자동 합성",
		providers: "제공자",
		reduceMotion: "모션 줄이기",
		refreshCurrentLyrics: "현재 가사 새로고침",
		requestingToken: "Musixmatch 토큰 요청 중...",
		resetSettings: "설정 초기화",
		resetTrackDelay: "전역값으로 초기화",
		saturation: "채도",
		showInterludes: "인터루드 표시",
		showTranslation: "번역 표시",
		settingsNavigation: "설정 탐색",
		settingsTitle: "AuraLyrics 설정",
		sync: "싱크",
		tokenMissing: "Musixmatch 토큰이 반환되지 않았습니다.",
		tokenUpdated: "Musixmatch 토큰이 업데이트되었습니다.",
		vignette: "비네트",
	},
	ja: {
		advanced: "詳細",
		alignment: "配置",
		animations: "アニメーション",
		appearance: "表示",
		background: "背景",
		blur: "ぼかし",
		clearCache: "キャッシュを削除",
		contextLines: "前後の行数",
		currentTrackDelay: "現在の曲の遅延",
		currentTrackDelayAdjust: "現在の曲の歌詞を {amount}ms 調整",
		currentTrackDelayDefaultSource: "全体のデフォルト",
		currentTrackDelayHint: "−で歌詞を早く、+で遅く表示します。",
		currentTrackDelayOverrideSource: "曲別設定",
		debugMode: "デバッグモード",
		defaultLyricsDelay: "デフォルトの歌詞遅延 (ms)",
		dim: "暗さ",
		fontScale: "文字サイズ",
		general: "一般",
		generateMusixmatchToken: "Musixmatch トークンを生成",
		glow: "グロー",
		inactiveBlur: "非アクティブぼかし",
		intensity: "強度",
		interludeStyle: "インタールードスタイル",
		language: "言語",
		lyrics: "歌詞",
		motion: "モーション",
		moveDown: "{provider} を下へ移動",
		moveUp: "{provider} を上へ移動",
		musixmatchProxyBaseUrl: "プロキシサーバーURL",
		musixmatchProxyMode: "歌詞プロバイダープロキシ",
		musixmatchProxyModeCustomDescription:
			"ターゲットURLをクエリパラメータで受け取るプロキシ経由でMusixmatch desktopとLRCLIBのリクエストを送信します。例: https://your-proxy.example.com/?url=",
		musixmatchProxyModeDefaultDescription: "MusixmatchとLRCLIBの公式サーバーに直接リクエストします。",
		musixmatchToken: "Musixmatch トークン",
		noCurrentTrackDelay: "Spotifyの曲を再生すると、曲別の歌詞遅延を調整できます。",
		preset: "プリセット",
		providerEnabled: "{provider} を有効化",
		providerOrder: "プロバイダー順: {order}",
		pseudoKaraoke: "カラオケ自動合成",
		providers: "プロバイダー",
		reduceMotion: "モーションを減らす",
		refreshCurrentLyrics: "現在の歌詞を更新",
		requestingToken: "Musixmatch トークンをリクエスト中...",
		resetSettings: "設定をリセット",
		resetTrackDelay: "全体のデフォルトに戻す",
		saturation: "彩度",
		showInterludes: "インタールード表示",
		showTranslation: "翻訳を表示",
		settingsNavigation: "設定ナビゲーション",
		settingsTitle: "AuraLyrics 設定",
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
