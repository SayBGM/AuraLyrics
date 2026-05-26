const baseStyles = `
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

const lyricsStyles = `
.lyrics-viewport {
	width: 100%;
	height: 100%;
	position: relative;
	overflow: hidden;
	mask-image: linear-gradient(to bottom, transparent 0%, #000 9%, #000 91%, transparent 100%);
}

.lyrics-track {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	display: flex;
	flex-direction: column;
	gap: calc(var(--lyrics-size) * 0.62);
	margin: 0 12px;
	padding-block: 43vh;
	box-sizing: border-box;
	transition: transform 720ms cubic-bezier(.16, 1, .3, 1);
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
	--lyric-glow-bleed: calc(var(--lyrics-size) * 0.46);
	max-width: 80vw;
	padding-block: var(--lyric-glow-bleed);
	margin-block: calc(-1 * var(--lyric-glow-bleed));
	margin-inline: 0;
	color: inherit;
	font: inherit;
	text-align: inherit;
	opacity: 0.28;
	filter: blur(var(--inactive-blur));
	transform: translate3d(0, 0.12em, 0) scale(0.94);
	transform-origin: center;
	transition: opacity 420ms ease, transform 680ms cubic-bezier(.16, 1, .3, 1), filter 420ms ease;
	white-space: normal;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.lyrics-track.align-left .vocals-group,
.lyrics-track.align-natural .vocals-group {
	transform-origin: left center;
}

.vocals-group.active {
	--lyric-glow-bleed: calc(var(--lyrics-size) * 0.58);
	opacity: 1;
	filter: blur(0);
	transform: translate3d(0, 0, 0) scale(1.04);
}

.vocals-group.sung {
	opacity: 0.34;
	transform: translate3d(0, -0.12em, 0) scale(0.94);
}

.vocals-group.context-previous {
	opacity: 0.48;
	filter: blur(calc(var(--inactive-blur) * 0.55));
	transform: translate3d(0, -0.08em, 0) scale(0.94);
}

.vocals-group.context-next {
	opacity: 0.48;
	filter: blur(calc(var(--inactive-blur) * 0.55));
	transform: translate3d(0, -0.08em, 0) scale(0.94);
}

.vocals-group.out-of-context {
	opacity: 0;
	filter: blur(calc(var(--inactive-blur) * 1.8));
	transform: scale(0.92);
	pointer-events: none;
}

.syllable-group.has-parenthetical {
	width: min(80vw, 100%);
}

.lyric {
	display: inline;
	font-size: var(--lyrics-size);
	font-weight: 700;
	letter-spacing: -0.018em;
	word-spacing: 0.14em;
	line-height: 1.1;
	text-shadow: 0 0 var(--text-shadow-blur-radius, 4px) rgba(255, 255, 255, var(--text-shadow-opacity, 0%));
	transition: letter-spacing 360ms ease, word-spacing 360ms ease;
	white-space: normal;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.vocals-group.active .lyric {
	letter-spacing: -0.004em;
	word-spacing: 0.18em;
}

.line {
	display: block;
	color: rgba(255, 255, 255, 0.74);
	transition: color 420ms ease, text-shadow 520ms ease;
}

.line-group.active .line {
	color: rgba(255, 255, 255, 0.98);
	text-shadow:
		0 0 calc(18px * var(--motion-intensity, 1)) rgba(255, 255, 255, 0.22),
		0 16px 44px rgba(0, 0, 0, 0.32);
}

.line-group.sung .line {
	color: rgba(255, 255, 255, 0.52);
}

.line-group.context-previous .line,
.line-group.context-next .line {
	color: rgba(255, 255, 255, 0.72);
}

.vocals {
	display: inline-flex;
	flex-wrap: wrap;
	justify-content: inherit;
	column-gap: 0.18em;
	row-gap: 0.12em;
	max-width: 100%;
	white-space: normal;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.vocals.has-parenthetical {
	width: 100%;
}

.syllable-row {
	--parenthetical-echo-offset: calc(var(--lyrics-size) * 0.82);
	--parenthetical-echo-clearance: calc(var(--lyrics-size) * 0.38);
	display: grid;
	flex-basis: 100%;
	grid-template-columns: minmax(0, 1fr);
	align-items: baseline;
	max-width: 100%;
	width: 100%;
	padding-bottom: 0;
	opacity: 1;
	filter: blur(0);
	transition: opacity 420ms ease, filter 420ms ease;
}

.syllable-row.has-parenthetical-echo {
	padding-bottom: calc(var(--parenthetical-echo-offset) + var(--parenthetical-echo-clearance));
}

.syllable-row.context-previous {
	opacity: 0.48;
	filter: blur(calc(var(--inactive-blur) * 0.55));
}

.syllable-row.context-next {
	opacity: 0.48;
	filter: blur(calc(var(--inactive-blur) * 0.55));
}

.syllable-row.context-current {
	opacity: 1;
	filter: blur(0);
}

.syllable-row.out-of-context {
	opacity: 0;
	filter: blur(calc(var(--inactive-blur) * 1.8));
	pointer-events: none;
}

.syllable-main,
.syllable-echo {
	display: inline-flex;
	flex-wrap: wrap;
	column-gap: 0.24em;
	row-gap: 0.08em;
	min-width: 0;
	max-width: 100%;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.syllable-main {
	grid-area: 1 / 1;
	justify-content: flex-start;
	z-index: 0;
}

.syllable-echo {
	grid-area: 1 / 1;
	justify-content: end;
	justify-self: stretch;
	align-self: end;
	transform: translateY(var(--parenthetical-echo-offset));
	z-index: 1;
	pointer-events: none;
}

.word {
	display: inline-flex;
	flex-wrap: wrap;
	min-width: 0;
	max-width: 100%;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.parenthetical-word {
	opacity: 0.78;
}

.parenthetical-word .lyric {
	font-size: calc(var(--lyrics-size) * 0.72);
	letter-spacing: -0.035em;
}

.syllable-row.parenthetical-only .parenthetical-word .lyric {
	font-size: var(--lyrics-size);
}

.lyric-parenthetical-break {
	display: block;
	flex-basis: 100%;
	width: 100%;
	height: 0;
}

.lyric-parenthetical {
	display: inline;
}

.syllable {
	display: inline-block;
	background: linear-gradient(90deg, rgba(255, 255, 255, 1) var(--gradient-progress, 0%), rgba(226, 229, 234, 0.36) var(--gradient-progress, 0%));
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
	--interlude-progress: 0%;
}

.lyrics-track.align-left .interlude,
.lyrics-track.align-natural .interlude {
	align-self: center;
	text-align: center;
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
	opacity: 1;
}

#aura-lyrics-root.is-playing .interlude.active .interlude-pill {
	animation: interlude-breathe 1.45s ease-in-out infinite;
}

#aura-lyrics-root.is-playing .interlude.active .interlude-dot {
	animation: interlude-dot 1.1s ease-in-out infinite;
}

#aura-lyrics-root.is-playing .interlude.active .interlude-dot:nth-child(2) {
	animation-delay: 120ms;
}

#aura-lyrics-root.is-playing .interlude.active .interlude-dot:nth-child(3) {
	animation-delay: 240ms;
}

.interlude-wave {
	position: relative;
	display: inline-flex;
	gap: 0.19em;
	align-items: center;
	justify-content: center;
	min-width: min(42vw, calc(var(--lyrics-size) * 4.6));
	height: calc(var(--lyrics-size) * 1.18);
	padding: 0 calc(var(--lyrics-size) * 0.42);
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.085);
	box-shadow: 0 0 24px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.14);
	backdrop-filter: blur(12px);
}

.interlude-wave-bar {
	position: relative;
	z-index: 1;
	width: max(3px, calc(var(--lyrics-size) * 0.085));
	height: calc(var(--lyrics-size) * (0.22 + var(--bar-height, 0.5) * 0.76));
	border-radius: 999px;
	background:
		linear-gradient(
			180deg,
			rgba(255, 255, 255, calc(0.34 + var(--bar-fill-ratio, 0) * 0.56)),
			rgba(255, 255, 255, calc(0.18 + var(--bar-fill-ratio, 0) * 0.5))
		);
	opacity: calc(0.52 + var(--bar-fill-ratio, 0) * 0.46);
	box-shadow:
		0 0 calc((4px + var(--bar-fill-ratio, 0) * 12px) * var(--motion-intensity, 1)) rgba(255, 255, 255, calc(0.06 + var(--bar-fill-ratio, 0) * 0.18)),
		inset 0 1px 0 rgba(255, 255, 255, calc(0.1 + var(--bar-fill-ratio, 0) * 0.2));
	transform-origin: center;
	transition: background 120ms linear, opacity 120ms linear, box-shadow 120ms linear;
}

.interlude.active .interlude-wave {
	background: rgba(255, 255, 255, 0.1);
	box-shadow: 0 0 calc(26px * var(--motion-intensity, 1)) rgba(255, 255, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

#aura-lyrics-root.is-playing .interlude.active .interlude-wave-bar {
	animation: interlude-wave-live 1.32s ease-in-out infinite;
	animation-delay: calc(var(--bar-index, 0) * 62ms);
}

.aura-lyrics.interlude-active .line-group:not(.out-of-context),
.aura-lyrics.interlude-active .syllable-row:not(.out-of-context) {
	opacity: 0.24;
	filter: blur(calc(var(--inactive-blur) * 1.45));
	transform: translate3d(0, 0, 0) scale(0.96);
}

.aura-lyrics.interlude-active .line-group.context-current,
.aura-lyrics.interlude-active .syllable-row.context-current {
	opacity: 0.36;
	filter: blur(calc(var(--inactive-blur) * 0.95));
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

@keyframes interlude-wave-live {
	0%, 100% {
		transform: scaleY(0.86);
	}
	50% {
		transform: scaleY(1.08);
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
