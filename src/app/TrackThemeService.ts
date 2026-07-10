import type { TrackIdentity } from "../lyrics/types";
import type { SpicetifyColorPalette } from "../runtime/spicetify";

export type SurfaceTone = "dark" | "light";

export type TrackTheme = {
	accent: string;
	accentRgb: string;
	background: string;
	surfaceTone: SurfaceTone;
	foreground: string;
	foregroundRgb: string;
	mutedForeground: string;
	mutedRgb: string;
	glowRgb: string;
	scrimRgb: string;
	scrimOpacity: number;
};

export type ThemeTarget = {
	applyTheme(theme: TrackTheme): void;
};

export type ColorExtractor = (uri: string) => Promise<SpicetifyColorPalette>;

type Rgb = {
	red: number;
	green: number;
	blue: number;
};

const LIGHT_FOREGROUND = "#ffffff";
const DARK_FOREGROUND = "#090b0f";
const DARK_SCRIM = "#000000";
const LIGHT_SCRIM = "#ffffff";
const FALLBACK_BACKGROUND = "#050505";
const FALLBACK_ACCENT = "#f8f8f4";
const ACTIVE_CONTRAST_TARGET = 4.5;
const SECONDARY_CONTRAST_TARGET = 3;

export class TrackThemeService {
	public constructor(private readonly colorExtractor?: ColorExtractor) {}

	public async apply(track: TrackIdentity, target: ThemeTarget, isCurrent: () => boolean): Promise<void> {
		if (!this.colorExtractor) {
			if (isCurrent()) {
				target.applyTheme(FALLBACK_TRACK_THEME);
			}
			return;
		}
		try {
			const colors = await this.colorExtractor(track.uri);
			if (!isCurrent()) {
				return;
			}
			target.applyTheme(buildTrackTheme(colors));
		} catch {
			if (isCurrent()) {
				target.applyTheme(FALLBACK_TRACK_THEME);
			}
		}
	}
}

export const pickAccentColor = (colors: SpicetifyColorPalette): string | undefined =>
	[colors.VIBRANT_NON_ALARMING, colors.PROMINENT, colors.VIBRANT, colors.DARK_VIBRANT, colors.DESATURATED, colors.LIGHT_VIBRANT]
		.map(normalizeHexColor)
		.find((color): color is string => color !== undefined);

export const buildTrackTheme = (colors: SpicetifyColorPalette): TrackTheme => {
	const accent = pickAccentColor(colors);
	if (!accent) {
		return FALLBACK_TRACK_THEME;
	}
	const background = normalizeHexColor(colors.PROMINENT) ?? accent;
	return createTheme(background, accent, 0);
};

export const compositeThemeSurface = (theme: TrackTheme, coverPixel = theme.background): string =>
	rgbToHex(blendRgb(requireRgb(coverPixel), parseRgbString(theme.scrimRgb), theme.scrimOpacity));

export const themeContrastRatios = (theme: TrackTheme, coverPixel = theme.background): { active: number; secondary: number } => {
	const surface = compositeThemeSurface(theme, coverPixel);
	return {
		active: contrastRatio(theme.foreground, surface),
		secondary: contrastRatio(theme.mutedForeground, surface),
	};
};

export const themeMeetsContrast = (theme: TrackTheme): boolean => {
	const ratios = themeContrastRatios(theme);
	return ratios.active >= ACTIVE_CONTRAST_TARGET && ratios.secondary >= SECONDARY_CONTRAST_TARGET;
};

export const contrastRatio = (first: string, second: string): number => {
	const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
	const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
	return (lighter + 0.05) / (darker + 0.05);
};

export const relativeLuminance = (color: string): number => {
	const { red, green, blue } = requireRgb(color);
	const [r, g, b] = [red, green, blue].map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const createTheme = (background: string, accent: string, minimumScrimOpacity: number): TrackTheme => {
	const lightContrast = contrastRatio(LIGHT_FOREGROUND, background);
	const darkContrast = contrastRatio(DARK_FOREGROUND, background);
	const surfaceTone: SurfaceTone = lightContrast >= darkContrast ? "dark" : "light";
	const foreground = surfaceTone === "dark" ? LIGHT_FOREGROUND : DARK_FOREGROUND;
	const scrim = surfaceTone === "dark" ? DARK_SCRIM : LIGHT_SCRIM;
	const worstCaseCoverPixel = surfaceTone === "dark" ? LIGHT_SCRIM : DARK_SCRIM;
	const scrimOpacity = findScrimOpacity(worstCaseCoverPixel, foreground, scrim, minimumScrimOpacity);
	const worstCaseSurface = rgbToHex(blendRgb(requireRgb(worstCaseCoverPixel), requireRgb(scrim), scrimOpacity));
	const mutedForeground = mutedColorForSurface(worstCaseSurface, foreground);
	return {
		accent,
		accentRgb: rgbString(requireRgb(accent)),
		background,
		surfaceTone,
		foreground,
		foregroundRgb: rgbString(requireRgb(foreground)),
		mutedForeground,
		mutedRgb: rgbString(requireRgb(mutedForeground)),
		glowRgb: rgbString(requireRgb(accent)),
		scrimRgb: rgbString(requireRgb(scrim)),
		scrimOpacity,
	};
};

const findScrimOpacity = (background: string, foreground: string, scrim: string, minimum: number): number => {
	const backgroundRgb = requireRgb(background);
	const scrimRgb = requireRgb(scrim);
	for (let step = Math.ceil(minimum * 100); step <= 100; step += 1) {
		const opacity = step / 100;
		const surface = rgbToHex(blendRgb(backgroundRgb, scrimRgb, opacity));
		if (contrastRatio(foreground, surface) >= ACTIVE_CONTRAST_TARGET) {
			return opacity;
		}
	}
	return 1;
};

const mutedColorForSurface = (surface: string, foreground: string): string => {
	const surfaceRgb = requireRgb(surface);
	const foregroundRgb = requireRgb(foreground);
	for (let step = 1; step <= 100; step += 1) {
		const candidate = rgbToHex(blendRgb(surfaceRgb, foregroundRgb, step / 100));
		if (contrastRatio(candidate, surface) >= SECONDARY_CONTRAST_TARGET) {
			return candidate;
		}
	}
	return foreground;
};

const normalizeHexColor = (value: unknown): string | undefined => {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.trim().replace(/^#/, "");
	if (!/^[\da-f]{6}$/i.test(normalized)) {
		return undefined;
	}
	return `#${normalized.toLowerCase()}`;
};

const hexToRgb = (hex: string): Rgb | undefined => {
	const normalized = normalizeHexColor(hex);
	if (!normalized) {
		return undefined;
	}
	return {
		red: Number.parseInt(normalized.slice(1, 3), 16),
		green: Number.parseInt(normalized.slice(3, 5), 16),
		blue: Number.parseInt(normalized.slice(5, 7), 16),
	};
};

const parseRgbString = (value: string): Rgb => {
	const rawChannels = value.split(",").map((channel) => channel.trim());
	if (rawChannels.length !== 3 || rawChannels.some((channel) => !/^(?:0|[1-9]\d{0,2})$/.test(channel))) {
		throw new Error(`Invalid RGB value: ${value}`);
	}
	const channels = rawChannels.map(Number);
	if (channels.some((channel) => channel > 255)) {
		throw new Error(`Invalid RGB value: ${value}`);
	}
	return { red: channels[0], green: channels[1], blue: channels[2] };
};

const requireRgb = (hex: string): Rgb => {
	const rgb = hexToRgb(hex);
	if (!rgb) {
		throw new Error(`Invalid hex color: ${hex}`);
	}
	return rgb;
};

const blendRgb = (background: Rgb, overlay: Rgb, opacity: number): Rgb => ({
	red: Math.round(background.red * (1 - opacity) + overlay.red * opacity),
	green: Math.round(background.green * (1 - opacity) + overlay.green * opacity),
	blue: Math.round(background.blue * (1 - opacity) + overlay.blue * opacity),
});

const rgbString = ({ red, green, blue }: Rgb): string => `${red}, ${green}, ${blue}`;

const rgbToHex = ({ red, green, blue }: Rgb): string =>
	`#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

export const FALLBACK_TRACK_THEME: TrackTheme = createTheme(FALLBACK_BACKGROUND, FALLBACK_ACCENT, 0.62);
