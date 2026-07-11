import type { ExtensionSettings } from "../settings/settingsSchema";
import { firstRenderedVocalStartSec, introDecision } from "./IntroPresentationPolicy";
import type { ReadyTrackSessionSnapshot } from "./TrackSessionController";

export type IntroGateResult =
	| { kind: "none" }
	| { kind: "hold"; snapshot: ReadyTrackSessionSnapshot; firstVocalStartSec: number }
	| { kind: "reveal"; snapshot: ReadyTrackSessionSnapshot };

export class IntroPresentationGate {
	private activeEpoch = false;
	private revealed = false;
	private pendingSnapshot?: ReadyTrackSessionSnapshot;
	private pendingFirstVocalStartSec?: number;

	public beginTrackEpoch(): void {
		this.activeEpoch = true;
		this.revealed = false;
		this.clearPending();
	}

	public endTrackEpoch(): void {
		this.activeEpoch = false;
		this.revealed = false;
		this.clearPending();
	}

	public hasActiveEpoch(): boolean {
		return this.activeEpoch;
	}

	public discardPendingSession(): void {
		this.clearPending();
	}

	public accept(snapshot: ReadyTrackSessionSnapshot, settings: ExtensionSettings, timestampSec: number): IntroGateResult {
		const firstVocalStartSec = firstRenderedVocalStartSec(snapshot.lyrics, settings.syncPreference);
		if (this.revealed) {
			return { kind: "reveal", snapshot };
		}

		if (firstVocalStartSec === undefined || introDecision({ firstVocalStartSec, timestampSec, applyImmediateThreshold: true }) === "reveal") {
			return this.reveal(snapshot);
		}

		this.pendingSnapshot = snapshot;
		this.pendingFirstVocalStartSec = firstVocalStartSec;
		return { kind: "hold", snapshot, firstVocalStartSec };
	}

	public resume(timestampSec: number): IntroGateResult {
		return this.evaluatePending(timestampSec, true);
	}

	public tick(timestampSec: number): IntroGateResult {
		return this.evaluatePending(timestampSec, false);
	}

	public isHolding(): boolean {
		return this.activeEpoch && this.pendingSnapshot !== undefined;
	}

	private evaluatePending(timestampSec: number, applyImmediateThreshold: boolean): IntroGateResult {
		const snapshot = this.pendingSnapshot;
		const firstVocalStartSec = this.pendingFirstVocalStartSec;
		if (!snapshot || firstVocalStartSec === undefined || introDecision({ firstVocalStartSec, timestampSec, applyImmediateThreshold }) === "hold") {
			return { kind: "none" };
		}

		return this.reveal(snapshot);
	}

	private reveal(snapshot: ReadyTrackSessionSnapshot): IntroGateResult {
		this.revealed = true;
		this.clearPending();
		return { kind: "reveal", snapshot };
	}

	private clearPending(): void {
		this.pendingSnapshot = undefined;
		this.pendingFirstVocalStartSec = undefined;
	}
}
