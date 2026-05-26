import type { TrackIdentity } from "../lyrics/types";
import type { SpicetifyColorPalette } from "../runtime/spicetify";

export type AccentTarget = {
	setAccentColor(color?: string): void;
};

export type ColorExtractor = (uri: string) => Promise<SpicetifyColorPalette>;

export class TrackAccentService {
	public constructor(private readonly colorExtractor?: ColorExtractor) {}

	public async apply(track: TrackIdentity, target: AccentTarget, isCurrent: () => boolean): Promise<void> {
		if (!this.colorExtractor) {
			target.setAccentColor(undefined);
			return;
		}
		try {
			const colors = await this.colorExtractor(track.uri);
			if (!isCurrent()) {
				return;
			}
			target.setAccentColor(pickAccentColor(colors));
		} catch {
			if (isCurrent()) {
				target.setAccentColor(undefined);
			}
		}
	}
}

export const pickAccentColor = (colors: SpicetifyColorPalette): string | undefined =>
	[colors.VIBRANT_NON_ALARMING, colors.PROMINENT, colors.VIBRANT, colors.DARK_VIBRANT, colors.DESATURATED, colors.LIGHT_VIBRANT].find(isHexColor);

const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value.trim());
