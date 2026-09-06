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
	persistDebounceMs: number;
	/** Schedules a debounced persist. Defaults to the global `setTimeout`; tests may inject a synchronous stand-in. */
	schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
};

// v2: cached documents may carry per-line translatedText; v1 entries predate it and are discarded.
const CACHE_KEY = "aura-lyrics:lyrics-cache-v2";
const STALE_CACHE_KEYS = ["aura-lyrics:lyrics-cache-v1", "dynamic-popup-lyrics:lyrics-cache-v1"];
const textEncoder = new TextEncoder();
const DEFAULT_OPTIONS: LyricsCacheOptions = {
	maxEntries: 30,
	maxEntryBytes: 256 * 1024,
	maxTotalBytes: 2 * 1024 * 1024,
	now: () => Date.now(),
	ttlMs: 1000 * 60 * 60 * 24 * 14,
	persistDebounceMs: 500,
	schedule: (callback, delayMs) => setTimeout(callback, delayMs),
};

export class LyricsCache {
	private readonly values = new Map<string, CachedLyrics>();
	private readonly options: LyricsCacheOptions;
	private pendingPersistHandle?: ReturnType<typeof setTimeout>;

	public constructor(
		private readonly storage?: CacheStorage,
		options: Partial<LyricsCacheOptions> = {}
	) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
		this.load();
	}

	public get(uri: string): Omit<CachedLyrics, "updatedAt"> | undefined {
		const cached = this.values.get(uri);
		if (!cached) {
			return undefined;
		}
		if (this.isExpired(cached)) {
			this.values.delete(uri);
			this.schedulePersist();
			return undefined;
		}
		return { lyrics: cached.lyrics, provider: cached.provider };
	}

	public set(uri: string, lyrics: LyricsDocument, provider: ProviderId): void {
		const entry: CachedLyrics = {
			lyrics,
			provider,
			updatedAt: this.options.now(),
		};
		if (this.serializedSize([uri, entry]) > this.options.maxEntryBytes) {
			return;
		}
		this.values.set(uri, entry);
		this.prune(false);
		this.schedulePersist();
	}

	public delete(uri: string): void {
		if (!this.values.delete(uri)) {
			return;
		}
		this.schedulePersist();
	}

	public clear(): void {
		this.values.clear();
		this.cancelPendingPersist();
		try {
			this.storage?.delete?.(CACHE_KEY);
			for (const staleKey of STALE_CACHE_KEYS) {
				this.storage?.delete?.(staleKey);
			}
		} catch {
			// Cache storage is best-effort; callers should not fail because cleanup failed.
		}
		this.persistNow();
	}

	/** Flushes a pending debounced persist immediately (e.g. on `beforeunload`). No-op if nothing is pending. */
	public flush(): void {
		if (this.pendingPersistHandle === undefined) {
			return;
		}
		this.cancelPendingPersist();
		this.persistNow();
	}

	private isExpired(cached: CachedLyrics): boolean {
		return this.options.now() - cached.updatedAt > this.options.ttlMs;
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
			this.evictToBudget();
		} catch {
			this.values.clear();
		}
	}

	private schedulePersist(): void {
		this.cancelPendingPersist();
		this.pendingPersistHandle = this.options.schedule(() => {
			this.pendingPersistHandle = undefined;
			this.persistNow();
		}, this.options.persistDebounceMs);
	}

	private cancelPendingPersist(): void {
		if (this.pendingPersistHandle !== undefined) {
			clearTimeout(this.pendingPersistHandle);
			this.pendingPersistHandle = undefined;
		}
	}

	private persistNow(): void {
		if (!this.storage) {
			return;
		}
		this.evictToBudget();
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
		return textEncoder.encode(JSON.stringify(entry)).length;
	}

	/** Pure serialization of the current (already budget-fitted) in-memory entries. */
	private serializedValues(): string {
		return JSON.stringify([...this.values.entries()]);
	}

	/** Trims `this.values` in place so its serialized form fits `maxEntryBytes`/`maxTotalBytes`. */
	private evictToBudget(): void {
		const options = this.options;
		const entries = [...this.values.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
		const kept: Array<[string, CachedLyrics]> = [];
		// Account for the JSON array's surrounding brackets and the comma separators between entries.
		let totalBytes = 2;
		for (const entry of entries) {
			const size = this.serializedSize(entry);
			if (size > options.maxEntryBytes) continue;
			const additional = size + (kept.length > 0 ? 1 : 0);
			if (totalBytes + additional > options.maxTotalBytes) continue;
			kept.push(entry);
			totalBytes += additional;
		}
		this.values.clear();
		for (const entry of kept) this.values.set(entry[0], entry[1]);
	}

	private prune(shouldPersist = true): void {
		const options = this.options;
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
			this.schedulePersist();
		}
	}
}
