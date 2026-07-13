import type { ExtensionSettings } from "../settings/settingsSchema";
import { outroMetadataThresholdSec } from "./OutroPresentationPolicy";
import type { ReadyTrackSessionSnapshot } from "./TrackSessionController";

export type OutroPresentationResult =
	| { kind: "none" }
	| { kind: "show-lyrics"; snapshot: ReadyTrackSessionSnapshot }
	| { kind: "show-metadata"; snapshot: ReadyTrackSessionSnapshot };

type PresentationKind = "lyrics" | "metadata";

export class OutroPresentationController {
	private activeUri?: string;
	private snapshot?: ReadyTrackSessionSnapshot;
	private thresholdSec?: number;
	private presentation?: PresentationKind;

	public beginTrackEpoch(uri: string): void {
		this.activeUri = uri;
		this.clearSession();
	}

	public endTrackEpoch(): void {
		this.activeUri = undefined;
		this.clearSession();
	}

	public discardSession(): void {
		this.clearSession();
	}

	public accept(snapshot: ReadyTrackSessionSnapshot, settings: ExtensionSettings, timestampSec: number): OutroPresentationResult {
		if (this.activeUri === undefined || snapshot.loadState.track.uri !== this.activeUri) {
			return { kind: "none" };
		}

		this.snapshot = snapshot;
		this.thresholdSec = outroMetadataThresholdSec(snapshot.lyrics, settings.syncPreference, snapshot.loadState.track.durationMs / 1000);
		const target = this.targetAt(timestampSec);
		if (target === this.presentation) {
			return target === "lyrics" ? { kind: "show-lyrics", snapshot } : { kind: "none" };
		}

		this.presentation = target;
		return this.resultFor(target, snapshot);
	}

	public evaluate(timestampSec: number): OutroPresentationResult {
		if (this.snapshot === undefined || this.presentation === undefined) {
			return { kind: "none" };
		}

		const target = this.targetAt(timestampSec);
		if (target === this.presentation) {
			return { kind: "none" };
		}

		this.presentation = target;
		return this.resultFor(target, this.snapshot);
	}

	public currentKind(): "inactive" | "lyrics" | "metadata" {
		return this.presentation ?? "inactive";
	}

	private clearSession(): void {
		this.snapshot = undefined;
		this.thresholdSec = undefined;
		this.presentation = undefined;
	}

	private targetAt(timestampSec: number): PresentationKind {
		return this.thresholdSec !== undefined && timestampSec >= this.thresholdSec ? "metadata" : "lyrics";
	}

	private resultFor(target: PresentationKind, snapshot: ReadyTrackSessionSnapshot): OutroPresentationResult {
		return target === "metadata" ? { kind: "show-metadata", snapshot } : { kind: "show-lyrics", snapshot };
	}
}
