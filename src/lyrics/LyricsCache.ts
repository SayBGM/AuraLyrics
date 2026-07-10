import type { LyricsDocument, ProviderId } from "./types";

type CachedLyrics = {
	lyrics: LyricsDocument;
	provider: ProviderId;
	updatedAt: number;
};

type CacheStorage = {
	get(key: string): string | null | undefined;
	set(key: string, value: string): boolean;
	delete?(key: string): boolean;
};

type LyricsCacheOptions = {
	maxEntries: number;
	maxEntryBytes: number;
	maxTotalBytes: number;
	now: () => number;
	ttlMs: number;
};

// v2: cached documents may carry per-line translatedText; v1 entries predate it and are discarded.
const CACHE_KEY = "aura-lyrics:lyrics-cache-v2";
const STALE_CACHE_KEYS = ["aura-lyrics:lyrics-cache-v1", "dynamic-popup-lyrics:lyrics-cache-v1"];
const DEFAULT_OPTIONS: LyricsCacheOptions = {
	maxEntries: 30,
	maxEntryBytes: 256 * 1024,
	maxTotalBytes: 2 * 1024 * 1024,
	now: () => Date.now(),
	ttlMs: 1000 * 60 * 60 * 24 * 14,
};

export class LyricsCache {
	private readonly values = new Map<string, CachedLyrics>();

	public constructor(
		private readonly storage?: CacheStorage,
		private readonly options: Partial<LyricsCacheOptions> = {}
	) {
		this.load();
	}

	public get(uri: string): Omit<CachedLyrics, "updatedAt"> | undefined {
		const cached = this.values.get(uri);
		if (!cached) {
			return undefined;
		}
		if (this.isExpired(cached)) {
			this.values.delete(uri);
			this.persist();
			return undefined;
		}
		return { lyrics: cached.lyrics, provider: cached.provider };
	}

	public set(uri: string, lyrics: LyricsDocument, provider: ProviderId): void {
		const entry: CachedLyrics = {
			lyrics,
			provider,
			updatedAt: this.resolvedOptions().now(),
		};
		if (this.serializedSize([uri, entry]) > this.resolvedOptions().maxEntryBytes) {
			return;
		}
		this.values.set(uri, entry);
		this.prune(false);
		this.persist();
	}

	public delete(uri: string): void {
		if (!this.values.delete(uri)) {
			return;
		}
		this.persist();
	}

	public clear(): void {
		this.values.clear();
		try {
			this.storage?.delete?.(CACHE_KEY);
			for (const staleKey of STALE_CACHE_KEYS) {
				this.storage?.delete?.(staleKey);
			}
		} catch {
			// Cache storage is best-effort; callers should not fail because cleanup failed.
		}
		this.persist();
	}

	private isExpired(cached: CachedLyrics): boolean {
		return this.resolvedOptions().now() - cached.updatedAt > this.resolvedOptions().ttlMs;
	}

	private load(): void {
		let raw: string | null | undefined;
		try {
			raw = this.storage?.get(CACHE_KEY);
		} catch {
			return;
		}
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw) as Array<[string, CachedLyrics]>;
			for (const [uri, cached] of parsed) {
				if (!this.isExpired(cached)) {
					this.values.set(uri, cached);
				}
			}
			this.prune(false);
			this.serializedValues();
		} catch {
			this.values.clear();
		}
	}

	private persist(): void {
		if (!this.storage) {
			return;
		}
		try {
			if (!this.storage.set(CACHE_KEY, this.serializedValues())) {
				throw new Error("Lyrics cache storage rejected the write.");
			}
		} catch {
			// Keep memory cache intact when persistent storage is unavailable.
			const snapshot = new Map(this.values);
			const oldest = [...this.values.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0]?.[0];
			if (oldest) this.values.delete(oldest);
			try {
				if (!this.storage.set(CACHE_KEY, this.serializedValues())) {
					throw new Error("Lyrics cache storage rejected the recovery write.");
				}
			} catch {
				this.values.clear();
				for (const entry of snapshot) this.values.set(entry[0], entry[1]);
			}
		}
	}

	private serializedSize(entry: [string, CachedLyrics]): number {
		return new TextEncoder().encode(JSON.stringify(entry)).length;
	}

	private serializedValues(): string {
		const options = this.resolvedOptions();
		const entries = [...this.values.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
		const kept: Array<[string, CachedLyrics]> = [];
		for (const entry of entries) {
			if (this.serializedSize(entry) > options.maxEntryBytes) continue;
			const candidate = JSON.stringify([...kept, entry]);
			if (new TextEncoder().encode(candidate).length > options.maxTotalBytes) continue;
			kept.push(entry);
		}
		this.values.clear();
		for (const entry of kept) this.values.set(entry[0], entry[1]);
		return JSON.stringify(kept);
	}

	private prune(shouldPersist = true): void {
		const options = this.resolvedOptions();
		for (const [uri, cached] of this.values) {
			if (this.isExpired(cached)) {
				this.values.delete(uri);
			}
		}
		const ordered = [...this.values.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
		while (ordered.length > options.maxEntries) {
			const [uri] = ordered.shift() ?? [];
			if (uri) {
				this.values.delete(uri);
			}
		}
		if (shouldPersist) {
			this.persist();
		}
	}

	private resolvedOptions(): LyricsCacheOptions {
		return { ...DEFAULT_OPTIONS, ...this.options };
	}
}
