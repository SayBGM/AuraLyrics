import { lyricsLoadNoticeFor } from "../lyrics/lyricsLoadNotice";
import type { LyricsDocument, TrackIdentity } from "../lyrics/types";
import type { PipSession } from "../pip/DocumentPipController";
import type { AudioAnalysisWaveformService, TrackWaveformProfile } from "../renderer/AudioAnalysisWaveformService";
import { buildInterludeWaveformMap, type InterludeWaveformMap } from "../renderer/interludeWaveforms";
import type { LyricsRenderer } from "../renderer/LyricsRenderer";
import type { ExtensionSettings } from "../settings/settingsSchema";
import type { IntroPresentationGate } from "./IntroPresentationGate";
import type { OutroPresentationController, OutroPresentationResult } from "./OutroPresentationController";
import { presentationStateForSnapshot, type TrackPresentationState } from "./TrackPresentationState";
import type { ReadyTrackSessionSnapshot, TrackSessionSnapshot } from "./TrackSessionController";
import type { PendingTrackPresentation } from "./TrackTransitionPresenter";

/**
 * `deltaTime` sentinel for renderer updates that must not advance motion: `Spring.update` returns the
 * current position unchanged for `deltaTime <= 0`, and `SyllableVocals.animate` treats it as
 * `immediate` and `set()`s each spring straight to its sampled target. Used both for one-off
 * re-renders that do not advance playback time and for frames where motion is disabled.
 */
export const SNAP_DELTA_TIME = 0;

/** Whether a presentation call actually painted the lyrics scene this turn. */
export type OutroRenderOutcome = "none" | "lyrics-rendered";

/**
 * Live view of the orchestrator state this controller renders against. Every collaborator is a getter
 * rather than a captured reference so the controller always sees the current session, renderer and
 * settings snapshot.
 */
export type PresentationHost = {
	readonly renderer: LyricsRenderer;
	readonly introGate: IntroPresentationGate;
	readonly outroController: OutroPresentationController;
	readonly session: PipSession | undefined;
	readonly settings: ExtensionSettings;
	readonly currentTrackUri: string | undefined;
	readonly timestampSec: number;
	waveformForInterlude: AudioAnalysisWaveformService["waveformForInterlude"];
	/** Parks a presentation while a track-change animation runs. Returns whether it was held back. */
	deferTrackPresentation(presentation: PendingTrackPresentation): boolean;
	/** Retry action offered by the status card. */
	reloadCurrentTrack(): void;
};

/**
 * Turns track session snapshots into what the PiP window shows: status cards, track metadata scenes
 * and the mounted lyrics scene, gated by the intro hold and the outro switch back to metadata.
 *
 * Owns `revealedSnapshot` — the snapshot currently on screen (or held for the outro) — which is what
 * lets a re-opened PiP window or a settings change re-present the same track without reloading it.
 */
export class PresentationController {
	private revealedSnapshot?: ReadyTrackSessionSnapshot;

	public constructor(private readonly host: PresentationHost) {}

	public clearRevealedSnapshot(): void {
		this.revealedSnapshot = undefined;
	}

	public renderLoadState(snapshot: TrackSessionSnapshot): void {
		if (this.host.deferTrackPresentation({ kind: "load-state", snapshot })) {
			return;
		}
		this.renderLoadStateNow(snapshot);
	}

	public renderLoadStateNow(snapshot: TrackSessionSnapshot): void {
		const presentation = presentationStateForSnapshot(snapshot);
		if (presentation) {
			this.renderPresentationState(presentation);
		}
	}

	public renderPresentationState(state: TrackPresentationState): void {
		const session = this.host.session;
		if (!session) return;
		switch (state.kind) {
			case "loading":
				this.host.renderer.showTrackMetadata(session.root, { mode: "loading", track: state.track }, this.host.settings);
				return;
			case "intro":
				this.host.renderer.showTrackMetadata(session.root, { mode: "intro", track: state.track }, this.host.settings);
				return;
			case "lyrics":
				this.presentReadySnapshot(state.snapshot);
				return;
			case "instrumental":
				{
					const notice = lyricsLoadNoticeFor("instrumental", this.host.settings.language);
					this.host.renderer.showTrackMetadata(
						session.root,
						{
							mode: "persistent",
							track: state.track,
							notice: { title: notice.title, detail: notice.detail, tone: notice.tone },
						},
						this.host.settings
					);
				}
				return;
			case "metadata": {
				const notice = lyricsLoadNoticeFor(state.reason, this.host.settings.language, state.message, state.diagnostics);
				this.host.renderer.showTrackMetadata(
					session.root,
					{
						mode: "persistent",
						track: state.track,
						notice: {
							title: notice.title,
							detail: notice.detail,
							diagnosticsLabel: notice.diagnosticsLabel,
							diagnostics: notice.diagnostics,
							actionLabel: notice.tryAgainLabel,
							onAction: notice.tryAgainLabel ? () => this.host.reloadCurrentTrack() : undefined,
							copyDiagnosticsLabel: notice.copyDiagnosticsLabel,
							diagnosticsCopiedLabel: notice.diagnosticsCopiedLabel,
							tone: notice.tone,
						},
					},
					this.host.settings
				);
				return;
			}
		}
	}

	public showStatus(title: string, detail?: string, actionLabel?: string, tone: "neutral" | "danger" = "neutral"): void {
		const session = this.host.session;
		if (!session) {
			return;
		}
		this.host.renderer.showStatus(
			session.root,
			{
				title,
				detail,
				tone,
				actionLabel,
				onAction: actionLabel ? () => this.host.reloadCurrentTrack() : undefined,
			},
			this.host.settings
		);
	}

	public presentReadySnapshot(snapshot: ReadyTrackSessionSnapshot): void {
		if (this.host.deferTrackPresentation({ kind: "ready", snapshot })) {
			return;
		}
		this.presentReadySnapshotNow(snapshot);
	}

	public presentReadySnapshotNow(snapshot: ReadyTrackSessionSnapshot): void {
		const timestampSec = this.host.timestampSec;
		const result = this.host.introGate.accept(snapshot, this.host.settings, timestampSec);
		if (result.kind === "hold") {
			this.renderPresentationState({ kind: "intro", track: snapshot.loadState.track });
			return;
		}
		if (result.kind === "reveal") {
			this.revealReadySnapshot(result.snapshot, timestampSec);
		}
	}

	public revealReadySnapshot(snapshot: ReadyTrackSessionSnapshot, timestampSec: number): OutroRenderOutcome {
		if (!this.ensureOutroTrackEpoch(snapshot.loadState.track.uri)) {
			return "none";
		}
		this.revealedSnapshot = snapshot;
		return this.renderOutroResult(this.host.outroController.accept(snapshot, this.host.settings, timestampSec), timestampSec);
	}

	/** Resumes a held intro at `timestampSec`, revealing the held snapshot when it is due. */
	public resumeIntro(timestampSec: number): OutroRenderOutcome {
		const result = this.host.introGate.resume(timestampSec);
		return result.kind === "reveal" ? this.revealReadySnapshot(result.snapshot, timestampSec) : "none";
	}

	/** Ticks a held intro at `timestampSec`, revealing the held snapshot when it is due. */
	public tickIntro(timestampSec: number): OutroRenderOutcome {
		const result = this.host.introGate.tick(timestampSec);
		return result.kind === "reveal" ? this.revealReadySnapshot(result.snapshot, timestampSec) : "none";
	}

	public evaluateOutro(timestampSec: number): OutroRenderOutcome {
		return this.renderOutroResult(this.host.outroController.evaluate(timestampSec), timestampSec);
	}

	/** Repaints the mounted lyrics scene without advancing motion. No-op when lyrics are not mounted. */
	public repaintMountedLyrics(timestampSec: number): void {
		if (this.hasMountedLyricsPresentation()) {
			this.host.renderer.update(timestampSec, SNAP_DELTA_TIME);
		}
	}

	/**
	 * The snapshot to re-present for `track`, downgraded to its native line timing when synthesized
	 * karaoke is no longer wanted by the current settings.
	 */
	public revealedSnapshotFor(track: TrackIdentity | undefined): ReadyTrackSessionSnapshot | undefined {
		if (!track || this.revealedSnapshot?.loadState.track.uri !== track.uri) return undefined;
		const settings = this.host.settings;
		if (this.revealedSnapshot.timingSource !== "synthetic" || (settings.pseudoKaraoke && settings.syncPreference === "prefer-syllable")) {
			return this.revealedSnapshot;
		}
		return {
			...this.revealedSnapshot,
			lyrics: this.revealedSnapshot.loadState.lyrics,
			timingSource: "native",
		};
	}

	public hasMountedLyricsPresentation(): boolean {
		return (
			this.host.session !== undefined &&
			this.revealedSnapshot !== undefined &&
			this.revealedSnapshot.loadState.track.uri === this.host.currentTrackUri &&
			this.host.outroController.currentKind() === "lyrics"
		);
	}

	private renderOutroResult(result: OutroPresentationResult, timestampSec: number): OutroRenderOutcome {
		const session = this.host.session;
		if (!session) return "none";
		if (result.kind === "show-lyrics") {
			this.mountReadySnapshot(result.snapshot);
			this.host.renderer.update(timestampSec, SNAP_DELTA_TIME);
			return "lyrics-rendered";
		}
		if (result.kind === "show-metadata") {
			this.host.renderer.showTrackMetadata(session.root, { mode: "persistent", track: result.snapshot.loadState.track }, this.host.settings, {
				direction: "up",
				animate: true,
			});
		}
		return "none";
	}

	private mountReadySnapshot(snapshot: ReadyTrackSessionSnapshot): void {
		const session = this.host.session;
		if (!session) return;
		const state = snapshot.loadState;
		this.host.renderer.mount(session.root, {
			lyrics: snapshot.lyrics,
			settings: this.host.settings,
			timingSource: snapshot.timingSource,
			provider: state.provider,
			source: state.source,
			diagnostics: state.diagnostics,
			waveforms: this.waveformsForLyrics(snapshot.lyrics, snapshot.waveformProfile),
			rhythm: snapshot.waveformProfile,
		});
	}

	private waveformsForLyrics(lyrics: LyricsDocument, waveformProfile?: TrackWaveformProfile): InterludeWaveformMap {
		return buildInterludeWaveformMap({
			lyrics,
			profile: waveformProfile,
			interludeStyle: this.host.settings.interludeStyle,
			waveformForInterlude: (profile, interlude) => this.host.waveformForInterlude(profile, interlude),
		});
	}

	private ensureOutroTrackEpoch(uri: string): boolean {
		if (this.host.outroController.activeTrackUri() === undefined) {
			this.host.outroController.beginTrackEpoch(uri);
		}
		return this.host.outroController.activeTrackUri() === uri;
	}
}
