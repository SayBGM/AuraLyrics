import type { TrackIdentity } from "../../lyrics/types";

export type TrackMetadataViewModel = {
	mode: "loading" | "persistent";
	track: TrackIdentity;
};

export const createTrackMetadataScene = (document: Document, { mode, track }: TrackMetadataViewModel): HTMLDivElement => {
	const scene = document.createElement("div");
	scene.className = `aura-lyrics track-metadata-scene ${mode}`;

	const layout = document.createElement("section");
	layout.className = "track-metadata-layout";
	layout.setAttribute("aria-label", track.title || "Track information");

	const coverUrl = normalizedMetadata(track.coverUrl);
	if (coverUrl) {
		const cover = document.createElement("img");
		cover.className = "track-metadata-cover";
		cover.src = coverUrl;
		cover.alt = "";
		cover.setAttribute("aria-hidden", "true");
		layout.append(cover);
	}

	const copy = document.createElement("div");
	copy.className = "track-metadata-copy";
	if (mode === "loading") {
		const eyebrow = document.createElement("span");
		eyebrow.className = "track-metadata-eyebrow";
		eyebrow.textContent = "LOADING";
		copy.append(eyebrow);
	}

	const title = document.createElement("strong");
	title.className = "track-metadata-title";
	title.textContent = track.title ?? "";
	copy.append(title);

	const bylineText = [track.artist, track.album]
		.map(normalizedMetadata)
		.filter((value): value is string => value !== undefined)
		.join(" · ");
	if (bylineText) {
		const byline = document.createElement("span");
		byline.className = "track-metadata-byline";
		byline.textContent = bylineText;
		copy.append(byline);
	}

	if (mode === "loading") {
		const progress = document.createElement("span");
		progress.className = "track-metadata-progress";
		progress.setAttribute("aria-hidden", "true");
		copy.append(progress);
	}

	layout.append(copy);
	scene.append(layout);
	return scene;
};

const normalizedMetadata = (value: string | undefined): string | undefined => {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
};
