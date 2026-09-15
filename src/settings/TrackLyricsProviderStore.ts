import type { ProviderId } from "../domain/types";
import { EventEmitter } from "../shared/EventEmitter";

export type TrackLyricsProviderStorage = { get(key: string): string | null | undefined; set(key: string, value: string): boolean };
type Entry = { provider: ProviderId; updatedAt: number };
const KEY = "aura-lyrics:track-providers-v1";
const MAX_ENTRIES = 500;

export class TrackLyricsProviderStore {
	private readonly values = new Map<string, Entry>();
	private failurePending = false;
	public readonly persistenceFailed = new EventEmitter<void>();
	public constructor(
		private readonly storage: TrackLyricsProviderStorage,
		private readonly now = () => Date.now()
	) {
		this.load();
	}
	public get(uri: string): ProviderId | undefined {
		return this.values.get(uri)?.provider;
	}
	public set(uri: string, provider: ProviderId): boolean {
		this.values.set(uri, { provider, updatedAt: this.now() });
		this.prune();
		return this.persist();
	}
	public delete(uri: string): boolean {
		if (!this.values.delete(uri)) return true;
		return this.persist();
	}
	public consumePersistenceFailure(): boolean {
		const value = this.failurePending;
		this.failurePending = false;
		return value;
	}
	private load(): void {
		try {
			const raw = this.storage.get(KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as unknown;
			if (!Array.isArray(parsed)) return;
			for (const item of parsed) {
				if (!item || typeof item !== "object") continue;
				const candidate = item as Record<string, unknown>;
				if (
					typeof candidate.uri === "string" &&
					(candidate.provider === "spotify" || candidate.provider === "lrclib" || candidate.provider === "musixmatch") &&
					typeof candidate.updatedAt === "number"
				)
					this.values.set(candidate.uri, { provider: candidate.provider, updatedAt: candidate.updatedAt });
			}
			this.prune();
		} catch {
			this.values.clear();
		}
	}
	private prune(): void {
		const entries = [...this.values.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_ENTRIES);
		this.values.clear();
		for (const entry of entries) this.values.set(entry[0], entry[1]);
	}
	private persist(): boolean {
		try {
			const value = JSON.stringify([...this.values.entries()].map(([uri, entry]) => ({ uri, ...entry })));
			if (this.storage.set(KEY, value)) return true;
		} catch {
			/* report below */
		}
		this.failurePending = true;
		this.persistenceFailed.emit(undefined);
		return false;
	}
}
