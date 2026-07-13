import { isNaturalTrackEnd, type PreviousTrackProgress } from "./OutroPresentationPolicy";

export const NAVIGATION_INTENT_TIMEOUT_MS = 5_000;

export type TrackTransitionDirection = "next" | "previous" | "unknown";

type NavigationIntent = {
	direction: "next" | "previous";
	createdAtMs: number;
};

export class TrackTransitionDirectionController {
	private readonly pendingIntents: NavigationIntent[] = [];

	public constructor(private readonly nowMs: () => number = () => performance.now()) {}

	public enqueue(direction: "next" | "previous"): void {
		const nowMs = this.nowMs();
		this.pruneExpiredIntents(nowMs);
		this.pendingIntents.push({ direction, createdAtMs: nowMs });
	}

	public consume(progress?: PreviousTrackProgress): TrackTransitionDirection {
		this.pruneExpiredIntents(this.nowMs());
		const intent = this.pendingIntents.shift();
		if (intent) {
			return intent.direction;
		}
		return isNaturalTrackEnd(progress) ? "next" : "unknown";
	}

	public clear(): void {
		this.pendingIntents.length = 0;
	}

	private pruneExpiredIntents(nowMs: number): void {
		while (this.pendingIntents[0] && nowMs - this.pendingIntents[0].createdAtMs > NAVIGATION_INTENT_TIMEOUT_MS) {
			this.pendingIntents.shift();
		}
	}
}
