import type { LyricsCache } from "./LyricsCache";
import { restoreCachedLyrics } from "./LyricsDocumentTransforms";
import type { LyricsCacheStatus, LyricsDocument, ProviderId } from "./types";

type LyricsCacheHitStatus = Extract<LyricsCacheStatus, { status: "hit" }>;
type LyricsCacheNonHitStatus = Exclude<LyricsCacheStatus, LyricsCacheHitStatus>;

export type LyricsCacheLookupResult =
	| {
			status: "hit";
			cache: LyricsCacheHitStatus;
			lyrics: LyricsDocument;
			provider: ProviderId;
	  }
	| {
			status: "non-hit";
			cache: LyricsCacheNonHitStatus;
	  };

export class LyricsCacheRepository {
	public constructor(private readonly cache: LyricsCache) {}

	public lookup(uri: string, primaryProvider: ProviderId | undefined, refresh: boolean): LyricsCacheLookupResult {
		if (refresh) {
			return { status: "non-hit", cache: { status: "bypassed", primaryProvider } };
		}

		const cached = this.cache.get(uri);
		if (!cached) {
			return { status: "non-hit", cache: { status: "miss", primaryProvider } };
		}
		if (cached.provider !== primaryProvider) {
			return {
				status: "non-hit",
				cache: {
					status: "provider-mismatch",
					provider: cached.provider,
					primaryProvider,
				},
			};
		}

		try {
			return {
				status: "hit",
				cache: { status: "hit", provider: cached.provider, primaryProvider },
				lyrics: restoreCachedLyrics(cached.lyrics),
				provider: cached.provider,
			};
		} catch {
			this.cache.delete(uri);
			return { status: "non-hit", cache: { status: "miss", primaryProvider } };
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
