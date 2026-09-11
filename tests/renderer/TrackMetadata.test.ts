import { describe, expect, test, vi } from "vitest";
import { createTrackMetadataScene } from "../../src/renderer/components/TrackMetadata";

const track = {
	title: "Track title",
	artist: "Artist",
	album: "Album",
	uri: "spotify:track:metadata",
	durationMs: 180_000,
	isLocal: false,
};

describe("createTrackMetadataScene", () => {
	test("renders a failure notice with diagnostics and invokes retry", () => {
		const ownerDocument = document.implementation.createHTMLDocument("metadata");
		const onAction = vi.fn();
		const scene = createTrackMetadataScene(ownerDocument, {
			mode: "persistent",
			track,
			notice: {
				title: "Unable to load lyrics",
				detail: "The lyrics provider request failed.",
				diagnosticsLabel: "Request diagnostics",
				diagnostics: ["Spotify: error · network request failed"],
				actionLabel: "Retry this track",
				onAction,
				tone: "danger",
			},
		});

		expect(scene.querySelector(".track-metadata-notice")?.classList.contains("danger")).toBe(true);
		expect(scene.querySelector(".track-metadata-notice-title")?.textContent).toBe("Unable to load lyrics");
		expect(scene.querySelector(".track-metadata-diagnostics li")?.textContent).toContain("network request failed");
		const button = scene.querySelector<HTMLButtonElement>(".track-metadata-notice-action");
		button?.click();
		expect(onAction).toHaveBeenCalledOnce();
	});

	test("does not render a retry button when the failure is not retryable", () => {
		const ownerDocument = document.implementation.createHTMLDocument("metadata");
		const scene = createTrackMetadataScene(ownerDocument, {
			mode: "persistent",
			track,
			notice: {
				title: "Local files are not supported",
				detail: "Lyrics cannot be loaded.",
			},
		});

		expect(scene.querySelector(".track-metadata-notice")).not.toBeNull();
		expect(scene.querySelector(".track-metadata-notice-action")).toBeNull();
	});
});
