import { describe, expect, test } from "vitest";
import { MusicStateMachine } from "../../src/app/MusicStateMachine";

describe("MusicStateMachine", () => {
	test("moves through open, loading, ready, playback, and close states", () => {
		const machine = new MusicStateMachine();

		expect(machine.state.name).toBe("closed");
		machine.dispatch({ type: "openPiP" });
		expect(machine.state.name).toBe("opening");
		machine.dispatch({ type: "pipReady" });
		expect(machine.state.name).toBe("waitingForTrack");
		machine.dispatch({ type: "validTrack" });
		expect(machine.state.name).toBe("loadingLyrics");
		machine.dispatch({ type: "lyricsReady" });
		expect(machine.state.name).toBe("rendering");
		machine.dispatch({ type: "playbackPlaying" });
		expect(machine.state.name).toBe("playing");
		machine.dispatch({ type: "pause" });
		expect(machine.state.name).toBe("paused");
		machine.dispatch({ type: "closePiP" });
		expect(machine.state.name).toBe("closed");
	});

	test("returns to loading when the track changes from an error state", () => {
		const machine = new MusicStateMachine();
		machine.dispatch({ type: "openPiP" });
		machine.dispatch({ type: "pipReady" });
		machine.dispatch({ type: "validTrack" });
		machine.dispatch({ type: "providerError", message: "failed" });
		expect(machine.state.name).toBe("error");

		machine.dispatch({ type: "trackChanged" });

		expect(machine.state.name).toBe("loadingLyrics");
	});
});
