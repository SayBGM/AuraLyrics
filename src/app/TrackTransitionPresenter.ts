import type { TrackIdentity } from "../lyrics/types";
import type { LyricsRenderer } from "../renderer/LyricsRenderer";
import type { SceneTransitionDirection } from "../renderer/SceneTransitionController";
import type { ExtensionSettings } from "../settings/settingsSchema";
import type { TrackEpoch } from "./TrackEpoch";
import { sameTrackEpoch } from "./TrackEpoch";
import type { ReadyTrackSessionSnapshot, TrackSessionSnapshot } from "./TrackSessionController";

/** A presentation held back until the running track-change animation finishes. */
export type PendingTrackPresentation =
	| { kind: "load-state"; snapshot: TrackSessionSnapshot }
	| { kind: "ready"; snapshot: ReadyTrackSessionSnapshot };

type ActiveTrackTransition = {
	epoch: TrackEpoch;
	/** Renderer scene generation of the metadata scene this transition animates in. */
	transitionGeneration: number;
};

/**
 * Live view of the orchestrator state this presenter needs. `renderer` and `settings` are getters,
 * not captured values, so the presenter always sees the current renderer and settings snapshot.
 */
export type TrackTransitionHost = {
	readonly renderer: LyricsRenderer;
	readonly settings: ExtensionSettings;
	/** True while `epoch` still addresses the track and PiP session in play. */
	isCurrentEpoch(epoch: TrackEpoch): boolean;
	/** True while `snapshot` is still the track session's committed snapshot. */
	isCurrentSnapshot(snapshot: TrackSessionSnapshot): boolean;
	resyncPlayback(): void;
	renderLoadStateNow(snapshot: TrackSessionSnapshot): void;
	presentReadySnapshotNow(snapshot: ReadyTrackSessionSnapshot): void;
};

/**
 * Owns the "a track change is animating, hold the next presentation until it settles" state machine.
 *
 * While a track-change metadata scene animates in, any load-state or ready presentation for the same
 * track epoch is parked in `pendingPresentation` instead of being rendered mid-animation; the newest
 * one wins. When the animation settles (and the epoch is still current) the parked presentation is
 * rendered; if the transition was interrupted the parked presentation is dropped.
 */
export class TrackTransitionPresenter {
	private activeTransition?: ActiveTrackTransition;
	private pendingPresentation?: PendingTrackPresentation;

	public constructor(private readonly host: TrackTransitionHost) {}

	/** Starts the metadata scene for a track change and begins holding presentations for `epoch`. */
	public begin(track: TrackIdentity, epoch: TrackEpoch, direction: SceneTransitionDirection): void {
		this.pendingPresentation = undefined;
		const handle = this.host.renderer.showTrackMetadata(epoch.session.root, { mode: "loading", track }, this.host.settings, {
			direction,
			animate: true,
		});
		const active: ActiveTrackTransition = { epoch, transitionGeneration: handle.generation };
		this.activeTransition = active;
		void handle.settled.then((result) => this.settle(active, result));
	}

	/** Parks `presentation` when it belongs to the animating transition. Returns whether it was held. */
	public defer(presentation: PendingTrackPresentation): boolean {
		const active = this.activeTransition;
		if (!active || !this.host.isCurrentEpoch(active.epoch) || trackUriForSnapshot(presentation.snapshot) !== active.epoch.uri) {
			return false;
		}
		this.pendingPresentation = presentation;
		return true;
	}

	/** Swaps a parked ready presentation for an equivalent, enriched snapshot. */
	public replacePending(initialSnapshot: ReadyTrackSessionSnapshot, snapshot: ReadyTrackSessionSnapshot): void {
		if (this.pendingPresentation?.snapshot !== initialSnapshot) {
			return;
		}
		this.defer({ kind: "ready", snapshot });
	}

	public hasActiveTransitionFor(epoch: TrackEpoch): boolean {
		const active = this.activeTransition;
		return active !== undefined && sameTrackEpoch(active.epoch, epoch);
	}

	public discard(): void {
		this.activeTransition = undefined;
		this.pendingPresentation = undefined;
	}

	private settle(active: ActiveTrackTransition, result: { generation: number; completed: boolean }): void {
		if (this.activeTransition !== active || result.generation !== active.transitionGeneration || !this.host.isCurrentEpoch(active.epoch)) {
			return;
		}

		this.activeTransition = undefined;
		const pending = this.pendingPresentation;
		this.pendingPresentation = undefined;
		if (!result.completed || !pending) {
			return;
		}

		this.host.resyncPlayback();
		if (
			!this.host.isCurrentEpoch(active.epoch) ||
			!this.host.isCurrentSnapshot(pending.snapshot) ||
			trackUriForSnapshot(pending.snapshot) !== active.epoch.uri
		) {
			return;
		}
		if (pending.kind === "load-state") {
			this.host.renderLoadStateNow(pending.snapshot);
			return;
		}
		this.host.presentReadySnapshotNow(pending.snapshot);
	}
}

const trackUriForSnapshot = (snapshot: TrackSessionSnapshot): string | undefined =>
	snapshot.loadState.status === "idle" ? undefined : snapshot.loadState.track.uri;
