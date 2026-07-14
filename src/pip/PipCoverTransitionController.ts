export const COVER_CROSSFADE_DURATION_MS = 360;

type CoverPlane = {
	element: HTMLImageElement;
	url: string;
	generation: number;
	onLoad: () => void;
	onError: () => void;
	listenersAttached: boolean;
};

export class PipCoverTransitionController {
	private active?: CoverPlane;
	private pending?: CoverPlane;
	private crossfadeTimer?: number;
	private generation = 0;
	private hasCover = false;
	private destroyed = false;
	private readonly timerWindow: Window;

	public constructor(
		private readonly layer: HTMLElement,
		private readonly onAvailabilityChange?: (hasCover: boolean) => void
	) {
		const timerWindow = layer.ownerDocument.defaultView;
		if (!timerWindow) {
			throw new Error("Cover layer must belong to a document with a window.");
		}
		this.timerWindow = timerWindow;
		this.onAvailabilityChange?.(false);
	}

	public setCover(url: string | undefined, options: { animate?: boolean } = {}): void {
		if (this.destroyed) return;
		if (!url) {
			this.generation += 1;
			this.clearPlanes();
			this.setAvailability(false);
			return;
		}
		if (this.pending?.url === url) return;
		if (this.active?.url === url) {
			this.cancelPendingAndRestoreActive();
			return;
		}
		this.promoteLoadedIncoming();
		if (this.pending) {
			this.removePlane(this.pending);
			this.pending = undefined;
		}

		const generation = ++this.generation;
		const element = this.layer.ownerDocument.createElement("img");
		element.className = "pip-cover";
		element.dataset.coverState = "pending";
		element.setAttribute("aria-hidden", "true");
		element.alt = "";
		element.draggable = false;
		const plane: CoverPlane = {
			element,
			url,
			generation,
			onLoad: () => this.handleLoad(plane, options.animate !== false),
			onError: () => this.handleError(plane),
			listenersAttached: true,
		};
		element.addEventListener("load", plane.onLoad);
		element.addEventListener("error", plane.onError);
		this.pending = plane;
		this.layer.append(element);
		element.src = url;
	}

	public finish(): void {
		if (this.destroyed) return;
		this.promoteLoadedIncoming();
	}

	public destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.generation += 1;
		this.clearPlanes();
		this.setAvailability(false);
	}

	private handleLoad(plane: CoverPlane, animate: boolean): void {
		if (!this.isCurrent(plane)) return;
		this.detachListeners(plane);
		if (!this.active) {
			plane.element.dataset.coverState = "active";
			plane.element.style.transition = "none";
			this.active = plane;
			this.pending = undefined;
			this.setAvailability(true);
			return;
		}

		const outgoing = this.active;
		if (!animate) {
			this.removePlane(outgoing);
			plane.element.dataset.coverState = "active";
			plane.element.style.transition = "none";
			this.active = plane;
			this.pending = undefined;
			return;
		}

		outgoing.element.style.removeProperty("transition");
		outgoing.element.dataset.coverState = "outgoing";
		plane.element.style.removeProperty("transition");
		plane.element.dataset.coverState = "incoming";
		const generation = plane.generation;
		this.crossfadeTimer = this.timerWindow.setTimeout(() => {
			if (this.destroyed || generation !== this.generation || this.pending !== plane) return;
			this.removePlane(outgoing);
			plane.element.dataset.coverState = "active";
			this.active = plane;
			this.pending = undefined;
			this.crossfadeTimer = undefined;
		}, COVER_CROSSFADE_DURATION_MS);
	}

	private handleError(plane: CoverPlane): void {
		if (!this.isCurrent(plane)) return;
		this.generation += 1;
		this.clearPlanes();
		this.setAvailability(false);
	}

	private isCurrent(plane: CoverPlane): boolean {
		return !this.destroyed && plane.generation === this.generation && this.pending === plane;
	}

	private cancelPendingAndRestoreActive(): void {
		if (!this.pending || !this.active) return;
		this.generation += 1;
		this.clearCrossfadeTimer();
		this.removePlane(this.pending);
		this.pending = undefined;
		this.active.element.dataset.coverState = "active";
		this.active.element.style.transition = "none";
	}

	private promoteLoadedIncoming(): void {
		if (!this.pending || this.pending.element.dataset.coverState !== "incoming") return;
		this.clearCrossfadeTimer();
		if (this.active) this.removePlane(this.active);
		this.pending.element.dataset.coverState = "active";
		this.pending.element.style.transition = "none";
		this.active = this.pending;
		this.pending = undefined;
	}

	private clearPlanes(): void {
		this.clearCrossfadeTimer();
		if (this.active) this.removePlane(this.active);
		if (this.pending) this.removePlane(this.pending);
		this.active = undefined;
		this.pending = undefined;
	}

	private removePlane(plane: CoverPlane): void {
		this.detachListeners(plane);
		plane.element.remove();
	}

	private detachListeners(plane: CoverPlane): void {
		if (!plane.listenersAttached) return;
		plane.listenersAttached = false;
		plane.element.removeEventListener("load", plane.onLoad);
		plane.element.removeEventListener("error", plane.onError);
	}

	private clearCrossfadeTimer(): void {
		if (this.crossfadeTimer === undefined) return;
		this.timerWindow.clearTimeout(this.crossfadeTimer);
		this.crossfadeTimer = undefined;
	}

	private setAvailability(hasCover: boolean): void {
		if (this.hasCover === hasCover) return;
		this.hasCover = hasCover;
		this.onAvailabilityChange?.(hasCover);
	}
}
