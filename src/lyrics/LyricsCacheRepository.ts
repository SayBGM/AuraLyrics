import type { LyricsCache } from "./LyricsCache";
import { restoreCachedLyrics } from "./LyricsDocumentTransforms";
import type { LyricsCacheStatus, LyricsDocument, ProviderId } from "./types";

export type LyricsCacheLookup = {
	cache: LyricsCacheStatus;
	lyrics?: LyricsDocument;
	provider?: ProviderId;
};

export class LyricsCacheRepository {
	public constructor(private readonly cache: LyricsCache) {}

	public lookup(uri: string, primaryProvider: ProviderId | undefined, refresh: boolean): LyricsCacheLookup {
		if (refresh) {
			return { cache: { status: "bypassed", primaryProvider } };
		}

		const cached = this.cache.get(uri);
		if (!cached) {
			return { cache: { status: "miss", primaryProvider } };
		}
		if (cached.provider !== primaryProvider) {
			return {
				cache: {
					status: "provider-mismatch",
					provider: cached.provider,
					primaryProvider,
				},
			};
		}

		try {
			return {
				cache: { status: "hit", provider: cached.provider, primaryProvider },
				lyrics: restoreCachedLyrics(cached.lyrics),
				provider: cached.provider,
			};
		} catch {
			this.cache.delete(uri);
			return { cache: { status: "miss", primaryProvider } };
		}
	}

	public storeCanonical(uri: string, lyrics: LyricsDocument, provider: ProviderId, primaryProvider: ProviderId | undefined): void {
		if (provider === primaryProvider) {
			this.cache.set(uri, lyrics, provider);
		}
	}

	public clear(): void {
		this.cache.clear();
	}
}
