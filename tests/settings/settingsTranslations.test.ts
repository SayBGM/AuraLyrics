import { describe, expect, test } from "vitest";
import { translate } from "../../src/settings/settingsTranslations";

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
});
