import { describe, expect, test, vi } from "vitest";
import type { LyricsProvider } from "../../src/lyrics/types";
import { NUMERIC_SETTING_SPECS } from "../../src/settings/numericSettingSpecs";
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
			getCurrentTrackLyricsDelay: vi.fn(),
			onAdjustCurrentTrackLyricsDelay: vi.fn(),
			onClearCache: vi.fn(),
			onMusixmatchTokenAccepted: vi.fn(),
			onRefreshLyrics: vi.fn(),
			onRefreshMusixmatchToken: vi.fn(),
			onScheduleRefresh: vi.fn(),
			onResetCurrentTrackLyricsDelay: vi.fn(),
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
		expect(lyrics.querySelector('[data-control-id="current-track-delay"]')?.getAttribute("aria-disabled")).toBe("true");
		expect(lyrics.querySelector('[data-control-id="interlude-style"]')).not.toBeNull();
		expect(appearance.querySelector('[data-control-id="background-dim"]')).not.toBeNull();
		expect(appearance.querySelector('[data-control-id="highlight-effect"]')).not.toBeNull();
		expect(appearance.querySelector('[data-control-id="highlight-motion"]')).not.toBeNull();
		expect(appearance.querySelector(".highlight-preview")?.getAttribute("data-effect")).toBe("fill");
		expect(appearance.querySelector(".highlight-preview")?.getAttribute("data-motion")).toBe("spring");
		expect(motion.querySelector('[data-control-id="reduce-motion"]')).not.toBeNull();
		expect(advanced.querySelector('[data-control-id="refresh-current-lyrics"]')).not.toBeNull();
		expect(advanced.querySelector('[data-control-id="reset-settings"]')).not.toBeNull();
	});

	test("uses shared numeric specs and connects controls to group descriptions", () => {
		const store = new SettingsStore(new MemoryStorage());
		const renderer = new SettingsPanelRenderer(document, store, providers, {
			getCurrentTrackLyricsDelay: vi.fn(),
			onAdjustCurrentTrackLyricsDelay: vi.fn(() => true),
			onClearCache: vi.fn(),
			onMusixmatchTokenAccepted: vi.fn(),
			onRefreshLyrics: vi.fn(async () => undefined),
			onRefreshMusixmatchToken: vi.fn(),
			onScheduleRefresh: vi.fn(),
			onResetCurrentTrackLyricsDelay: vi.fn(() => true),
		});
		const panels = [renderer.render("lyrics"), renderer.render("appearance"), renderer.render("motion")];
		const mappings = [
			["lyrics-delay", "lyricsDelayMs"],
			["context-lines", "visibleContextLines"],
			["font-scale", "fontScale"],
			["background-blur", "backgroundBlurPx"],
			["inactive-blur", "inactiveBlurPx"],
			["motion-intensity", "motionIntensity"],
			["glow-strength", "glowStrength"],
		] as const;

		for (const [controlId, settingKey] of mappings) {
			const input = panels.map((panel) => panel.querySelector<HTMLInputElement>(`[data-control-id="${controlId}"]`)).find(Boolean);
			const spec = NUMERIC_SETTING_SPECS[settingKey];
			expect(input?.min).toBe(String(spec.min));
			expect(input?.max).toBe(String(spec.max));
			expect(input?.step).toBe(String(spec.step));
			expect(input?.closest(".setting-row")?.querySelector("output")?.textContent).toMatch(/%|px|ms|lines/);
			expect(input?.getAttribute("aria-describedby")).toContain("aura-settings-group-");
		}
	});

	test("disables dependent controls with an adjacent reason while keeping glow available", () => {
		const store = new SettingsStore(new MemoryStorage());
		store.update({ syncPreference: "line-only", showInterludes: false, motionEnabled: false, reduceMotion: true });
		const renderer = new SettingsPanelRenderer(document, store, providers, {
			getCurrentTrackLyricsDelay: vi.fn(),
			onAdjustCurrentTrackLyricsDelay: vi.fn(() => true),
			onClearCache: vi.fn(),
			onMusixmatchTokenAccepted: vi.fn(),
			onRefreshLyrics: vi.fn(async () => undefined),
			onRefreshMusixmatchToken: vi.fn(),
			onScheduleRefresh: vi.fn(),
			onResetCurrentTrackLyricsDelay: vi.fn(() => true),
		});
		const lyrics = renderer.render("lyrics");
		const motion = renderer.render("motion");
		const pseudo = lyrics.querySelector<HTMLInputElement>('[data-control-id="pseudo-karaoke"]');
		const interlude = lyrics.querySelector<HTMLSelectElement>('[data-control-id="interlude-style"]');
		const intensity = motion.querySelector<HTMLInputElement>('[data-control-id="motion-intensity"]');
		const glow = motion.querySelector<HTMLInputElement>('[data-control-id="glow-strength"]');

		expect(pseudo?.disabled).toBe(true);
		expect(pseudo?.closest(".setting-row")?.querySelector(".disabled-reason")?.textContent).toContain("Prefer syllables");
		expect(interlude?.disabled).toBe(true);
		expect(interlude?.value).toBe("dots");
		expect(intensity?.disabled).toBe(true);
		expect(glow?.disabled).toBe(false);
	});

	test("persists independent highlight choices and refreshes the live preview", () => {
		const store = new SettingsStore(new MemoryStorage());
		const onScheduleRefresh = vi.fn();
		const renderer = new SettingsPanelRenderer(document, store, providers, {
			getCurrentTrackLyricsDelay: vi.fn(),
			onAdjustCurrentTrackLyricsDelay: vi.fn(() => true),
			onClearCache: vi.fn(),
			onMusixmatchTokenAccepted: vi.fn(),
			onRefreshLyrics: vi.fn(async () => undefined),
			onRefreshMusixmatchToken: vi.fn(),
			onScheduleRefresh,
			onResetCurrentTrackLyricsDelay: vi.fn(() => true),
		});
		const appearance = renderer.render("appearance");
		const effect = appearance.querySelector<HTMLSelectElement>('[data-control-id="highlight-effect"]');
		const motion = appearance.querySelector<HTMLSelectElement>('[data-control-id="highlight-motion"]');
		if (!effect || !motion) throw new Error("Missing highlight controls.");

		effect.value = "marker";
		effect.dispatchEvent(new Event("change"));
		motion.value = "wave";
		motion.dispatchEvent(new Event("change"));

		expect(store.get()).toMatchObject({ highlightEffect: "marker", highlightMotion: "wave", preset: "immersive" });
		expect(onScheduleRefresh).toHaveBeenCalledTimes(2);
		const refreshed = renderer.render("appearance");
		expect(refreshed.querySelector(".highlight-preview")?.getAttribute("data-effect")).toBe("marker");
		expect(refreshed.querySelector(".highlight-preview")?.getAttribute("data-motion")).toBe("wave");
	});
});
