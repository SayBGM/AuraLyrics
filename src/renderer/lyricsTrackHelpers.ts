import type { LyricsLoadDiagnostics, ProviderAttemptStatus, SyllableVocalSet } from "../lyrics/types";
import type { AnimatedGroup } from "./AnimatedGroup";

export const applyHoldTiming = (groups: AnimatedGroup[]): void => {
	for (let index = 0; index < groups.length; index += 1) {
		const group = groups[index];
		const next = groups.slice(index + 1).find((item) => item.startTime > group.startTime);
		if (next) {
			group.setHoldEndTime?.(next.startTime);
		}
	}
};

export const syllableToLine = (item: SyllableVocalSet) => ({
	type: "vocal" as const,
	text: item.lead.syllables.map((syllable, index) => `${index > 0 && !syllable.isPartOfWord ? " " : ""}${syllable.text}`).join(""),
	startTime: item.lead.startTime,
	endTime: item.lead.endTime,
	oppositeAligned: item.oppositeAligned,
});

type ProviderSourceOptions = {
	provider: string | undefined;
	source?: "cache" | "network";
	diagnostics?: LyricsLoadDiagnostics;
	showDiagnostics?: boolean;
	synthInfo?: { averageConfidence: number };
};

export const appendProviderSource = (
	lyricsTrack: HTMLElement,
	{ provider, source: loadSource, diagnostics, showDiagnostics = false, synthInfo }: ProviderSourceOptions
): void => {
	if (!provider) {
		return;
	}
	const sourceElement = document.createElement("div");
	sourceElement.className = "provider-source";
	const synthLabel = showDiagnostics && synthInfo ? ` · pseudo-karaoke (conf ${synthInfo.averageConfidence.toFixed(2)})` : "";
	sourceElement.textContent = `Source: ${provider}${showDiagnostics && loadSource ? ` · ${loadSource}` : ""}${synthLabel}`;
	lyricsTrack.append(sourceElement);
	if (!showDiagnostics || !diagnostics) {
		return;
	}
	const detail = document.createElement("div");
	detail.className = "provider-diagnostics";
	detail.textContent = providerDiagnosticsText(diagnostics);
	lyricsTrack.append(detail);
};

const providerDiagnosticsText = (diagnostics: LyricsLoadDiagnostics): string => {
	const cache = diagnostics.cache;
	const cacheDetail =
		cache.status === "hit" || cache.status === "provider-mismatch"
			? `cache ${cache.status.replace("-", " ")} (${cache.provider})`
			: `cache ${cache.status.replace("-", " ")}`;
	const attempts = diagnostics.attempts.map((attempt) => `${attempt.provider}: ${attemptStatusLabel(attempt.status)}`).join(" -> ");
	return attempts ? `${cacheDetail} · ${attempts}` : cacheDetail;
};

const attemptStatusLabel = (status: ProviderAttemptStatus): string => status.replace("-", " ");

const SCROLL_ROW_SELECTOR = ".vocals-group:not(.syllable-group), .syllable-row[data-scroll-row='true']";

const getScrollRows = (lyricsTrack: HTMLElement): HTMLElement[] => Array.from(lyricsTrack.querySelectorAll<HTMLElement>(SCROLL_ROW_SELECTOR));

const getFocusedRow = (rows: HTMLElement[], preferredRow?: HTMLElement): { row: HTMLElement; index: number } | undefined => {
	if (preferredRow) {
		const preferredIndex = rows.indexOf(preferredRow);
		if (preferredIndex >= 0) {
			return { row: preferredRow, index: preferredIndex };
		}
	}
	const activeIndex = rows.findIndex((row) => row.classList.contains("active"));
	if (activeIndex >= 0) {
		return { row: rows[activeIndex], index: activeIndex };
	}
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		const row = rows[index];
		if (row.classList.contains("sung")) {
			return { row, index };
		}
	}
	return undefined;
};

export const updateContextVisibility = (lyricsTrack: HTMLElement, contextLines: number, preferredRow?: HTMLElement): void => {
	const rows = getScrollRows(lyricsTrack);
	const focused = getFocusedRow(rows, preferredRow);
	if (!focused) {
		for (const row of rows) {
			row.classList.remove("out-of-context");
			row.removeAttribute("aria-hidden");
		}
		return;
	}
	rows.forEach((row, index) => {
		const distance = index - focused.index;
		const outOfContext = Math.abs(distance) > contextLines;
		row.classList.toggle("out-of-context", outOfContext);
		row.classList.toggle("context-previous", distance === -1 && !outOfContext);
		row.classList.toggle("context-next", distance === 1 && !outOfContext);
		row.classList.toggle("context-current", distance === 0);
		if (outOfContext) {
			row.setAttribute("aria-hidden", "true");
		} else {
			row.removeAttribute("aria-hidden");
		}
	});
};

const getOffsetTopWithin = (element: HTMLElement, container: HTMLElement): number => {
	let offset = 0;
	let current: HTMLElement | null = element;
	while (current && current !== container) {
		offset += current.offsetTop;
		current = current.parentElement;
	}
	if (current === container) {
		return offset;
	}
	const elementRect = element.getBoundingClientRect();
	const containerRect = container.getBoundingClientRect();
	return elementRect.top - containerRect.top;
};

export const scrollActiveIntoView = (
	lyricsTrack: HTMLElement,
	lyricsViewport: HTMLElement,
	container: HTMLElement | undefined,
	preferredRow?: HTMLElement
): void => {
	const focused = getFocusedRow(getScrollRows(lyricsTrack), preferredRow);
	if (!focused) {
		return;
	}
	const viewportHeight = lyricsViewport.clientHeight || container?.clientHeight || 600;
	const rowHeight = focused.row.clientHeight || focused.row.getBoundingClientRect().height || 64;
	const targetY = viewportHeight * 0.5;
	const offset = getOffsetTopWithin(focused.row, lyricsTrack) + rowHeight / 2 - targetY;
	lyricsTrack.style.transform = `translate3d(0, ${-Math.max(0, offset)}px, 0)`;
};
