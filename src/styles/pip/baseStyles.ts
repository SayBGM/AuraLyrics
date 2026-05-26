export const baseStyles = `
html,
body {
	width: 100%;
	height: 100%;
	margin: 0;
	overflow: hidden;
	background: #050505;
	color: white;
	font-family: "DM Sans", Inter, spotify-circular, sans-serif;
	-webkit-app-region: drag;
	user-select: none;
}

#aura-lyrics-root {
	position: fixed;
	inset: 0;
	overflow: hidden;
	background: #050505;
	-webkit-app-region: drag;
	--pip-frame-size: clamp(12px, 3.4vmin, 18px);
	--pip-interlude-progress: 0;
	--pip-interlude-progress-percent: 0%;
}

.pip-cover {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	filter: blur(var(--background-blur, 36px)) saturate(var(--background-saturation, 1.15));
	transform: scale(1);
	transform-origin: center;
	opacity: 0.95;
	transition: transform 560ms cubic-bezier(.16, 1, .3, 1), filter 420ms ease, opacity 420ms ease;
}

#aura-lyrics-root.interlude-frame-active .pip-cover {
	transform: scale(0.94);
}

#aura-lyrics-root.album-art-mode .pip-cover {
	object-fit: contain;
	filter: none;
	transform: scale(1);
	opacity: 1;
	background: #050505;
}

.pip-scrim {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(circle at center, rgba(0, 0, 0, 0.24) 0%, rgba(0, 0, 0, var(--background-dim, 0.62)) 72%),
		rgba(0, 0, 0, var(--background-dim, 0.62));
}

.pip-vignette {
	position: absolute;
	inset: 0;
	background:
		linear-gradient(180deg, rgba(0, 0, 0, 0.38), transparent 24%, transparent 76%, rgba(0, 0, 0, 0.5)),
		radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, var(--vignette-strength, 0.55)) 78%);
}

#aura-lyrics-root.album-art-mode .pip-scrim,
#aura-lyrics-root.album-art-mode .pip-vignette,
#aura-lyrics-root.album-art-mode .pip-border-frame {
	opacity: 0;
}

.pip-border-frame {
	position: absolute;
	z-index: 2;
	inset: -1px;
	width: calc(100% + 2px);
	height: calc(100% + 2px);
	pointer-events: none;
	opacity: 0;
	border-radius: 0;
	transition: opacity 320ms ease;
}

#aura-lyrics-root.interlude-frame-active .pip-border-frame {
	opacity: 1;
}

.pip-frame-surface {
	position: absolute;
	inset: 0;
	box-sizing: border-box;
	border: var(--pip-frame-size) solid rgba(var(--pip-accent-rgb, 248, 248, 244), calc(0.36 + var(--pip-interlude-progress, 0) * 0.52));
	border-radius: 0;
	background: transparent;
	box-shadow:
		inset 0 0 0 1px rgba(255, 255, 255, 0.52),
		inset 0 18px 28px rgba(255, 255, 255, 0.16),
		inset 0 -18px 32px rgba(0, 0, 0, 0.26),
		0 0 calc((18px + 32px * var(--pip-interlude-progress, 0)) * var(--motion-intensity, 1)) rgba(var(--pip-accent-rgb, 255, 255, 255), calc(0.1 + var(--pip-interlude-progress, 0) * 0.18)),
		0 20px 44px rgba(0, 0, 0, 0.42);
	filter:
		saturate(calc(0.9 + var(--pip-interlude-progress, 0) * 0.6))
		brightness(calc(0.92 + var(--pip-interlude-progress, 0) * 0.22));
	transition: border-color 120ms linear, box-shadow 120ms linear, filter 120ms linear;
}

.pip-frame-surface::before,
.pip-frame-surface::after {
	content: "";
	position: absolute;
	inset: calc(-1 * var(--pip-frame-size));
	border-radius: 0;
	pointer-events: none;
}

.pip-frame-surface::before {
	border: 1px solid rgba(var(--pip-accent-rgb, 255, 255, 255), calc(0.44 + var(--pip-interlude-progress, 0) * 0.36));
	box-shadow:
		inset 0 1px 0 rgba(255, 255, 255, 0.75),
		inset 1px 0 0 rgba(255, 255, 255, 0.34),
		inset -1px 0 0 rgba(0, 0, 0, 0.2),
		inset 0 -1px 0 rgba(0, 0, 0, 0.34);
}

.pip-frame-surface::after {
	border: var(--pip-frame-size) solid rgba(var(--pip-accent-rgb, 255, 255, 255), calc(0.08 + var(--pip-interlude-progress, 0) * 0.2));
	box-shadow:
		inset 0 0 34px rgba(0, 0, 0, 0.58),
		0 0 calc((16px + 26px * var(--pip-interlude-progress, 0)) * var(--motion-intensity, 1)) rgba(var(--pip-accent-rgb, 255, 255, 255), calc(0.1 + var(--pip-interlude-progress, 0) * 0.18));
}

.pip-frame-inner-shadow {
	position: absolute;
	inset: var(--pip-frame-size);
	border-radius: 0;
	box-shadow:
		inset 0 0 42px rgba(0, 0, 0, 0.68),
		inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.pip-frame-progress {
	position: absolute;
	inset: -1px;
	pointer-events: none;
}

.pip-frame-progress-segment {
	position: absolute;
	background:
		linear-gradient(90deg, rgba(255, 255, 255, 0.96), rgba(var(--pip-accent-rgb, 255, 255, 255), 0.9));
	box-shadow:
		0 0 calc((16px + 26px * var(--pip-interlude-progress, 0)) * var(--motion-intensity, 1)) rgba(var(--pip-accent-rgb, 255, 255, 255), 0.28),
		inset 0 0 0 1px rgba(255, 255, 255, 0.46);
	opacity: calc(0.72 + var(--pip-interlude-progress, 0) * 0.28);
	transition: width 80ms linear, height 80ms linear, opacity 120ms linear;
}

.pip-frame-progress-top {
	top: 0;
	left: 0;
	width: calc(100% * var(--pip-frame-progress-top, 0));
	height: var(--pip-frame-size);
}

.pip-frame-progress-right {
	top: var(--pip-frame-size);
	right: 0;
	width: var(--pip-frame-size);
	height: calc((100% - (var(--pip-frame-size) * 2)) * var(--pip-frame-progress-right, 0));
	transform-origin: top;
}

.pip-frame-progress-bottom {
	right: 0;
	bottom: 0;
	width: calc(100% * var(--pip-frame-progress-bottom, 0));
	height: var(--pip-frame-size);
}

.pip-frame-progress-left {
	left: 0;
	bottom: var(--pip-frame-size);
	width: var(--pip-frame-size);
	height: calc((100% - (var(--pip-frame-size) * 2)) * var(--pip-frame-progress-left, 0));
	transform-origin: bottom;
}

.pip-content {
	position: relative;
	z-index: 1;
	height: 100%;
	display: grid;
	place-items: center;
	padding: 7vh 6vw;
	box-sizing: border-box;
	-webkit-app-region: drag;
	transform: translate3d(0, 0, 0) scale(1);
	transform-origin: center;
	filter: blur(0) saturate(1);
	opacity: 1;
	will-change: transform, filter, opacity;
	transition:
		transform 560ms cubic-bezier(.16, 1, .3, 1),
		filter 420ms ease,
		opacity 420ms ease;
}

#aura-lyrics-root.interlude-frame-active .pip-content {
	transform: translate3d(0, 0, 0) scale(0.875);
	filter: blur(calc(1.6px * var(--motion-intensity, 1))) saturate(0.86);
	opacity: 0.68;
}

#aura-lyrics-root.album-art-mode .pip-content {
	opacity: 0;
	pointer-events: none;
}

#aura-lyrics-root.reduce-motion .pip-content {
	transition: opacity 180ms ease;
	will-change: opacity;
}

#aura-lyrics-root.reduce-motion.interlude-frame-active .pip-content {
	transform: translate3d(0, 0, 0) scale(1);
	filter: blur(0) saturate(1);
	opacity: 0.78;
}

.aura-lyrics {
	--font-scale: 1;
	--lyrics-size: clamp(20px, calc(10.5vmin * var(--font-scale)), 54px);
	--inactive-blur: 0.85px;
	width: 100%;
	height: 100%;
	display: grid;
	place-items: center;
	color: rgba(255, 255, 255, 0.96);
	-webkit-app-region: drag;
	font-family: "DM Sans", Inter, spotify-circular, sans-serif;
}
`;
