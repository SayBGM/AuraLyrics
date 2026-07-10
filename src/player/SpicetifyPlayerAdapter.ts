import type { TrackIdentity } from "../domain/types";
import type { SpicetifyGlobal } from "../runtime/spicetify";
import { EventEmitter } from "../shared/EventEmitter";

export class SpicetifyPlayerAdapter {
	public readonly trackChanged = new EventEmitter<TrackIdentity | undefined>();
	public readonly playbackChanged = new EventEmitter<boolean>();

	private readonly onSongChange = () => this.trackChanged.emit(this.getCurrentTrack());
	private readonly onPlayPause = () => this.playbackChanged.emit(this.isPlaying());

	public constructor(private readonly spicetify: SpicetifyGlobal) {}

	public attach(): void {
		this.spicetify.Player.addEventListener("songchange", this.onSongChange);
		this.spicetify.Player.addEventListener("onplaypause", this.onPlayPause);
	}

	public detach(): void {
		this.spicetify.Player.removeEventListener?.("songchange", this.onSongChange);
		this.spicetify.Player.removeEventListener?.("onplaypause", this.onPlayPause);
	}

	public getCurrentTrack(): TrackIdentity | undefined {
		const item = this.spicetify.Player.data?.item;
		const metadata = item?.metadata;
		if (!item || !metadata) {
			return undefined;
		}
		const uri = item.uri;
		const isLocal = this.spicetify.URI?.isLocalTrack(uri) ?? uri.startsWith("spotify:local:");
		const isTrack = this.spicetify.URI?.isTrack(uri) ?? uri.startsWith("spotify:track:");
		if (!isTrack && !isLocal) {
			return undefined;
		}
		return {
			uri,
			id: uri.split(":")[2],
			title: metadata.title ?? "",
			artist: metadata.artist_name ?? "",
			album: metadata.album_title ?? "",
			durationMs: Number(metadata.duration ?? this.spicetify.Player.getDuration()),
			coverUrl: findCoverUrl(item),
			isLocal,
		};
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

const COVER_METADATA_KEYS = ["image_url", "image_xlarge_url", "image_large_url", "image_medium_url", "image_small_url"] as const;

type PlayerItemWithCover = {
	metadata?: Record<string, string>;
	images?: Array<{ url?: string; uri?: string }>;
	album?: {
		images?: Array<{ url?: string; uri?: string }>;
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
