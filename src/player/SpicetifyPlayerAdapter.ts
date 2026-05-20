import type { TrackIdentity } from "../lyrics/types";
import type { SpicetifyGlobal } from "../runtime/spicetify";
import { EventEmitter } from "../shared/EventEmitter";

export class SpicetifyPlayerAdapter {
	public readonly trackChanged = new EventEmitter<TrackIdentity | undefined>();

	private readonly onSongChange = () => this.trackChanged.emit(this.getCurrentTrack());

	public constructor(private readonly spicetify: SpicetifyGlobal) {}

	public attach(): void {
		this.spicetify.Player.addEventListener("songchange", this.onSongChange);
	}

	public detach(): void {
		this.spicetify.Player.removeEventListener?.("songchange", this.onSongChange);
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
			coverUrl: metadata.image_url,
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
