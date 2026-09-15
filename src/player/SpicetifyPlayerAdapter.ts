import type { TrackIdentity } from "../domain/types";
import type { SpicetifyGlobal, SpicetifyQueue, SpicetifyQueueItem } from "../runtime/spicetify";
import { EventEmitter } from "../shared/EventEmitter";

export type TrackChangedEvent = {
	track: TrackIdentity | undefined;
	previousTrackUri?: string;
	previousProgressSec?: number;
	previousDurationSec?: number;
};

type TrackProgress = {
	progressSec: number;
	durationSec?: number;
};

type PreviousEpochCandidate = {
	uri: string;
	progress: TrackProgress;
};

const SAME_URI_REPEAT_BOUNDARY_SEC = 2;

export class SpicetifyPlayerAdapter {
	public readonly trackChanged = new EventEmitter<TrackChangedEvent>();
	public readonly playbackChanged = new EventEmitter<boolean>();
	public readonly progressChanged = new EventEmitter<number>();
	/** Emits the best available queued track after Spotify's queue updates. */
	public readonly queueChanged = new EventEmitter<TrackIdentity | undefined>();

	private currentTrackUri: string | undefined;
	private readonly progressByTrackUri = new Map<string, TrackProgress>();
	private previousEpochCandidate: PreviousEpochCandidate | undefined;

	private readonly onSongChange = () => {
		const previousTrackUri = this.currentTrackUri;
		const latestPreviousProgress = previousTrackUri ? this.progressByTrackUri.get(previousTrackUri) : undefined;
		const candidate = this.previousEpochCandidate;
		const previousEpochCandidate = candidate?.uri === previousTrackUri ? candidate?.progress : undefined;
		const track = this.getCurrentTrack();
		const isSameUriRepeat = previousTrackUri === track?.uri && previousEpochCandidate !== undefined;
		const previousProgress = isSameUriRepeat ? previousEpochCandidate : latestPreviousProgress;
		const currentProgress = track ? this.progressByTrackUri.get(track.uri) : undefined;
		this.currentTrackUri = track?.uri;
		this.progressByTrackUri.clear();
		if (track && currentProgress && (track.uri !== previousTrackUri || isSameUriRepeat)) {
			this.progressByTrackUri.set(track.uri, currentProgress);
		}
		this.previousEpochCandidate = undefined;
		this.trackChanged.emit({
			track,
			previousTrackUri,
			previousProgressSec: previousProgress?.progressSec,
			previousDurationSec: previousProgress?.durationSec,
		});
	};
	private readonly onPlayPause = () => this.playbackChanged.emit(this.isPlaying());
	private readonly onQueueUpdate = (event?: { data?: SpicetifyQueue }) => this.queueChanged.emit(this.getNextTrack(event?.data));
	private readonly onProgress = (event?: { data?: unknown }) => {
		const progressSec = typeof event?.data === "number" ? event.data / 1000 : Number.NaN;
		if (!Number.isFinite(progressSec) || progressSec < 0) {
			return;
		}
		this.progressChanged.emit(progressSec);

		const track = this.getCurrentTrack();
		if (!track) {
			return;
		}
		const previousProgress = this.progressByTrackUri.get(track.uri);
		if (
			track.uri === this.currentTrackUri &&
			previousProgress &&
			this.previousEpochCandidate?.uri !== track.uri &&
			isSameUriNaturalRepeatReset(previousProgress, progressSec)
		) {
			this.previousEpochCandidate = { uri: track.uri, progress: previousProgress };
		}
		const durationSec = track.durationMs / 1000;
		this.progressByTrackUri.set(track.uri, {
			progressSec,
			durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
		});
	};

	public constructor(private readonly spicetify: SpicetifyGlobal) {}

	public attach(): void {
		this.progressByTrackUri.clear();
		this.previousEpochCandidate = undefined;
		this.currentTrackUri = this.getCurrentTrack()?.uri;
		this.spicetify.Player.addEventListener("songchange", this.onSongChange);
		this.spicetify.Player.addEventListener("onplaypause", this.onPlayPause);
		this.spicetify.Player.addEventListener("onprogress", this.onProgress);
		this.spicetify.Player.origin?._events?.addListener("queue_update", this.onQueueUpdate);
	}

	public detach(): void {
		this.spicetify.Player.removeEventListener?.("songchange", this.onSongChange);
		this.spicetify.Player.removeEventListener?.("onplaypause", this.onPlayPause);
		this.spicetify.Player.removeEventListener?.("onprogress", this.onProgress);
		this.spicetify.Player.origin?._events?.removeListener("queue_update", this.onQueueUpdate);
		this.progressByTrackUri.clear();
		this.previousEpochCandidate = undefined;
		this.currentTrackUri = undefined;
	}

	public getCurrentTrack(): TrackIdentity | undefined {
		const item = this.spicetify.Player.data?.item;
		return item ? toTrackIdentity(item, this.spicetify, this.spicetify.Player.getDuration(), false) : undefined;
	}

	/** Returns `queued[0]`, falling back to `nextUp[0]`. Invalid and local queue items are excluded. */
	public getNextTrack(queue: SpicetifyQueue | undefined = this.spicetify.Queue): TrackIdentity | undefined {
		const item = queue?.queued?.[0] ?? queue?.nextUp?.[0];
		const track = item ? toTrackIdentity(item, this.spicetify, undefined, true) : undefined;
		return track?.isLocal ? undefined : track;
	}

	public getTimestamp(delayMs: number): number {
		return Math.max(0, (this.spicetify.Player.getProgress() - delayMs) / 1000);
	}

	public isPlaying(): boolean {
		return this.spicetify.Player.isPlaying?.() ?? true;
	}

	public previous(): void {
		this.spicetify.Player.back?.();
	}

	public togglePlay(): void {
		const isPlaying = this.isPlaying();
		if (isPlaying && this.spicetify.Player.pause) {
			this.spicetify.Player.pause();
			return;
		}
		if (!isPlaying && this.spicetify.Player.play) {
			this.spicetify.Player.play();
			return;
		}
		this.spicetify.Player.togglePlay?.();
	}

	public next(): void {
		this.spicetify.Player.next?.();
	}
}

const isSameUriNaturalRepeatReset = (previousProgress: TrackProgress, progressSec: number): boolean =>
	previousProgress.durationSec !== undefined &&
	previousProgress.progressSec >= previousProgress.durationSec - SAME_URI_REPEAT_BOUNDARY_SEC &&
	progressSec >= 0 &&
	progressSec <= SAME_URI_REPEAT_BOUNDARY_SEC &&
	progressSec < previousProgress.progressSec;

const COVER_METADATA_KEYS = ["image_url", "image_xlarge_url", "image_large_url", "image_medium_url", "image_small_url"] as const;

type PlayerItemWithCover = Pick<SpicetifyQueueItem, "metadata" | "images" | "album">;

const toTrackIdentity = (
	item: SpicetifyQueueItem,
	spicetify: SpicetifyGlobal,
	fallbackDurationMs?: number,
	requireValidDuration = false
): TrackIdentity | undefined => {
	const metadata = item.metadata;
	if (!metadata) {
		return undefined;
	}
	const isLocal = spicetify.URI?.isLocalTrack(item.uri) ?? item.uri.startsWith("spotify:local:");
	const isTrack = spicetify.URI?.isTrack(item.uri) ?? item.uri.startsWith("spotify:track:");
	const durationMs = Number(metadata.duration ?? fallbackDurationMs);
	if ((!isTrack && !isLocal) || (requireValidDuration && (!Number.isFinite(durationMs) || durationMs <= 0))) {
		return undefined;
	}
	return {
		uri: item.uri,
		id: item.uri.split(":")[2],
		title: metadata.title ?? "",
		artist: metadata.artist_name ?? "",
		album: metadata.album_title ?? "",
		durationMs,
		coverUrl: findCoverUrl(item),
		isLocal,
	};
};

const findCoverUrl = (item: PlayerItemWithCover): string | undefined => {
	for (const candidate of getCoverCandidates(item)) {
		const normalized = normalizeCoverUrl(candidate);
		if (normalized) {
			return normalized;
		}
	}
	return undefined;
};

const getCoverCandidates = (item: PlayerItemWithCover): string[] =>
	[
		...COVER_METADATA_KEYS.map((key) => item.metadata?.[key]),
		...(item.images ?? []).flatMap((image) => [image.url, image.uri]),
		...(item.album?.images ?? []).flatMap((image) => [image.url, image.uri]),
	].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

const normalizeCoverUrl = (url: string | undefined): string | undefined => {
	if (!url) {
		return undefined;
	}
	const trimmed = url.trim();
	const spotifyImage = /^spotify:image:(?<imageId>[a-z0-9]+)$/i.exec(trimmed);
	if (spotifyImage?.groups?.imageId) {
		return `https://i.scdn.co/image/${spotifyImage.groups.imageId}`;
	}
	const internalImagePath = /^\/?image\/(?<imageId>[a-z0-9]+)$/i.exec(trimmed);
	if (internalImagePath?.groups?.imageId) {
		return `https://i.scdn.co/image/${internalImagePath.groups.imageId}`;
	}
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed;
	}
	return undefined;
};
