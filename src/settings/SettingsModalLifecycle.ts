export type SettingsPanelState = {
	controlId?: string;
	scrollTop: number;
	selectionEnd?: number | null;
	selectionStart?: number | null;
};

type SettingsModalLifecycleHooks = {
	onAttached(): void;
	onDetached(): void;
	onRequestClose(): void;
};

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(",");

export class SettingsModalLifecycle {
	private attachGuardTimer?: number;
	private container?: HTMLElement;
	private hooks?: SettingsModalLifecycleHooks;
	private keyListener?: (event: KeyboardEvent) => void;
	private modalFocusScope?: HTMLElement;
	private observer?: MutationObserver;
	private previousFocus?: HTMLElement;

	public constructor(
		private readonly hostWindow: Window & typeof globalThis,
		private readonly ownerDocument: Document
	) {}

	public prepare(container: HTMLElement, hooks: SettingsModalLifecycleHooks): void {
		const previousFocus = this.container ? this.previousFocus : this.focusedElement();
		this.cleanup(true, true);
		this.previousFocus = previousFocus;
		this.container = container;
		this.hooks = hooks;
		this.ownerDocument.body.classList.add("aura-lyrics-settings-open");
	}

	public start(): void {
		const container = this.container;
		if (!container) {
			return;
		}
		if (container.isConnected) {
			this.onContainerAttached(container);
		}
		let wasConnected = container.isConnected;
		const observer = new this.hostWindow.MutationObserver(() => {
			if (this.observer !== observer) {
				return;
			}
			if (container.isConnected) {
				if (!wasConnected) {
					this.onContainerAttached(container);
				}
				wasConnected = true;
				this.clearAttachGuardTimer();
				return;
			}
			if (wasConnected) {
				this.cleanupDetachedContainer(container, observer);
			}
		});
		this.observer = observer;
		observer.observe(this.ownerDocument.body, { childList: true, subtree: true });
		if (!wasConnected) {
			this.attachGuardTimer = this.hostWindow.setTimeout(() => {
				this.attachGuardTimer = undefined;
				if (this.observer !== observer) {
					return;
				}
				if (container.isConnected) {
					wasConnected = true;
					this.onContainerAttached(container);
					return;
				}
				this.cleanupDetachedContainer(container, observer);
			}, 0);
		}
	}

	public destroy(onHide: () => void): void {
		const container = this.container;
		const shouldHide = container?.isConnected === true;
		const shouldRestore = this.shouldRestorePreviousFocus(container);
		this.cleanup(true, true);
		if (shouldHide) {
			onHide();
		}
		this.restorePreviousFocus(shouldRestore);
	}

	public capturePanelState(scroller: HTMLElement | undefined): SettingsPanelState {
		const state: SettingsPanelState = { scrollTop: scroller?.scrollTop ?? 0 };
		const controlDocument = scroller?.ownerDocument ?? this.ownerDocument;
		const realm = this.realmFor(controlDocument);
		const active = controlDocument.activeElement;
		if (!(active instanceof realm.HTMLElement) || !scroller?.contains(active)) {
			return state;
		}
		state.controlId = active.dataset.controlId;
		if (active instanceof realm.HTMLInputElement) {
			state.selectionStart = active.selectionStart;
			state.selectionEnd = active.selectionEnd;
		}
		return state;
	}

	public restorePanelState(scroller: HTMLElement | undefined, state: SettingsPanelState, onFallbackFocus: () => void): void {
		if (!scroller) {
			return;
		}
		scroller.scrollTop = state.scrollTop;
		if (!state.controlId) {
			return;
		}
		const control = scroller.querySelector<HTMLElement>(`[data-control-id="${state.controlId}"]`);
		const realm = this.realmFor(scroller.ownerDocument);
		if (control instanceof realm.HTMLButtonElement && control.disabled) {
			this.focusNearestReorderControl(scroller, control, onFallbackFocus);
		} else if (control) {
			control.focus();
		} else if (state.controlId.startsWith("provider-") && (state.controlId.endsWith("-up") || state.controlId.endsWith("-down"))) {
			onFallbackFocus();
		}
		if (control instanceof realm.HTMLInputElement && state.selectionStart != null && state.selectionEnd != null) {
			try {
				control.setSelectionRange(state.selectionStart, state.selectionEnd);
			} catch {
				// Number and range inputs do not support a text selection.
			}
		}
	}

	private onContainerAttached(container: HTMLElement): void {
		this.detachKeyboardListener();
		this.modalFocusScope = container.closest<HTMLElement>(".main-trackCreditsModal-container") ?? container.parentElement ?? container;
		const listener = (event: KeyboardEvent): void => this.onModalKeyDown(event);
		this.keyListener = listener;
		this.modalFocusScope.addEventListener("keydown", listener);
		this.hooks?.onAttached();
	}

	private onModalKeyDown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.hooks?.onRequestClose();
			return;
		}
		if (event.key !== "Tab" || !this.modalFocusScope) {
			return;
		}
		const focusable = Array.from(this.modalFocusScope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) =>
			this.isFocusable(element)
		);
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = this.modalFocusScope.ownerDocument.activeElement;
		const activeIndex = focusable.indexOf(active as HTMLElement);
		if (activeIndex < 0) {
			event.preventDefault();
			if (event.shiftKey) {
				last.focus();
			} else {
				first.focus();
			}
		} else if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	private isFocusable(element: HTMLElement): boolean {
		if (element.tabIndex < 0 || !element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) {
			return false;
		}
		if ("disabled" in element && element.disabled === true) {
			return false;
		}
		const realm = this.realmFor(element.ownerDocument);
		for (let current: HTMLElement | null = element; current; current = current.parentElement) {
			const style = realm.getComputedStyle(current);
			if (style.display === "none" || style.visibility === "hidden") {
				return false;
			}
		}
		return true;
	}

	private cleanupDetachedContainer(container: HTMLElement, observer: MutationObserver): void {
		if (this.observer !== observer || this.container !== container) {
			return;
		}
		const shouldRestore = this.shouldRestorePreviousFocus(container);
		this.cleanup(false, true);
		this.restorePreviousFocus(shouldRestore);
	}

	private shouldRestorePreviousFocus(container: HTMLElement | undefined): boolean {
		if (this.hasConnectedReplacementModal()) {
			return false;
		}
		const active = this.focusedElement();
		const focusIsInsideOwnedModal =
			active !== undefined &&
			container?.isConnected === true &&
			this.modalFocusScope?.contains(container) === true &&
			this.modalFocusScope.contains(active);
		return (
			active === this.ownerDocument.body ||
			(active !== undefined && !active.isConnected) ||
			(active !== undefined && container?.contains(active) === true) ||
			focusIsInsideOwnedModal
		);
	}

	private hasConnectedReplacementModal(): boolean {
		return Array.from(this.ownerDocument.querySelectorAll<HTMLElement>(".main-trackCreditsModal-container")).some(
			(modal) => modal.isConnected && modal !== this.modalFocusScope
		);
	}

	private cleanup(removeContainer: boolean, notifyDetached: boolean): void {
		this.clearAttachGuardTimer();
		this.observer?.disconnect();
		this.observer = undefined;
		this.detachKeyboardListener();
		if (removeContainer) {
			this.container?.remove();
		}
		const hooks = this.hooks;
		this.container = undefined;
		this.hooks = undefined;
		this.modalFocusScope = undefined;
		this.ownerDocument.body.classList.remove("aura-lyrics-settings-open");
		if (notifyDetached) {
			hooks?.onDetached();
		}
	}

	private detachKeyboardListener(): void {
		if (this.modalFocusScope && this.keyListener) {
			this.modalFocusScope.removeEventListener("keydown", this.keyListener);
		}
		this.keyListener = undefined;
	}

	private focusNearestReorderControl(scroller: HTMLElement, control: HTMLButtonElement, onFallbackFocus: () => void): void {
		const controls = Array.from(scroller.querySelectorAll<HTMLButtonElement>(".icon-button"));
		const index = controls.indexOf(control);
		for (let distance = 1; distance < controls.length; distance += 1) {
			const previous = controls[index - distance];
			if (previous && !previous.disabled) {
				previous.focus();
				return;
			}
			const next = controls[index + distance];
			if (next && !next.disabled) {
				next.focus();
				return;
			}
		}
		onFallbackFocus();
	}

	private focusedElement(): HTMLElement | undefined {
		const active = this.ownerDocument.activeElement;
		return active instanceof this.realmFor(this.ownerDocument).HTMLElement ? active : undefined;
	}

	private realmFor(ownerDocument: Document): Window & typeof globalThis {
		return (ownerDocument.defaultView ?? this.hostWindow) as Window & typeof globalThis;
	}

	private restorePreviousFocus(shouldRestore: boolean): void {
		const previousFocus = this.previousFocus;
		this.previousFocus = undefined;
		if (shouldRestore && previousFocus?.isConnected) {
			previousFocus.focus();
		}
	}

	private clearAttachGuardTimer(): void {
		if (this.attachGuardTimer !== undefined) {
			this.hostWindow.clearTimeout(this.attachGuardTimer);
			this.attachGuardTimer = undefined;
		}
	}
}
