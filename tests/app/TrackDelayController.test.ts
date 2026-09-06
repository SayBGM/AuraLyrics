import { describe, expect, test, vi } from "vitest";
import type { OutroRenderOutcome } from "../../src/app/PresentationController";
import { TrackDelayController, type TrackDelayPresentation } from "../../src/app/TrackDelayController";
import type { TrackIdentity } from "../../src/lyrics/types";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../src/settings/settingsSchema";
import { type TrackLyricsDelayStorage, TrackLyricsDelayStore } from "../../src/settings/TrackLyricsDelayStore";

const track = (uri: string): TrackIdentity => ({
	uri,
	title: `Track ${uri}`,
	artist: "Aura",
	album: "Delays",
	durationMs: 180_000,
	isLocal: false,
});

const memoryStorage = (): TrackLyricsDelayStorage => {
	const values = new Map<string, string>();
	return {
		get: (key) => values.get(key) ?? null,
		set: (key, value) => {
			values.set(key, value);
			return true;
		},
	};
};

type PresentationCall = "resync" | "resumeIntro" | "evaluateOutro" | "repaint";

const createHarness = (
	options: {
		playingTrack?: TrackIdentity;
		settings?: ExtensionSettings;
		timestampSec?: number | undefined;
		introOutcome?: OutroRenderOutcome;
		outroOutcome?: OutroRenderOutcome;
	} = {}
) => {
	const calls: PresentationCall[] = [];
	const state = {
		playingTrack: options.playingTrack,
		settings: options.settings ?? DEFAULT_SETTINGS,
		timestampSec: "timestampSec" in options ? options.timestampSec : 12,
	};
	const presentation: TrackDelayPresentation = {
		resyncTimestampSec: () => {
			calls.push("resync");
			return state.timestampSec;
		},
		resumeIntro: () => {
			calls.push("resumeIntro");
			return options.introOutcome ?? "none";
		},
		evaluateOutro: () => {
			calls.push("evaluateOutro");
			return options.outroOutcome ?? "none";
		},
		repaintMountedLyrics: () => {
			calls.push("repaint");
		},
	};
	const refreshSettingsView = vi.fn();
	const delays = new TrackLyricsDelayStore(memoryStorage());
	const controller = new TrackDelayController(delays, {
		get playingTrack() {
			return state.playingTrack;
		},
		get settings() {
			return state.settings;
		},
		refreshSettingsView,
		presentation,
	});
	return { calls, controller, delays, refreshSettingsView, state };
};

describe("TrackDelayController", () => {
	test("resolves the global delay with no override and the override once set", () => {
		const identity = track("spotify:track:a");
		const { controller, delays } = createHarness({
			playingTrack: identity,
			settings: { ...DEFAULT_SETTINGS, lyricsDelayMs: 250 },
		});

		expect(controller.resolvedLyricsDelayMs()).toBe(250);

		delays.set(identity.uri, 400);
		expect(controller.resolvedLyricsDelayMs()).toBe(400);
	});

	test("resolves the global delay when nothing is playing", () => {
		const { controller } = createHarness({ settings: { ...DEFAULT_SETTINGS, lyricsDelayMs: 120 } });

		expect(controller.resolvedLyricsDelayMs()).toBe(120);
		expect(controller.currentTrackLyricsDelayState()).toBeUndefined();
	});

	test("reports the delay state for the playing track, flagging the override", () => {
		const identity = track("spotify:track:a");
		const { controller, delays } = createHarness({
			playingTrack: identity,
			settings: { ...DEFAULT_SETTINGS, lyricsDelayMs: 250 },
		});

		expect(controller.currentTrackLyricsDelayState()).toEqual({
			artist: identity.artist,
			delayMs: 250,
			defaultDelayMs: 250,
			hasOverride: false,
			title: identity.title,
			uri: identity.uri,
		});

		delays.set(identity.uri, 400);
		expect(controller.currentTrackLyricsDelayState()).toMatchObject({ delayMs: 400, defaultDelayMs: 250, hasOverride: true });
	});

	test("adjust nudges the override relative to the effective delay and repaints", () => {
		const identity = track("spotify:track:a");
		const { calls, controller, delays } = createHarness({
			playingTrack: identity,
			settings: { ...DEFAULT_SETTINGS, lyricsDelayMs: 100 },
		});

		expect(controller.adjustCurrentTrackLyricsDelay(identity.uri, 50)).toBe(true);

		expect(delays.get(identity.uri)).toBe(150);
		expect(calls).toEqual(["resync", "resumeIntro", "evaluateOutro", "repaint"]);
	});

	test("adjust rejects a stale track URI and re-reads the settings panel", () => {
		const identity = track("spotify:track:a");
		const { calls, controller, delays, refreshSettingsView } = createHarness({ playingTrack: identity });

		expect(controller.adjustCurrentTrackLyricsDelay("spotify:track:stale", 50)).toBe(false);

		expect(refreshSettingsView).toHaveBeenCalledOnce();
		expect(delays.get(identity.uri)).toBeUndefined();
		expect(calls).toEqual([]);
	});

	test("reset drops the override and repaints", () => {
		const identity = track("spotify:track:a");
		const { calls, controller, delays } = createHarness({ playingTrack: identity });
		delays.set(identity.uri, 400);

		expect(controller.resetCurrentTrackLyricsDelay(identity.uri)).toBe(true);

		expect(delays.get(identity.uri)).toBeUndefined();
		expect(calls).toEqual(["resync", "resumeIntro", "evaluateOutro", "repaint"]);
	});

	test("reset rejects a stale track URI and re-reads the settings panel", () => {
		const identity = track("spotify:track:a");
		const { calls, controller, delays, refreshSettingsView } = createHarness({ playingTrack: identity });
		delays.set(identity.uri, 400);

		expect(controller.resetCurrentTrackLyricsDelay("spotify:track:stale")).toBe(false);

		expect(refreshSettingsView).toHaveBeenCalledOnce();
		expect(delays.get(identity.uri)).toBe(400);
		expect(calls).toEqual([]);
	});

	test("skips the presentation refresh entirely when no PiP session is open", () => {
		const identity = track("spotify:track:a");
		const { calls, controller } = createHarness({ playingTrack: identity, timestampSec: undefined });

		controller.adjustCurrentTrackLyricsDelay(identity.uri, 50);

		expect(calls).toEqual(["resync"]);
	});

	test("does not repaint when the intro reveal already rendered lyrics", () => {
		const identity = track("spotify:track:a");
		const { calls, controller } = createHarness({ playingTrack: identity, introOutcome: "lyrics-rendered" });

		controller.adjustCurrentTrackLyricsDelay(identity.uri, 50);

		expect(calls).toEqual(["resync", "resumeIntro", "evaluateOutro"]);
	});

	test("does not repaint when the outro switch already rendered lyrics", () => {
		const identity = track("spotify:track:a");
		const { calls, controller } = createHarness({ playingTrack: identity, outroOutcome: "lyrics-rendered" });

		controller.adjustCurrentTrackLyricsDelay(identity.uri, 50);

		expect(calls).toEqual(["resync", "resumeIntro", "evaluateOutro"]);
	});
});
