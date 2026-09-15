import type { TrackIdentity } from "../../lyrics/types";

export type TrackMetadataViewModel = {
	mode: "loading" | "persistent" | "intro";
	track: TrackIdentity;
	notice?: TrackMetadataNotice;
};

export type TrackMetadataNotice = {
	title: string;
	detail: string;
	diagnosticsLabel?: string;
	diagnostics?: string[];
	actionLabel?: string;
	onAction?: () => void;
	copyDiagnosticsLabel?: string;
	diagnosticsCopiedLabel?: string;
	tone?: "neutral" | "danger";
};

export const createTrackMetadataScene = (document: Document, { mode, track, notice }: TrackMetadataViewModel): HTMLDivElement => {
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
	if (notice) {
		copy.append(createMetadataNotice(document, notice));
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

const createMetadataNotice = (document: Document, notice: TrackMetadataNotice): HTMLDivElement => {
	const container = document.createElement("div");
	container.className = `track-metadata-notice ${notice.tone ?? "neutral"}`;
	container.setAttribute("role", notice.tone === "danger" ? "alert" : "status");

	const title = document.createElement("strong");
	title.className = "track-metadata-notice-title";
	title.textContent = notice.title;
	container.append(title);

	const detail = document.createElement("span");
	detail.className = "track-metadata-notice-detail";
	detail.textContent = notice.detail;
	container.append(detail);

	const actionElements: HTMLElement[] = [];
	if (notice.actionLabel && notice.onAction) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "track-metadata-notice-action";
		button.textContent = notice.actionLabel;
		button.addEventListener("click", notice.onAction);
		actionElements.push(button);
	}
	if (notice.diagnostics?.length) {
		const copyButton = createCopyDiagnosticsButton(document, notice);
		if (copyButton) {
			actionElements.push(copyButton);
		}
	}
	if (actionElements.length > 0) {
		const actions = document.createElement("div");
		actions.className = "track-metadata-notice-actions";
		actions.append(...actionElements);
		container.append(actions);
	}

	if (notice.diagnostics?.length) {
		const details = document.createElement("details");
		details.className = "track-metadata-diagnostics";
		const summary = document.createElement("summary");
		summary.textContent = notice.diagnosticsLabel ?? "Diagnostics";
		details.append(summary);
		const list = document.createElement("ul");
		for (const diagnostic of notice.diagnostics) {
			const item = document.createElement("li");
			item.textContent = diagnostic;
			list.append(item);
		}
		details.append(list);
		container.append(details);
	}

	return container;
};

const createCopyDiagnosticsButton = (document: Document, notice: TrackMetadataNotice): HTMLButtonElement | undefined => {
	const clipboard = document.defaultView?.navigator.clipboard;
	const label = notice.copyDiagnosticsLabel;
	if (!clipboard?.writeText || !label) {
		return undefined;
	}
	const button = document.createElement("button");
	button.type = "button";
	button.className = "track-metadata-notice-copy";
	button.textContent = label;
	button.addEventListener("click", () => {
		void clipboard
			.writeText(diagnosticsReportText(notice))
			.then(() => {
				button.textContent = notice.diagnosticsCopiedLabel ?? label;
				globalThis.setTimeout(() => {
					button.textContent = label;
				}, 2000);
			})
			.catch(() => {});
	});
	return button;
};

const diagnosticsReportText = (notice: TrackMetadataNotice): string => {
	const lines = [notice.title, notice.detail];
	if (notice.diagnosticsLabel) {
		lines.push(notice.diagnosticsLabel);
	}
	lines.push(...(notice.diagnostics ?? []));
	return lines.filter((line): line is string => Boolean(line)).join("\n");
};

const normalizedMetadata = (value: string | undefined): string | undefined => {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
};
