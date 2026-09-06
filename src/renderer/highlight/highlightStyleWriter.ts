// Shared write path for the per-frame highlight DOM updates. Every writer keeps the
// last value it wrote in a caller-owned cache so an unchanged frame performs no CSSOM
// or DOMTokenList work at all — the values themselves stay byte-identical to what the
// individual components used to write inline.

export type LifecycleState = {
	active: boolean;
	sung: boolean;
	idle: boolean;
};

export type LifecycleClassCache = {
	active?: boolean;
	sung?: boolean;
	idle?: boolean;
};

export const createLifecycleCache = (): LifecycleClassCache => ({});

export const lifecycleUnchanged = (cache: LifecycleClassCache, state: LifecycleState): boolean =>
	cache.active === state.active && cache.sung === state.sung && cache.idle === state.idle;

export const applyLifecycleClasses = (element: HTMLElement, state: LifecycleState, cache: LifecycleClassCache): void => {
	if (cache.active !== state.active) {
		element.classList.toggle("active", state.active);
		cache.active = state.active;
	}
	if (cache.sung !== state.sung) {
		element.classList.toggle("sung", state.sung);
		cache.sung = state.sung;
	}
	if (cache.idle !== state.idle) {
		element.classList.toggle("idle", state.idle);
		cache.idle = state.idle;
	}
};

export type HighlightStyleValues = {
	scale: number;
	scaleX: number;
	scaleY: number;
	yOffset: number;
	rotationDeg: number;
	glow: number;
	ripple: number;
	progress: number;
};

export type HighlightStyleCache = {
	scale?: string;
	transform?: string;
	glowOpacity?: string;
	glowBlur?: string;
	progress?: string;
	progressRatio?: string;
	ripple?: string;
};

export const createHighlightStyleCache = (): HighlightStyleCache => ({});

/**
 * Writes the highlight transform/gradient/glow contract.
 *
 * `motionHost` carries the transform and the gradient progress; `glowHost` carries the
 * glow and ripple custom properties (the same element for syllables, the glyph layer for
 * whole lines).
 */
export const writeHighlightStyles = (
	motionHost: HTMLElement,
	glowHost: HTMLElement,
	values: HighlightStyleValues,
	glowStrength: number,
	cache: HighlightStyleCache
): void => {
	const scale = String(values.scale);
	if (cache.scale !== scale) {
		motionHost.style.scale = scale;
		cache.scale = scale;
	}
	const transform = `translateY(calc(var(--lyrics-size) * ${values.yOffset})) rotate(${values.rotationDeg}deg) scaleX(${values.scaleX}) scaleY(${values.scaleY})`;
	if (cache.transform !== transform) {
		motionHost.style.transform = transform;
		cache.transform = transform;
	}
	const progress = `${values.progress * 100}%`;
	if (cache.progress !== progress) {
		motionHost.style.setProperty("--highlight-progress", progress);
		cache.progress = progress;
	}
	const progressRatio = String(values.progress);
	if (cache.progressRatio !== progressRatio) {
		motionHost.style.setProperty("--highlight-progress-ratio", progressRatio);
		cache.progressRatio = progressRatio;
	}
	const effectiveGlow = values.glow * (glowStrength / 0.8);
	const glowOpacity = `${effectiveGlow * 100}%`;
	if (cache.glowOpacity !== glowOpacity) {
		glowHost.style.setProperty("--text-shadow-opacity", glowOpacity);
		cache.glowOpacity = glowOpacity;
	}
	const glowBlur = `${4 + effectiveGlow * 8}px`;
	if (cache.glowBlur !== glowBlur) {
		glowHost.style.setProperty("--text-shadow-blur-radius", glowBlur);
		cache.glowBlur = glowBlur;
	}
	const ripple = String(values.ripple);
	if (cache.ripple !== ripple) {
		glowHost.style.setProperty("--highlight-ripple", ripple);
		cache.ripple = ripple;
	}
};
