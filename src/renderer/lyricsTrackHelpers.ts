import type { SyllableVocalSet } from "../lyrics/types";
import type { ExtensionSettings } from "../settings/SettingsStore";
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

export const appendProviderSource = (lyricsTrack: HTMLElement, provider: string | undefined): void => {
	if (!provider) {
		return;
	}
	const source = document.createElement("div");
	source.className = "provider-source";
	source.textContent = `Source: ${provider}`;
	lyricsTrack.append(source);
};

const getFocusedRow = (rows: HTMLElement[]): { row: HTMLElement; index: number } | undefined => {
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

export const updateContextVisibility = (lyricsTrack: HTMLElement, contextLines: number): void => {
	const rows = Array.from(lyricsTrack.querySelectorAll<HTMLElement>(".vocals-group"));
	const focused = getFocusedRow(rows);
	if (!focused) {
		for (const row of rows) {
			row.classList.remove("out-of-context");
			row.removeAttribute("aria-hidden");
		}
		return;
	}
	rows.forEach((row, index) => {
		const outOfContext = Math.abs(index - focused.index) > contextLines;
		row.classList.toggle("out-of-context", outOfContext);
		if (outOfContext) {
			row.setAttribute("aria-hidden", "true");
		} else {
			row.removeAttribute("aria-hidden");
		}
	});
};

export const scrollActiveIntoView = (
	lyricsTrack: HTMLElement,
	lyricsViewport: HTMLElement,
	container: HTMLElement | undefined,
	settings: ExtensionSettings | undefined
): void => {
	const focused = getFocusedRow(Array.from(lyricsTrack.querySelectorAll<HTMLElement>(".vocals-group")));
	if (!focused) {
		return;
	}
	const viewportHeight = lyricsViewport.clientHeight || container?.clientHeight || 600;
	const rowHeight = focused.row.clientHeight || focused.row.getBoundingClientRect().height || 64;
	const targetY = viewportHeight * (settings?.lyricsVerticalPosition ?? 0.5);
	const offset = focused.row.offsetTop + rowHeight / 2 - targetY;
	lyricsTrack.style.transform = `translate3d(0, ${-Math.max(0, offset)}px, 0)`;
};
