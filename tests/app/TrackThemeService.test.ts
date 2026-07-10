import { describe, expect, test, vi } from "vitest";
import {
	buildTrackTheme,
	compositeThemeSurface,
	FALLBACK_TRACK_THEME,
	pickAccentColor,
	TrackThemeService,
	themeContrastRatios,
	themeMeetsContrast,
} from "../../src/app/TrackThemeService";
import type { TrackIdentity } from "../../src/lyrics/types";
import type { SpicetifyColorPalette } from "../../src/runtime/spicetify";

const palette = (overrides: Partial<SpicetifyColorPalette> = {}): SpicetifyColorPalette => ({
	DARK_VIBRANT: "#17202a",
	DESATURATED: "#778899",
	LIGHT_VIBRANT: "#f5e6cc",
	PROMINENT: "#101820",
	VIBRANT: "#ff6b35",
	VIBRANT_NON_ALARMING: "#2d9cdb",
	...overrides,
});

const track: TrackIdentity = {
	uri: "spotify:track:theme",
	title: "Theme",
	artist: "Aura",
	album: "Palette",
	durationMs: 180_000,
	isLocal: false,
};

describe("TrackThemeService", () => {
	test("preserves accent priority while preferring a valid PROMINENT color as the representative background", () => {
		const colors = palette({
			PROMINENT: "#112233",
			VIBRANT_NON_ALARMING: "#abcdef",
		});

		expect(pickAccentColor(colors)).toBe("#abcdef");
		expect(buildTrackTheme(colors)).toMatchObject({
			accent: "#abcdef",
			accentRgb: "171, 205, 239",
			background: "#112233",
			surfaceTone: "dark",
			foreground: "#ffffff",
			foregroundRgb: "255, 255, 255",
			scrimRgb: "0, 0, 0",
		});
	});

	test("uses dark foreground and a light scrim for a light representative surface", () => {
		const theme = buildTrackTheme(palette({ PROMINENT: "#f3e8cf" }));

		expect(theme).toMatchObject({
			background: "#f3e8cf",
			surfaceTone: "light",
			foreground: "#090b0f",
			foregroundRgb: "9, 11, 15",
			scrimRgb: "255, 255, 255",
		});
		expect(themeContrastRatios(theme).active).toBeGreaterThanOrEqual(4.5);
		expect(themeContrastRatios(theme).secondary).toBeGreaterThanOrEqual(3);
	});

	test("protects dark content against a worst-case black cover pixel on a light theme", () => {
		const theme = buildTrackTheme(palette({ PROMINENT: "#f3e8cf" }));
		const ratios = themeContrastRatios(theme, "#000000");

		expect(theme.scrimOpacity).toBeGreaterThan(0);
		expect(ratios.active).toBeGreaterThanOrEqual(4.5);
		expect(ratios.secondary).toBeGreaterThanOrEqual(3);
	});

	test("protects light content against a worst-case white cover pixel on a dark theme", () => {
		const theme = buildTrackTheme(palette({ PROMINENT: "#101820" }));
		const ratios = themeContrastRatios(theme, "#ffffff");

		expect(theme.scrimOpacity).toBeGreaterThan(0);
		expect(ratios.active).toBeGreaterThanOrEqual(4.5);
		expect(ratios.secondary).toBeGreaterThanOrEqual(3);
	});

	test("adds enough directional scrim to keep mid-tone active and secondary content readable", () => {
		const theme = buildTrackTheme(palette({ PROMINENT: "#777777" }));
		const ratios = themeContrastRatios(theme);

		expect(theme.scrimOpacity).toBeGreaterThan(0);
		expect(ratios.active).toBeGreaterThanOrEqual(4.5);
		expect(ratios.secondary).toBeGreaterThanOrEqual(3);
		expect(themeMeetsContrast(theme)).toBe(true);
	});

	test("falls back to the current dark surface and light text when every palette entry is invalid", () => {
		const theme = buildTrackTheme(
			palette({
				DARK_VIBRANT: "none",
				DESATURATED: "rgb(1, 2, 3)",
				LIGHT_VIBRANT: "#12345",
				PROMINENT: "",
				VIBRANT: "blue",
				VIBRANT_NON_ALARMING: "transparent",
			})
		);

		expect(theme).toEqual(FALLBACK_TRACK_THEME);
		expect(theme.background).toBe("#050505");
		expect(theme.foreground).toBe("#ffffff");
	});

	test("applies the fallback theme when extraction fails", async () => {
		const target = { applyTheme: vi.fn() };
		const service = new TrackThemeService(async () => {
			throw new Error("extractor unavailable");
		});

		await service.apply(track, target, () => true);

		expect(target.applyTheme).toHaveBeenCalledWith(FALLBACK_TRACK_THEME);
	});

	test("applies the fallback theme when no color extractor is available", async () => {
		const target = { applyTheme: vi.fn() };

		await new TrackThemeService().apply(track, target, () => true);

		expect(target.applyTheme).toHaveBeenCalledWith(FALLBACK_TRACK_THEME);
	});

	test("does not apply a stale extraction result", async () => {
		let resolvePalette!: (value: SpicetifyColorPalette) => void;
		const extracted = new Promise<SpicetifyColorPalette>((resolve) => {
			resolvePalette = resolve;
		});
		let current = true;
		const target = { applyTheme: vi.fn() };
		const service = new TrackThemeService(() => extracted);

		const applying = service.apply(track, target, () => current);
		current = false;
		resolvePalette(palette());
		await applying;

		expect(target.applyTheme).not.toHaveBeenCalled();
	});

	test("rejects themes that miss either the 4.5:1 active or 3:1 secondary boundary", () => {
		const safeTheme = buildTrackTheme(palette({ PROMINENT: "#101820" }));

		expect(
			themeMeetsContrast({
				...safeTheme,
				foreground: "#555b65",
				foregroundRgb: "85, 91, 101",
			})
		).toBe(false);
		expect(
			themeMeetsContrast({
				...safeTheme,
				mutedForeground: "#343a43",
				mutedRgb: "52, 58, 67",
			})
		).toBe(false);
	});

	test("rejects RGB channels that are not exact decimal integers", () => {
		const theme = buildTrackTheme(palette());

		for (const scrimRgb of ["255oops, 0, 0", "12.5, 0, 0", "0x10, 0, 0", "01e2, 0, 0", "256, 0, 0", "-1, 0, 0"]) {
			expect(() => compositeThemeSurface({ ...theme, scrimRgb })).toThrow(`Invalid RGB value: ${scrimRgb}`);
		}
	});
});
