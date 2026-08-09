import {
	buildHighlightDecorationLayout,
	type HighlightDecorationLayout,
	type HighlightDirection,
	type HighlightMeasuredPiece,
	type HighlightRect,
} from "./HighlightDecorationGeometry";

export type HighlightDecorationPiece = {
	element: HTMLElement;
	getProgress?: () => number;
	fallbackWeight?: number;
};

export type HighlightDecorationTrackOptions = {
	host: HTMLElement;
	pieces: readonly HighlightDecorationPiece[];
};

export interface HighlightDecorationTrackProvider {
	getHighlightDecorationTracks(): readonly HighlightDecorationTrack[];
}

export class HighlightDecorationTrack {
	public readonly host: HTMLElement;
	public readonly pieces: readonly HighlightDecorationPiece[];
	public readonly decorationLayer: HTMLSpanElement;
	private layout?: HighlightDecorationLayout;
	private readonly fallbackWeights: number[];
	private progressSource: "overall" | "pieces" = "overall";
	private overallProgress = 0;
	private currentProgress = 0;
	private readonly fragmentElements: HTMLSpanElement[] = [];

	public constructor(options: HighlightDecorationTrackOptions) {
		this.host = options.host;
		this.pieces = options.pieces;
		this.fallbackWeights = this.pieces.map((piece) => positiveWeight(piece.fallbackWeight));
		this.host.classList.add("highlight-layout-host");
		this.decorationLayer = this.host.ownerDocument.createElement("span");
		this.decorationLayer.className = "highlight-decoration-layer";
		this.decorationLayer.setAttribute("aria-hidden", "true");
		this.decorationLayer.style.pointerEvents = "none";
		this.host.append(this.decorationLayer);
		this.writeTrackProgress(0);
	}

	public readLayout(): HighlightDecorationLayout {
		const hostRect = rectFrom(this.host.getBoundingClientRect());
		const view = this.host.ownerDocument.defaultView;
		const direction = directionFor(this.host, view);
		const pieces: HighlightMeasuredPiece[] = this.pieces.map((piece, index) => ({
			index,
			rects: clientRectsFor(piece.element),
			fontSizePx: fontSizeFor(piece.element, view),
		}));
		return buildHighlightDecorationLayout(hostRect, pieces, direction);
	}

	public applyLayout(layout: HighlightDecorationLayout): void {
		this.layout = layout;
		this.host.dataset.highlightLayoutReady = layout.fragments.length > 0 ? "true" : "false";
		for (let index = 0; index < layout.fragments.length; index += 1) {
			const geometry = layout.fragments[index];
			const fragment = this.fragmentElements[index] ?? this.createFragment();
			fragment.dataset.direction = layout.direction;
			fragment.style.left = `${geometry.left}px`;
			fragment.style.top = `${geometry.top}px`;
			fragment.style.width = `${geometry.width}px`;
			fragment.style.height = `${geometry.height}px`;
			fragment.style.transformOrigin = layout.direction === "rtl" ? "right center" : "left center";
			fragment.style.setProperty("--highlight-decoration-font-size", `${geometry.fontSizePx}px`);
			fragment.style.setProperty("--highlight-fragment-advance-start", `${geometry.advanceStartPx}px`);
			fragment.style.setProperty("--highlight-fragment-advance-end", `${geometry.advanceEndPx}px`);
		}
		while (this.fragmentElements.length > layout.fragments.length) {
			this.fragmentElements.pop()?.remove();
		}
		this.refreshProgress();
	}

	public measureAndApply(): void {
		this.applyLayout(this.readLayout());
	}

	public invalidateLayout(): void {
		this.host.dataset.highlightLayoutReady = "false";
	}

	public setProgress(progress: number): void {
		this.progressSource = "overall";
		this.overallProgress = clampProgress(progress);
		this.refreshProgress();
	}

	public updateProgressFromPieces(): void {
		this.progressSource = "pieces";
		this.refreshProgress();
	}

	public getProgress(): number {
		return this.currentProgress;
	}

	public getLayout(): HighlightDecorationLayout | undefined {
		return this.layout;
	}

	private createFragment(): HTMLSpanElement {
		const fragment = this.host.ownerDocument.createElement("span");
		fragment.className = "highlight-decoration-fragment";
		fragment.setAttribute("aria-hidden", "true");
		fragment.style.pointerEvents = "none";
		this.fragmentElements.push(fragment);
		this.decorationLayer.append(fragment);
		return fragment;
	}

	private refreshProgress(): void {
		const progress = this.progressSource === "pieces" ? this.weightedPieceProgress() : this.overallProgress;
		this.writeTrackProgress(progress);
		if (!this.layout || this.layout.totalAdvancePx <= 0) {
			return;
		}
		const filledAdvancePx = progress * this.layout.totalAdvancePx;
		for (let index = 0; index < this.layout.fragments.length; index += 1) {
			const geometry = this.layout.fragments[index];
			const fragmentProgress = clampProgress(
				(filledAdvancePx - geometry.advanceStartPx) / Math.max(geometry.advanceEndPx - geometry.advanceStartPx, 0.001)
			);
			const fragment = this.fragmentElements[index];
			if (fragment.style.getPropertyValue("--highlight-fragment-progress-ratio") !== String(fragmentProgress)) {
				fragment.style.setProperty("--highlight-fragment-progress-ratio", String(fragmentProgress));
			}
			const state = fragmentProgress <= 0 ? "empty" : fragmentProgress >= 1 ? "full" : "partial";
			if (fragment.dataset.highlightState !== state) {
				fragment.dataset.highlightState = state;
			}
		}
	}

	private weightedPieceProgress(): number {
		const measuredWeights = this.layout?.pieceWidthsPx;
		const hasMeasuredWidth = measuredWeights?.some((weight) => weight > 0);
		const weights = hasMeasuredWidth && measuredWeights ? measuredWeights : this.fallbackWeights;
		let weightedProgress = 0;
		let totalWeight = 0;
		for (let index = 0; index < this.pieces.length; index += 1) {
			const weight = Math.max(0, weights[index] ?? 0);
			weightedProgress += clampProgress(this.pieces[index].getProgress?.() ?? 0) * weight;
			totalWeight += weight;
		}
		return totalWeight > 0 ? clampProgress(weightedProgress / totalWeight) : 0;
	}

	private writeTrackProgress(progress: number): void {
		this.currentProgress = clampProgress(progress);
		const value = String(this.currentProgress);
		if (this.host.style.getPropertyValue("--highlight-track-progress-ratio") !== value) {
			this.host.style.setProperty("--highlight-track-progress-ratio", value);
		}
	}
}

export type HighlightDecorationLayoutControllerOptions = {
	onLayout?: () => void;
	onError?: (error: unknown) => void;
};

export class HighlightDecorationLayoutController {
	private readonly ownerWindow: (Window & typeof globalThis) | null;
	private readonly fontSet?: FontFaceSet;
	private resizeObserver?: ResizeObserver;
	private frame?: number;
	private started = false;
	private destroyed = false;
	private dirty = true;
	private fontReadyGeneration = 0;
	private readonly onFontsLoaded = (): void => this.invalidate();

	public constructor(
		private readonly layoutRoot: HTMLElement,
		private readonly tracks: readonly HighlightDecorationTrack[],
		private readonly options: HighlightDecorationLayoutControllerOptions = {}
	) {
		this.ownerWindow = layoutRoot.ownerDocument.defaultView;
		this.fontSet = layoutRoot.ownerDocument.fonts;
	}

	public start(): void {
		if (this.started || this.destroyed) {
			return;
		}
		this.started = true;
		const ResizeObserverConstructor = this.ownerWindow?.ResizeObserver;
		if (ResizeObserverConstructor) {
			const resizeObserver = new ResizeObserverConstructor(() => this.invalidate());
			resizeObserver.observe(this.layoutRoot);
			this.resizeObserver = resizeObserver;
		}
		this.fontSet?.addEventListener("loadingdone", this.onFontsLoaded);
		this.fontSet?.addEventListener("loadingerror", this.onFontsLoaded);
		const generation = ++this.fontReadyGeneration;
		void this.fontSet?.ready.then(() => {
			if (this.started && !this.destroyed && generation === this.fontReadyGeneration) {
				this.invalidate();
			}
		});
		this.invalidate();
	}

	public invalidate(): void {
		if (this.destroyed) {
			return;
		}
		for (const track of this.tracks) {
			track.invalidateLayout();
		}
		this.dirty = true;
		if (!this.started || this.frame !== undefined) {
			return;
		}
		if (!this.ownerWindow?.requestAnimationFrame) {
			this.flush();
			return;
		}
		this.frame = this.ownerWindow.requestAnimationFrame(() => {
			this.frame = undefined;
			this.flush();
		});
	}

	public flush(): void {
		if (this.destroyed || !this.dirty) {
			return;
		}
		if (this.frame !== undefined && this.ownerWindow?.cancelAnimationFrame) {
			this.ownerWindow.cancelAnimationFrame(this.frame);
			this.frame = undefined;
		}
		this.dirty = false;
		this.layoutRoot.classList.add("highlight-layout-measuring");
		const layouts: Array<HighlightDecorationLayout | undefined> = [];
		try {
			for (const track of this.tracks) {
				try {
					layouts.push(track.readLayout());
				} catch (error) {
					layouts.push(undefined);
					this.options.onError?.(error);
				}
			}
		} finally {
			this.layoutRoot.classList.remove("highlight-layout-measuring");
		}
		try {
			for (let index = 0; index < this.tracks.length; index += 1) {
				const layout = layouts[index];
				if (!layout) {
					continue;
				}
				try {
					this.tracks[index].applyLayout(layout);
				} catch (error) {
					this.options.onError?.(error);
				}
			}
		} finally {
			this.options.onLayout?.();
		}
	}

	public destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		this.started = false;
		this.fontReadyGeneration += 1;
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;
		this.fontSet?.removeEventListener("loadingdone", this.onFontsLoaded);
		this.fontSet?.removeEventListener("loadingerror", this.onFontsLoaded);
		if (this.frame !== undefined && this.ownerWindow?.cancelAnimationFrame) {
			this.ownerWindow.cancelAnimationFrame(this.frame);
		}
		this.frame = undefined;
	}
}

const clientRectsFor = (element: HTMLElement): HighlightRect[] => {
	const elementRects = Array.from(element.getClientRects(), rectFrom).filter((rect) => rect.width > 0 && rect.height > 0);
	if (!element.textContent) {
		return elementRects;
	}
	const range = element.ownerDocument.createRange();
	try {
		range.selectNodeContents(element);
		const measurableRange = range as Range & { getClientRects?: () => DOMRectList };
		if (!measurableRange.getClientRects) {
			return elementRects;
		}
		const rangeRects = Array.from(measurableRange.getClientRects(), rectFrom).filter((rect) => rect.width > 0 && rect.height > 0);
		return rangeRects.length > 0 ? rangeRects : elementRects;
	} finally {
		range.detach();
	}
};

const directionFor = (element: HTMLElement, view: Window | null): HighlightDirection => {
	const direction = view?.getComputedStyle(element).direction || element.dir;
	return direction === "rtl" ? "rtl" : "ltr";
};

const fontSizeFor = (element: HTMLElement, view: Window | null): number => {
	const value = Number.parseFloat(view?.getComputedStyle(element).fontSize ?? "");
	return Number.isFinite(value) && value > 0 ? value : 16;
};

const rectFrom = (rect: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">): HighlightRect => ({
	left: rect.left,
	right: rect.right,
	top: rect.top,
	bottom: rect.bottom,
	width: rect.width,
	height: rect.height,
});

const positiveWeight = (value: number | undefined): number => (Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : 1);

const clampProgress = (value: number): number => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0);
