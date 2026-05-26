export const controlsStyles = `
.pip-controls {
	position: absolute;
	z-index: 2;
	left: 50%;
	bottom: 16px;
	display: inline-flex;
	gap: 4px;
	align-items: center;
	padding: 6px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	border-radius: 999px;
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(245, 246, 248, 0.82));
	backdrop-filter: blur(24px) saturate(1.35);
	box-shadow: 0 18px 46px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.84);
	opacity: 0;
	pointer-events: none;
	transform: translate(-50%, 8px) scale(0.98);
	transition: opacity 180ms ease, transform 220ms cubic-bezier(.2, .9, .2, 1);
	-webkit-app-region: no-drag;
}

#aura-lyrics-root.controls-visible .pip-controls,
#aura-lyrics-root.controls-visible .pip-close,
.pip-controls:focus-within,
.pip-close:focus-visible {
	opacity: 1;
	pointer-events: auto;
}

.pip-controls:focus-within,
#aura-lyrics-root.controls-visible .pip-controls {
	transform: translate(-50%, 0) scale(1);
}

.pip-controls button,
.pip-close {
	display: grid;
	place-items: center;
	width: 38px;
	height: 38px;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: rgba(5, 5, 5, 0.72);
	font: inherit;
	line-height: 1;
	transition: transform 150ms ease, background 150ms ease, color 150ms ease;
	-webkit-app-region: no-drag;
}

.pip-controls svg,
.pip-close svg {
	width: 19px;
	height: 19px;
	display: block;
}

.pip-controls svg path,
.pip-close svg path {
	fill: currentColor;
	stroke: currentColor;
	stroke-width: 0;
}

.pip-controls button:hover,
.pip-controls button:focus-visible,
.pip-close:hover,
.pip-close:focus-visible {
	background: rgba(5, 5, 5, 0.08);
	color: #050505;
	transform: scale(1.05);
	outline: none;
}

.pip-controls button:active,
.pip-close:active {
	transform: translateY(0) scale(0.98);
}

.pip-close {
	position: absolute;
	z-index: 3;
	right: 14px;
	top: 14px;
	width: 30px;
	height: 30px;
	background: rgba(255, 255, 255, 0.86);
	color: #050505;
	border: 1px solid rgba(255, 255, 255, 0.42);
	box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.1);
	opacity: 0;
	pointer-events: none;
	-webkit-app-region: no-drag;
}

.pip-close:hover,
.pip-close:focus-visible {
	background: rgba(255, 75, 75, 0.88);
	color: #fff;
}

.pip-close svg {
	width: 17px;
	height: 17px;
}

.pip-close svg path {
	fill: none;
	stroke-width: 2.5;
	stroke-linecap: round;
}

.pip-controls [data-control="toggle-play"] {
	width: 44px;
	height: 44px;
	margin-inline: 2px;
	background: rgba(255, 255, 255, 0.96);
	color: #111418;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.pip-controls [data-control="toggle-play"]:hover,
.pip-controls [data-control="toggle-play"]:focus-visible {
	background: #fff;
	color: #050607;
}

.pip-controls [data-control="toggle-play"] svg {
	width: 21px;
	height: 21px;
}
`;
