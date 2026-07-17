import type { ProviderId } from "../domain/types";

const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
	spotify: "Spotify",
	lrclib: "LRCLIB",
	musixmatch: "Musixmatch",
};

export const providerDisplayName = (provider: string): string => PROVIDER_DISPLAY_NAMES[provider as ProviderId] ?? provider;
