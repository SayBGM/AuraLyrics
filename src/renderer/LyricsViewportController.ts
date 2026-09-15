import type { ExtensionSettings } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import { InterludeView, isActiveInterlude } from "./components/Interlude";

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

type FocusedRow = { row: HTMLElement; index: number };

export class LyricsViewportController {
	private settings: Pick<ExtensionSettings, "interludeStyle" | "visibleContextLines"> & Partial<Pick<ExtensionSettings, "compactMode">>;
	private lastAnnouncement = "";
	private lastAnnouncedRow?: HTMLElement;
	private readonly resizeObserver?: ResizeObserver;
	/** Scroll rows are built once with the scene and never change afterwards. */
	private readonly rows: HTMLElement[];
	private readonly interludePreviewRows: Map<InterludeView, HTMLElement>;
	private viewportHeight: number;
	private lastFocusedIndex = -1;
	private lastContextLines = -1;
	private lastTransform?: string;
	private measurementDirty = true;

	public constructor(
		private readonly lyricsTrack: HTMLElement,
		private readonly lyricsViewport: HTMLElement,
		private readonly container: HTMLElement,
		settings: Pick<ExtensionSettings, "interludeStyle" | "visibleContextLines"> & Partial<Pick<ExtensionSettings, "compactMode">>,
		groups: AnimatedGroup[],
		private readonly announcer?: HTMLElement,
		observeResize = true
	) {
		this.settings = settings;
		this.rows = getScrollRows(lyricsTrack);
		this.interludePreviewRows = buildInterludePreviewRows(groups, lyricsTrack);
		this.viewportHeight = this.measureViewportHeight();
		const ResizeObserverConstructor = this.lyricsViewport.ownerDocument.defaultView?.ResizeObserver;
		if (observeResize && ResizeObserverConstructor) {
			this.resizeObserver = new ResizeObserverConstructor(() => this.update(true));
			this.resizeObserver.observe(this.lyricsViewport);
		}
	}

	public applySettings(
		settings: Pick<ExtensionSettings, "interludeStyle" | "visibleContextLines"> & Partial<Pick<ExtensionSettings, "compactMode">>
	): void {
		this.settings = settings;
		this.measurementDirty = true;
	}

	/** Forces the next update to re-measure row offsets (layout or settings changed). */
	public invalidateLayout(): void {
		this.measurementDirty = true;
	}

	public update(force = false): void {
		const compact = this.updateCompactMode();
		const previewRow = this.settings.interludeStyle === "frame" ? this.getInterludePreviewRow() : undefined;
		const focused = this.getFocusedRow(previewRow);
		const focusedIndex = focused?.index ?? -1;
		if (!(force || this.measurementDirty || focusedIndex !== this.lastFocusedIndex)) {
			// Same focused row as the previous frame: no class churn, no measurement, no scroll write.
			this.announce(focused?.row);
			return;
		}
		// Layout is read once per focused row change, alongside the row offset the scroll needs.
		this.viewportHeight = this.measureViewportHeight();
		const contextLines = Math.min(Math.max(0, Math.round(this.settings.visibleContextLines)), contextCapacity(this.viewportHeight));
		const effectiveContextLines = focused?.row.classList.contains("provider-credit-timed") || compact ? 0 : contextLines;
		if (focusedIndex !== this.lastFocusedIndex || effectiveContextLines !== this.lastContextLines || this.measurementDirty || force) {
			this.updateContextVisibility(focused, effectiveContextLines);
		}
		this.scrollActiveIntoView(focused);
		this.lastFocusedIndex = focusedIndex;
		this.lastContextLines = effectiveContextLines;
		this.measurementDirty = false;
		this.announce(focused?.row);
	}

	private updateCompactMode(): boolean {
		const height = this.lyricsViewport.clientHeight || this.container.clientHeight;
		const compact = isCompactLayout(this.lyricsViewport, this.container, this.settings.compactMode);
		this.container.classList.toggle("compact-mode", compact);
		this.container.classList.toggle("compact-overflow", compact && height > 0 && height < 220);
		return compact;
	}

	/** Stops observing without tearing the scene down, for a scene that is fading out. */
	public pause(): void {
		this.resizeObserver?.disconnect();
	}

	public destroy(): void {
		this.resizeObserver?.disconnect();
	}

	private measureViewportHeight(): number {
		return this.lyricsViewport.clientHeight || this.container.clientHeight || 600;
	}

	private getFocusedRow(preferredRow?: HTMLElement): FocusedRow | undefined {
		const rows = this.rows;
		const preferredIndex = preferredRow ? rows.indexOf(preferredRow) : undefined;
		let index = preferredIndex !== undefined && preferredIndex >= 0 && preferredIndex < rows.length ? preferredIndex : undefined;
		if (index === undefined) {
			for (let candidate = 0; candidate < rows.length; candidate += 1) {
				if (rows[candidate].classList.contains("active")) {
					index = candidate;
					break;
				}
			}
		}
		if (index === undefined) {
			for (let candidate = rows.length - 1; candidate >= 0; candidate -= 1) {
				if (rows[candidate].classList.contains("sung")) {
					index = candidate;
					break;
				}
			}
		}
		return index === undefined ? undefined : { row: rows[index], index };
	}

	private updateContextVisibility(focused: FocusedRow | undefined, contextLines: number): void {
		const rows = this.rows;
		if (!focused) {
			for (const row of rows) {
				row.classList.remove("out-of-context");
				row.removeAttribute("aria-hidden");
			}
			return;
		}
		for (let index = 0; index < rows.length; index += 1) {
			const row = rows[index];
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
		}
	}

	private scrollActiveIntoView(focused: FocusedRow | undefined): void {
		if (!focused) {
			return;
		}
		const rowHeight = focused.row.clientHeight || focused.row.getBoundingClientRect().height || 64;
		const offset = getOffsetTopWithin(focused.row, this.lyricsTrack) + rowHeight / 2 - this.viewportHeight * 0.5;
		const transform = `translate3d(0, ${-Math.max(0, offset)}px, 0)`;
		if (this.lastTransform === transform) {
			return;
		}
		this.lastTransform = transform;
		this.lyricsTrack.style.transform = transform;
	}

	private getInterludePreviewRow(): HTMLElement | undefined {
		for (const [interlude, row] of this.interludePreviewRows) {
			if (isActiveInterlude(interlude)) {
				return row;
			}
		}
		return undefined;
	}

	private announce(row: HTMLElement | undefined): void {
		if (!this.announcer || !row || row === this.lastAnnouncedRow) {
			return;
		}
		this.lastAnnouncedRow = row;
		const text = row.getAttribute("aria-label")?.trim() || row.textContent?.replace(/\s+/gu, " ").trim() || "";
		if (!text || text === this.lastAnnouncement) {
			return;
		}
		this.lastAnnouncement = text;
		this.announcer.textContent = text;
	}
}

const isCompactLayout = (viewport: HTMLElement, container: HTMLElement, compactMode: "auto" | "always" | "off" | undefined): boolean => {
	if (compactMode === "always") {
		return true;
	}
	if (compactMode !== "auto") {
		return false;
	}
	const width = viewport.clientWidth || container.clientWidth;
	const height = viewport.clientHeight || container.clientHeight;
	// During initial layout (and in jsdom), zero means unknown rather than a tiny PiP.
	return (width > 0 && width < 400) || (height > 0 && height < 300);
};

const SCROLL_ROW_SELECTOR = ".vocals-group:not(.syllable-group), .syllable-row[data-scroll-row='true']";

const getScrollRows = (lyricsTrack: HTMLElement): HTMLElement[] => Array.from(lyricsTrack.querySelectorAll<HTMLElement>(SCROLL_ROW_SELECTOR));

/**
 * The row a frame-style interlude previews is fixed once the scene is built: the first
 * scroll row of the next attached vocal group.
 */
const buildInterludePreviewRows = (groups: AnimatedGroup[], lyricsTrack: HTMLElement): Map<InterludeView, HTMLElement> => {
	const previewRows = new Map<InterludeView, HTMLElement>();
	for (let index = 0; index < groups.length; index += 1) {
		const group = groups[index];
		if (!(group instanceof InterludeView)) {
			continue;
		}
		for (let next = index + 1; next < groups.length; next += 1) {
			const candidate = groups[next];
			if (candidate instanceof InterludeView || candidate.element.parentElement !== lyricsTrack) {
				continue;
			}
			previewRows.set(group, candidate.element.querySelector<HTMLElement>("[data-scroll-row='true']") ?? candidate.element);
			break;
		}
	}
	return previewRows;
};

const getOffsetTopWithin = (element: HTMLElement, container: HTMLElement): number => {
	let offset = 0;
	let current: HTMLElement | null = element;
	while (current && current !== container) {
		offset += current.offsetTop;
		current = current.offsetParent as HTMLElement | null;
	}
	if (current === container) {
		return offset;
	}
	const elementRect = element.getBoundingClientRect();
	const containerRect = container.getBoundingClientRect();
	const rectOffset = elementRect.top - containerRect.top;
	if (elementRect.height > 0 || containerRect.height > 0 || rectOffset !== 0) {
		return rectOffset;
	}

	// jsdom has no layout engine and therefore exposes neither offsetParent nor
	// useful DOMRects. Keep the structural fallback so unit tests can provide
	// deterministic offsetTop values without changing the browser calculation.
	offset = 0;
	current = element;
	while (current && current !== container) {
		offset += current.offsetTop;
		current = current.parentElement;
	}
	return current === container ? offset : rectOffset;
};

const contextCapacity = (viewportHeight: number): number => {
	if (viewportHeight < 220) return 0;
	if (viewportHeight < 360) return 1;
	return Number.POSITIVE_INFINITY;
};
