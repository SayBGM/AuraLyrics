import { THEME_CSS_PROPERTIES } from "../shared/themeCssProperties";

export const SCENE_TRANSITION_DURATION_MS = 720;

export type SceneTransitionDirection = "up" | "next" | "previous";

export type SceneTransitionHandle = {
	generation: number;
	settled: Promise<{ generation: number; completed: boolean }>;
};

type PendingTransition = {
	cancelTimer: () => void;
	generation: number;
	incomingScene: HTMLElement;
	resolve: (result: { generation: number; completed: boolean }) => void;
};

const TRANSITION_CLASSES = ["scene-transition-up", "scene-transition-next", "scene-transition-previous"] as const;

export class SceneTransitionController {
	private generation = 0;
	private pending?: PendingTransition;
	private readonly root: HTMLElement;
	private readonly timerOwner: Window | null;

	public constructor(root: HTMLElement) {
		this.root = root;
		this.timerOwner = root.ownerDocument.defaultView;
	}

	public present(scene: HTMLElement, options: { direction?: SceneTransitionDirection; animate: boolean }): SceneTransitionHandle {
		const generation = ++this.generation;
		this.finishPending(false, true);
		const currentScene = this.root.firstElementChild as HTMLElement | null;
		if (!currentScene || !options.animate || options.direction === undefined) {
			this.clearTransitionClasses();
			this.root.replaceChildren(scene);
			return {
				generation,
				settled: Promise.resolve({ generation, completed: true }),
			};
		}

		const outgoing = this.createPlane("outgoing", currentScene);
		outgoing.setAttribute("aria-hidden", "true");
		outgoing.setAttribute("inert", "");
		outgoing.style.pointerEvents = "none";
		this.snapshotTheme(outgoing);
		const incoming = this.createPlane("incoming", scene);
		this.clearTransitionClasses();
		this.root.classList.add(`scene-transition-${options.direction}`);
		this.root.replaceChildren(outgoing, incoming);

		let resolve!: PendingTransition["resolve"];
		const settled = new Promise<{ generation: number; completed: boolean }>((settle) => {
			resolve = settle;
		});
		const cancelTimer = this.scheduleCompletion(generation);
		this.pending = { cancelTimer, generation, incomingScene: scene, resolve };
		return { generation, settled };
	}

	public cancel(): void {
		this.finishPending(false, true);
		this.clearTransitionClasses();
	}

	public destroy(): void {
		this.finishPending(false, false);
		this.clearTransitionClasses();
		this.root.replaceChildren();
	}

	private complete(generation: number): void {
		if (this.generation !== generation || this.pending?.generation !== generation) {
			return;
		}
		this.finishPending(true, true);
	}

	private finishPending(completed: boolean, promoteIncoming: boolean): void {
		const pending = this.pending;
		if (!pending) {
			return;
		}
		this.pending = undefined;
		pending.cancelTimer();
		if (promoteIncoming) {
			this.root.replaceChildren(pending.incomingScene);
		}
		this.clearTransitionClasses();
		pending.resolve({ generation: pending.generation, completed });
	}

	private createPlane(kind: "incoming" | "outgoing", scene: HTMLElement): HTMLElement {
		const plane = this.root.ownerDocument.createElement("div");
		plane.dataset.scenePlane = kind;
		plane.append(scene);
		return plane;
	}

	private snapshotTheme(outgoing: HTMLElement): void {
		const host = this.root.parentElement ?? this.root;
		const computedStyle = host.ownerDocument.defaultView?.getComputedStyle(host);
		if (computedStyle) {
			for (const property of THEME_CSS_PROPERTIES) {
				const value = computedStyle.getPropertyValue(property).trim();
				if (value) {
					outgoing.style.setProperty(property, value);
				}
			}
		}
		if (host.dataset.surfaceTone) {
			outgoing.dataset.surfaceTone = host.dataset.surfaceTone;
		}
	}

	private scheduleCompletion(generation: number): () => void {
		const owner = this.timerOwner;
		if (owner) {
			const timer = owner.setTimeout.call(owner, () => this.complete(generation), SCENE_TRANSITION_DURATION_MS);
			return () => owner.clearTimeout.call(owner, timer);
		}
		const timer = globalThis.setTimeout(() => this.complete(generation), SCENE_TRANSITION_DURATION_MS);
		return () => globalThis.clearTimeout(timer);
	}

	private clearTransitionClasses(): void {
		this.root.classList.remove(...TRANSITION_CLASSES);
	}
}
