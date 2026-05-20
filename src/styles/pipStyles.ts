const baseStyles = `
html,
body {
	width: 100%;
	height: 100%;
	margin: 0;
	overflow: hidden;
	background: #050505;
	color: white;
	font-family: spotify-circular, sans-serif;
	-webkit-app-region: drag;
	user-select: none;
}

#aura-lyrics-root {
	position: fixed;
	inset: 0;
	overflow: hidden;
	background: #050505;
	-webkit-app-region: drag;
}

.pip-cover {
	position: absolute;
	inset: -10%;
	width: 120%;
	height: 120%;
	object-fit: cover;
	filter: blur(var(--background-blur, 36px)) saturate(var(--background-saturation, 1.15));
	transform: scale(1.05);
	opacity: 0.95;
}

.pip-scrim {
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, var(--background-dim, 0.62));
}

.pip-vignette {
	position: absolute;
	inset: 0;
	background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, var(--vignette-strength, 0.55)) 82%);
}

.pip-content {
	position: relative;
	z-index: 1;
	height: 100%;
	display: grid;
	place-items: center;
	padding: 7vh 7vw;
	box-sizing: border-box;
	-webkit-app-region: drag;
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
}
`;

const controlsStyles = `
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
	background: linear-gradient(180deg, rgba(32, 34, 37, 0.82), rgba(13, 14, 16, 0.76));
	backdrop-filter: blur(24px) saturate(1.35);
	box-shadow: 0 18px 46px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.11);
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
	color: rgba(255, 255, 255, 0.92);
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
	background: rgba(255, 255, 255, 0.16);
	color: #fff;
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
	background: rgba(18, 20, 22, 0.72);
	color: #fff;
	border: 1px solid rgba(255, 255, 255, 0.16);
	box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.1);
	opacity: 0;
	pointer-events: none;
	-webkit-app-region: no-drag;
}

.pip-close:hover,
.pip-close:focus-visible {
	background: rgba(255, 75, 75, 0.88);
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

const lyricsStyles = `
.lyrics-viewport {
	width: 100%;
	height: 100%;
	position: relative;
	overflow: hidden;
	mask-image: linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%);
}

.lyrics-track {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	display: flex;
	flex-direction: column;
	gap: calc(var(--lyrics-size) * 0.55);
	padding-block: 42vh;
	box-sizing: border-box;
	transition: transform 520ms cubic-bezier(.2, .9, .2, 1);
	will-change: transform;
}

.lyrics-track.align-center {
	text-align: center;
	align-items: center;
}

.lyrics-track.align-left,
.lyrics-track.align-natural {
	text-align: left;
	align-items: flex-start;
}

.vocals-group {
	padding: 0;
	margin: 0;
	color: inherit;
	font: inherit;
	text-align: inherit;
	opacity: 0.28;
	filter: blur(var(--inactive-blur));
	transform: scale(0.96);
	transition: opacity 360ms ease, transform 520ms cubic-bezier(.2, .9, .2, 1), filter 360ms ease;
}

.vocals-group.active {
	opacity: 1;
	filter: blur(0);
	transform: scale(1);
}

.vocals-group.sung {
	opacity: 0.42;
}

.vocals-group.out-of-context {
	opacity: 0;
	filter: blur(calc(var(--inactive-blur) * 1.8));
	transform: scale(0.92);
	pointer-events: none;
}

.lyric {
	font-size: var(--lyrics-size);
	font-weight: 800;
	letter-spacing: -0.045em;
	line-height: 1.05;
	text-shadow: 0 0 var(--text-shadow-blur-radius, 4px) rgba(255, 255, 255, var(--text-shadow-opacity, 0%));
}

.line {
	color: rgba(255, 255, 255, 0.74);
	transition: color 360ms ease, text-shadow 420ms ease, letter-spacing 420ms ease;
}

.line-group.active .line {
	color: rgba(255, 255, 255, 0.98);
	letter-spacing: -0.055em;
	text-shadow: 0 0 calc(18px * var(--motion-intensity, 1)) rgba(255, 255, 255, 0.24);
}

.line-group.sung .line {
	color: rgba(255, 255, 255, 0.52);
}

.vocals {
	display: inline-flex;
	flex-wrap: wrap;
	justify-content: inherit;
	gap: 0.18em;
}

.word {
	display: inline-flex;
}

.syllable {
	display: inline-block;
	background: linear-gradient(90deg, #fff var(--gradient-progress, 0%), rgba(255, 255, 255, 0.32) var(--gradient-progress, 0%));
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	will-change: transform, scale;
}

.provider-source {
	margin-top: calc(var(--lyrics-size) * 0.12);
	font-size: max(10px, calc(var(--lyrics-size) * 0.34));
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: rgba(255, 255, 255, 0.42);
	text-shadow: 0 1px 10px rgba(0, 0, 0, 0.28);
}
`;

const interludeStyles = `
.interlude {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	transform-origin: center;
}

.interlude-pill {
	position: relative;
	display: inline-flex;
	gap: 0.34em;
	align-items: center;
	justify-content: center;
	padding: 0.34em 0.58em;
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.1);
	box-shadow: 0 0 24px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.14);
	backdrop-filter: blur(12px);
}

.interlude.active .interlude-pill {
	animation: interlude-breathe 1.45s ease-in-out infinite;
	background: rgba(255, 255, 255, 0.18);
	box-shadow: 0 0 calc(28px * var(--motion-intensity, 1)) rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.interlude-dot {
	width: 0.34em;
	height: 0.34em;
	border-radius: 999px;
	background: currentColor;
	opacity: 0.82;
	box-shadow: 0 0 10px currentColor;
}

.interlude.active .interlude-dot {
	animation: interlude-dot 1.1s ease-in-out infinite;
	opacity: 1;
}

.interlude.active .interlude-dot:nth-child(2) {
	animation-delay: 120ms;
}

.interlude.active .interlude-dot:nth-child(3) {
	animation-delay: 240ms;
}

@keyframes interlude-breathe {
	0%, 100% {
		transform: scale(1);
	}
	50% {
		transform: scale(1.08);
	}
}

@keyframes interlude-dot {
	0%, 100% {
		transform: translateY(0) scale(0.92);
	}
	50% {
		transform: translateY(-0.1em) scale(1.24);
	}
}
`;

const statusStyles = `
.status-card {
	display: grid;
	gap: 10px;
	place-items: center;
	padding: 24px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 24px;
	background: rgba(10, 10, 10, 0.42);
	backdrop-filter: blur(18px);
	text-align: center;
}

.status-card strong {
	font-size: 22px;
}

.status-card span {
	font-size: 13px;
	opacity: 0.72;
}

.status-card button {
	-webkit-app-region: no-drag;
	border: 0;
	border-radius: 999px;
	padding: 8px 14px;
	background: rgba(255, 255, 255, 0.92);
	color: #111;
	font-weight: 700;
}
`;

export const pipStyles = [baseStyles, controlsStyles, lyricsStyles, interludeStyles, statusStyles].join("\n");
