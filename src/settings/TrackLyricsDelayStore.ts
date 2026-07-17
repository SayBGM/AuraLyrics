import { EventEmitter } from "../shared/EventEmitter";

export type TrackLyricsDelayStorage = {
	get(key: string): string | null | undefined;
	set(key: string, value: string): boolean;
};

type TrackLyricsDelayEntry = {
	delayMs: number;
	updatedAt: number;
};

type PersistedTrackLyricsDelayEntry = TrackLyricsDelayEntry & {
	uri: string;
};

type TrackLyricsDelayStoreOptions = {
	maxEntries: number;
	now: () => number;
};

export type TrackLyricsDelayUpdateResult = {
	delayMs: number;
	persisted: boolean;
};

const STORAGE_KEY = "aura-lyrics:track-delays-v1";
const DEFAULT_OPTIONS: TrackLyricsDelayStoreOptions = {
	maxEntries: 500,
	now: () => Date.now(),
};
const MIN_DELAY_MS = -5000;
const MAX_DELAY_MS = 5000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeDelayMs = (value: number): number => {
	const finiteValue = Number.isFinite(value) ? value : 0;
	return Math.round(Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, finiteValue)));
};

export class TrackLyricsDelayStore {
	private failurePending = false;
	private lastUpdatedAt = 0;
	private readonly options: TrackLyricsDelayStoreOptions;
	private readonly values = new Map<string, TrackLyricsDelayEntry>();
	public readonly persistenceFailed = new EventEmitter<void>();

	public constructor(
		private readonly storage: TrackLyricsDelayStorage,
		options: Partial<TrackLyricsDelayStoreOptions> = {}
	) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
		this.load();
	}

	public get(uri: string): number | undefined {
		return this.values.get(uri)?.delayMs;
	}

	public resolve(uri: string | undefined, defaultDelayMs: number): number {
		return (uri ? this.get(uri) : undefined) ?? defaultDelayMs;
	}

	public set(uri: string, delayMs: number): TrackLyricsDelayUpdateResult {
		const normalized = normalizeDelayMs(delayMs);
		const updatedAt = Math.max(this.options.now(), this.lastUpdatedAt + 1);
		this.lastUpdatedAt = updatedAt;
		this.values.set(uri, { delayMs: normalized, updatedAt });
		this.prune();
		return { delayMs: normalized, persisted: this.persist() };
	}

	public delete(uri: string): boolean {
		if (!this.values.delete(uri)) {
			return true;
		}
		return this.persist();
	}

	public consumePersistenceFailure(): boolean {
		const pending = this.failurePending;
		this.failurePending = false;
		return pending;
	}

	private load(): void {
		let raw: string | null | undefined;
		try {
			raw = this.storage.get(STORAGE_KEY);
		} catch {
			this.reportFailure();
			return;
		}
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw) as unknown;
			if (!Array.isArray(parsed)) {
				return;
			}
			for (const candidate of parsed) {
				if (!isRecord(candidate)) {
					continue;
				}
				const { delayMs, updatedAt, uri } = candidate;
				if (
					typeof uri !== "string" ||
					uri.length === 0 ||
					typeof delayMs !== "number" ||
					!Number.isFinite(delayMs) ||
					typeof updatedAt !== "number" ||
					!Number.isFinite(updatedAt)
				) {
					continue;
				}
				const existing = this.values.get(uri);
				if (!existing || updatedAt >= existing.updatedAt) {
					this.values.set(uri, { delayMs: normalizeDelayMs(delayMs), updatedAt });
				}
				this.lastUpdatedAt = Math.max(this.lastUpdatedAt, updatedAt);
			}
			this.prune();
		} catch {
			this.values.clear();
		}
	}

	private persist(): boolean {
		try {
			if (this.storage.set(STORAGE_KEY, JSON.stringify(this.serializedValues()))) {
				return true;
			}
		} catch {
			// Report through the shared persistence-failure event below.
		}
		this.reportFailure();
		return false;
	}

	private prune(): void {
		const kept = [...this.values.entries()].sort((first, second) => second[1].updatedAt - first[1].updatedAt).slice(0, this.options.maxEntries);
		this.values.clear();
		for (const entry of kept) {
			this.values.set(entry[0], entry[1]);
		}
	}

	private serializedValues(): PersistedTrackLyricsDelayEntry[] {
		return [...this.values.entries()].sort((first, second) => second[1].updatedAt - first[1].updatedAt).map(([uri, entry]) => ({ uri, ...entry }));
	}

	private reportFailure(): void {
		this.failurePending = true;
		this.persistenceFailed.emit(undefined);
	}
}
