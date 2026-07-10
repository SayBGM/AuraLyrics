import type { ExtensionSettings } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import { InterludeView } from "./components/Interlude";

export type ViewportRowState = {
	active: boolean;
	sung: boolean;
};

export type ContextRowState = {
	outOfContext: boolean;
	position: "previous" | "current" | "next" | undefined;
};

export const focusedRowIndex = (rows: ViewportRowState[], preferredIndex?: number): number | undefined => {
	if (preferredIndex !== undefined && preferredIndex >= 0 && preferredIndex < rows.length) {
		return preferredIndex;
	}
	const activeIndex = rows.findIndex((row) => row.active);
	if (activeIndex >= 0) {
		return activeIndex;
	}
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		if (rows[index].sung) {
			return index;
		}
	}
	return undefined;
};

export const contextStateForRow = (index: number, focusedIndex: number | undefined, contextLines: number): ContextRowState => {
	if (focusedIndex === undefined) {
		return { outOfContext: false, position: undefined };
	}
	const distance = index - focusedIndex;
	const outOfContext = Math.abs(distance) > contextLines;
	return {
		outOfContext,
		position: outOfContext || Math.abs(distance) > 1 ? undefined : distance === -1 ? "previous" : distance === 1 ? "next" : "current",
	};
};

export class LyricsViewportController {
	public constructor(
		private readonly lyricsTrack: HTMLElement,
		private readonly lyricsViewport: HTMLElement,
		private readonly container: HTMLElement,
		private readonly settings: Pick<ExtensionSettings, "interludeStyle" | "visibleContextLines">,
		private readonly groups: AnimatedGroup[]
	) {}

	public update(): void {
		const previewRow = this.settings.interludeStyle === "frame" ? this.getInterludePreviewRow() : undefined;
		updateContextVisibility(this.lyricsTrack, Math.max(0, Math.round(this.settings.visibleContextLines)), previewRow);
		scrollActiveIntoView(this.lyricsTrack, this.lyricsViewport, this.container, previewRow);
	}

	private getInterludePreviewRow(): HTMLElement | undefined {
		const activeInterludeIndex = this.groups.findIndex(isActiveInterlude);
		if (activeInterludeIndex < 0) {
			return undefined;
		}
		const nextVocal = this.groups
			.slice(activeInterludeIndex + 1)
			.find((group) => !(group instanceof InterludeView) && group.element.parentElement === this.lyricsTrack);
		return nextVocal?.element.querySelector<HTMLElement>("[data-scroll-row='true']") ?? nextVocal?.element;
	}
}

const SCROLL_ROW_SELECTOR = ".vocals-group:not(.syllable-group), .syllable-row[data-scroll-row='true']";

const getScrollRows = (lyricsTrack: HTMLElement): HTMLElement[] => Array.from(lyricsTrack.querySelectorAll<HTMLElement>(SCROLL_ROW_SELECTOR));

const getFocusedRow = (rows: HTMLElement[], preferredRow?: HTMLElement): { row: HTMLElement; index: number } | undefined => {
	const preferredIndex = preferredRow ? rows.indexOf(preferredRow) : undefined;
	const index = focusedRowIndex(
		rows.map((row) => ({ active: row.classList.contains("active"), sung: row.classList.contains("sung") })),
		preferredIndex
	);
	return index === undefined ? undefined : { row: rows[index], index };
};

const updateContextVisibility = (lyricsTrack: HTMLElement, contextLines: number, preferredRow?: HTMLElement): void => {
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
		const state = contextStateForRow(index, focused.index, contextLines);
		row.classList.toggle("out-of-context", state.outOfContext);
		row.classList.toggle("context-previous", state.position === "previous");
		row.classList.toggle("context-next", state.position === "next");
		row.classList.toggle("context-current", state.position === "current");
		if (state.outOfContext) {
			row.setAttribute("aria-hidden", "true");
		} else {
			row.removeAttribute("aria-hidden");
		}
	});
};

const scrollActiveIntoView = (lyricsTrack: HTMLElement, lyricsViewport: HTMLElement, container: HTMLElement, preferredRow?: HTMLElement): void => {
	const focused = getFocusedRow(getScrollRows(lyricsTrack), preferredRow);
	if (!focused) {
		return;
	}
	const viewportHeight = lyricsViewport.clientHeight || container.clientHeight || 600;
	const rowHeight = focused.row.clientHeight || focused.row.getBoundingClientRect().height || 64;
	const offset = getOffsetTopWithin(focused.row, lyricsTrack) + rowHeight / 2 - viewportHeight * 0.5;
	lyricsTrack.style.transform = `translate3d(0, ${-Math.max(0, offset)}px, 0)`;
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

const isActiveInterlude = (group: AnimatedGroup): group is InterludeView => group instanceof InterludeView && group.isActive;
