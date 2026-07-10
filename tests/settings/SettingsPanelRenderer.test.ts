import { describe, expect, test, vi } from "vitest";
import type { LyricsProvider } from "../../src/lyrics/types";
import { SettingsPanelRenderer } from "../../src/settings/SettingsPanelRenderer";
import { SettingsStore } from "../../src/settings/SettingsStore";

class MemoryStorage {
	private readonly values = new Map<string, string>();
	public get(key: string) {
		return this.values.get(key) ?? null;
	}
	public set(key: string, value: string) {
		this.values.set(key, value);
		return true;
	}
}

const providers: LyricsProvider[] = ["spotify", "lrclib", "musixmatch"].map((id) => ({
	id: id as LyricsProvider["id"],
	supports: () => true,
	fetch: async () => ({ ok: false as const, reason: "no-lyrics" as const }),
}));

describe("SettingsPanelRenderer", () => {
	test("renders each section with the stable panel ids and complete control groups", () => {
		const store = new SettingsStore(new MemoryStorage());
		const renderer = new SettingsPanelRenderer(document, store, providers, {
			onClearCache: vi.fn(),
			onRefreshLyrics: vi.fn(),
			onRefreshMusixmatchToken: vi.fn(),
			onScheduleRefresh: vi.fn(),
		});

		const general = renderer.render("general");
		const lyrics = renderer.render("lyrics");
		const appearance = renderer.render("appearance");
		const motion = renderer.render("motion");
		const advanced = renderer.render("advanced");

		expect(general.id).toBe("aura-settings-panel-general");
		expect(general.querySelector('[data-control-id="language"]')).not.toBeNull();
		expect(general.querySelector('[data-control-id="preset"]')).not.toBeNull();
		expect(lyrics.querySelector('[data-control-id="lyrics-delay"]')).not.toBeNull();
		expect(lyrics.querySelector('[data-control-id="interlude-style"]')).not.toBeNull();
		expect(appearance.querySelector('[data-control-id="background-dim"]')).not.toBeNull();
		expect(motion.querySelector('[data-control-id="reduce-motion"]')).not.toBeNull();
		expect(advanced.querySelector('[data-control-id="refresh-current-lyrics"]')).not.toBeNull();
		expect(advanced.querySelector('[data-control-id="reset-settings"]')).not.toBeNull();
	});
});
