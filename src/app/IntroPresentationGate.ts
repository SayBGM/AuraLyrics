import type { ExtensionSettings } from "../settings/settingsSchema";
import { firstRenderedVocalStartSec, introDecision } from "./IntroPresentationPolicy";
import type { ReadyTrackSessionSnapshot } from "./TrackSessionController";

export type IntroGateResult =
	| { kind: "none" }
	| { kind: "hold"; snapshot: ReadyTrackSessionSnapshot; firstVocalStartSec: number }
	| { kind: "reveal"; snapshot: ReadyTrackSessionSnapshot };

type PendingIntro = {
	snapshot: ReadyTrackSessionSnapshot;
	firstVocalStartSec: number;
};

type IntroGateState = { kind: "inactive" } | { kind: "active-unrevealed"; pending?: PendingIntro } | { kind: "revealed" };

export class IntroPresentationGate {
	private state: IntroGateState = { kind: "inactive" };

	public beginTrackEpoch(): void {
		this.state = { kind: "active-unrevealed" };
	}

	public endTrackEpoch(): void {
		this.state = { kind: "inactive" };
	}

	public hasActiveEpoch(): boolean {
		return this.state.kind !== "inactive";
	}

	public discardPendingSession(): void {
		if (this.state.kind === "active-unrevealed") {
			this.state = { kind: "active-unrevealed" };
		}
	}

	public accept(snapshot: ReadyTrackSessionSnapshot, settings: ExtensionSettings, timestampSec: number): IntroGateResult {
		if (this.state.kind === "inactive") {
			return { kind: "none" };
		}

		const firstVocalStartSec = firstRenderedVocalStartSec(snapshot.lyrics, settings.syncPreference);
		if (this.state.kind === "revealed") {
			return { kind: "reveal", snapshot };
		}

		if (firstVocalStartSec === undefined || introDecision({ firstVocalStartSec, timestampSec, applyImmediateThreshold: true }) === "reveal") {
			return this.reveal(snapshot);
		}

		this.state = { kind: "active-unrevealed", pending: { snapshot, firstVocalStartSec } };
		return { kind: "hold", snapshot, firstVocalStartSec };
	}

	public resume(timestampSec: number): IntroGateResult {
		return this.evaluatePending(timestampSec, true);
	}

	public tick(timestampSec: number): IntroGateResult {
		return this.evaluatePending(timestampSec, false);
	}

	public isHolding(): boolean {
		return this.state.kind === "active-unrevealed" && this.state.pending !== undefined;
	}

	private evaluatePending(timestampSec: number, applyImmediateThreshold: boolean): IntroGateResult {
		if (this.state.kind !== "active-unrevealed" || !this.state.pending) {
			return { kind: "none" };
		}

		const { snapshot, firstVocalStartSec } = this.state.pending;
		if (introDecision({ firstVocalStartSec, timestampSec, applyImmediateThreshold }) === "hold") {
			return { kind: "none" };
		}

		return this.reveal(snapshot);
	}

	private reveal(snapshot: ReadyTrackSessionSnapshot): IntroGateResult {
		this.state = { kind: "revealed" };
		return { kind: "reveal", snapshot };
	}
}
