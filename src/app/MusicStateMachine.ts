export type MusicStateName =
	| "closed"
	| "opening"
	| "waitingForTrack"
	| "loadingLyrics"
	| "rendering"
	| "playing"
	| "paused"
	| "seeking"
	| "noLyrics"
	| "error"
	| "ended";

export type MusicState = {
	name: MusicStateName;
	message?: string;
};

export type MusicEvent =
	| { type: "openPiP" }
	| { type: "pipReady" }
	| { type: "pipFailed"; message: string }
	| { type: "closePiP" }
	| { type: "validTrack" }
	| { type: "invalidTrack" }
	| { type: "lyricsReady" }
	| { type: "noLyrics"; message?: string }
	| { type: "providerError"; message: string }
	| { type: "playbackPlaying" }
	| { type: "playbackPaused" }
	| { type: "pause" }
	| { type: "play" }
	| { type: "seek" }
	| { type: "seekSettled"; playing: boolean }
	| { type: "trackChanged" }
	| { type: "lyricsEnded" }
	| { type: "retry" }
	| { type: "seekBeforeEnd" };

export class MusicStateMachine {
	public state: MusicState = { name: "closed" };

	public dispatch(event: MusicEvent): MusicState {
		if (event.type === "closePiP") {
			return this.set("closed");
		}
		if (event.type === "trackChanged") {
			return this.set(this.state.name === "closed" ? "closed" : "loadingLyrics");
		}

		switch (this.state.name) {
			case "closed":
				if (event.type === "openPiP") {
					return this.set("opening");
				}
				break;
			case "opening":
				if (event.type === "pipReady") {
					return this.set("waitingForTrack");
				}
				if (event.type === "pipFailed") {
					return this.set("error", event.message);
				}
				break;
			case "waitingForTrack":
				if (event.type === "validTrack") {
					return this.set("loadingLyrics");
				}
				if (event.type === "invalidTrack") {
					return this.set("noLyrics");
				}
				break;
			case "loadingLyrics":
				if (event.type === "lyricsReady") {
					return this.set("rendering");
				}
				if (event.type === "noLyrics") {
					return this.set("noLyrics", event.message);
				}
				if (event.type === "providerError") {
					return this.set("error", event.message);
				}
				break;
			case "rendering":
				if (event.type === "playbackPlaying") {
					return this.set("playing");
				}
				if (event.type === "playbackPaused") {
					return this.set("paused");
				}
				if (event.type === "lyricsEnded") {
					return this.set("ended");
				}
				break;
			case "playing":
				if (event.type === "pause") {
					return this.set("paused");
				}
				if (event.type === "seek") {
					return this.set("seeking");
				}
				break;
			case "paused":
				if (event.type === "play") {
					return this.set("playing");
				}
				if (event.type === "seek") {
					return this.set("seeking");
				}
				break;
			case "seeking":
				if (event.type === "seekSettled") {
					return this.set(event.playing ? "playing" : "paused");
				}
				break;
			case "noLyrics":
			case "error":
				if (event.type === "retry") {
					return this.set("loadingLyrics");
				}
				break;
			case "ended":
				if (event.type === "seekBeforeEnd") {
					return this.set("seeking");
				}
				break;
		}
		return this.state;
	}

	private set(name: MusicStateName, message?: string): MusicState {
		this.state = { name, message };
		return this.state;
	}
}
