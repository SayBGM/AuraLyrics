import { describe, expect, test } from "vitest";
import type { UiLanguage } from "../../src/settings/SettingsStore";
import { translate, translatedOptionLabel } from "../../src/settings/settingsTranslations";

describe("settingsTranslations", () => {
	test.each([
		["en" as const, "Lyrics provider proxy"],
		["ko" as const, "가사 제공자 프록시"],
		["ja" as const, "歌詞プロバイダープロキシ"],
	])("describes the shared provider proxy in %s", (language, label) => {
		expect(translate("musixmatchProxyMode", language)).toBe(label);
		expect(translate("musixmatchProxyModeCustomDescription", language)).toContain("Musixmatch desktop");
		expect(translate("musixmatchProxyModeCustomDescription", language)).toContain("LRCLIB");
		expect(translate("musixmatchProxyModeDefaultDescription", language)).toContain("LRCLIB");
	});

	test.each([
		{
			current: "Current song delay",
			defaults: "Default lyrics delay (ms)",
			language: "en",
			reset: "Use global default",
		},
		{
			current: "현재 곡 지연",
			defaults: "기본 가사 지연 (ms)",
			language: "ko",
			reset: "전역값으로 초기화",
		},
		{
			current: "現在の曲の遅延",
			defaults: "デフォルトの歌詞遅延 (ms)",
			language: "ja",
			reset: "全体のデフォルトに戻す",
		},
	] as const)("provides complete $language labels", ({ current, defaults, language, reset }) => {
		const uiLanguage: UiLanguage = language;
		expect(translate("currentTrackDelay", uiLanguage)).toBe(current);
		expect(translate("defaultLyricsDelay", uiLanguage)).toBe(defaults);
		expect(translate("resetTrackDelay", uiLanguage)).toBe(reset);
		expect(translate("currentTrackDelayHint", uiLanguage).length).toBeGreaterThan(0);
		expect(translate("noCurrentTrackDelay", uiLanguage).length).toBeGreaterThan(0);
	});

	test.each(["en", "ko", "ja"] as const)("provides localized highlight effect and motion options in %s", (language) => {
		for (const effect of ["fill", "glow-sweep", "underline", "marker", "outline-fill", "spotlight"]) {
			expect(translatedOptionLabel("highlightEffect", effect, language)).not.toBe(effect);
		}
		for (const motion of ["spring", "pulse", "bounce", "elastic", "wave", "ripple"]) {
			expect(translatedOptionLabel("highlightMotion", motion, language)).not.toBe(motion);
		}
	});
});
