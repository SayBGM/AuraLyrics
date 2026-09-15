/**
 * Keeps at most one background request. A completed result remains reusable for a short time;
 * callers can await the same promise when the queued track becomes current.
 */
export class LyricsPrefetchController<T> {
	private entry: { key: string; createdAt: number; controller: AbortController; promise: Promise<T> } | undefined;

	public constructor(
		private readonly now: () => number = () => Date.now(),
		private readonly ttlMs = 1000 * 60 * 5
	) {}

	public prepare(key: string, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const existing = this.get(key);
		if (existing) {
			return existing;
		}
		this.cancel();
		const controller = new AbortController();
		const promise = load(controller.signal);
		const entry = { key, createdAt: this.now(), controller, promise };
		void promise.catch(() => {
			if (this.entry === entry) {
				this.entry = undefined;
			}
		});
		this.entry = entry;
		return promise;
	}

	public get(key: string): Promise<T> | undefined {
		const entry = this.entry;
		if (!entry || entry.key !== key || this.now() - entry.createdAt > this.ttlMs) {
			if (entry && this.now() - entry.createdAt > this.ttlMs) {
				this.cancel();
			}
			return undefined;
		}
		return entry.promise;
	}

	public cancel(): void {
		this.entry?.controller.abort();
		this.entry = undefined;
	}
}
