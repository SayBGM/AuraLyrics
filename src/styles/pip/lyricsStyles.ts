export const lyricsStyles = `
.aura-lyrics {
	position: relative;
}

.lyrics-viewport {
	width: 100%;
	height: 100%;
	position: relative;
	overflow: hidden;
	mask-image: linear-gradient(to bottom, transparent 0%, #000 9%, #000 91%, transparent 100%);
}

.static-lyrics-viewport {
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-color: rgba(var(--pip-foreground-rgb), 0.34) transparent;
	scrollbar-width: thin;
	mask-image: linear-gradient(to bottom, transparent 0%, #000 5%, #000 95%, transparent 100%);
	-webkit-app-region: no-drag;
}

.static-lyrics-viewport:focus-visible {
	outline: 2px solid rgba(var(--pip-foreground-rgb), 0.72);
	outline-offset: -4px;
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

.static-lyrics-track {
	position: relative;
	min-height: 100%;
	gap: calc(var(--lyrics-size) * 0.46);
	margin: 0;
	padding: 10vh 5vw 16vh;
	transform: none !important;
	transition: none;
	will-change: auto;
	user-select: text;
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
	--lyric-letter-spacing: -0.018em;
	--lyric-word-spacing: 0.08em;
	--lyric-layout-bleed: calc(var(--lyrics-size) * 0.58);
	max-width: 80vw;
	padding-block: var(--lyric-layout-bleed);
	margin-block: calc(-1 * var(--lyric-layout-bleed));
	margin-inline: 0;
	color: inherit;
	font: inherit;
	text-align: inherit;
	opacity: 1;
	filter: blur(0);
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

.lyrics-track.align-center .vocals-group.opposite-aligned {
	align-self: center;
}

.lyrics-track.align-natural .vocals-group.opposite-aligned {
	align-self: flex-end;
	text-align: right;
	transform-origin: right center;
}

.lyrics-track.align-left .vocals-group.opposite-aligned {
	align-self: flex-start;
	text-align: left;
	transform-origin: left center;
}

.lyrics-track.align-natural .vocals-group.opposite-aligned .vocals,
.lyrics-track.align-natural .vocals-group.opposite-aligned .syllable-main {
	justify-content: flex-end;
}

.lyrics-track.align-left .vocals-group .vocals,
.lyrics-track.align-left .vocals-group .syllable-main {
	justify-content: flex-start;
}

.lyrics-track.align-center .vocals-group .vocals,
.lyrics-track.align-center .vocals-group .syllable-main {
	justify-content: center;
}

.lyrics-track .vocals-group .syllable-echo {
	justify-content: flex-end;
	text-align: right;
}

.vocals-group.active {
	opacity: 1;
	filter: blur(0);
	transform: translate3d(0, 0, 0) scale(1.04);
}

.vocals-group.sung {
	opacity: 1;
	transform: translate3d(0, -0.12em, 0) scale(0.94);
}

.vocals-group.context-previous {
	opacity: 1;
	filter: blur(0);
	transform: translate3d(0, -0.08em, 0) scale(0.94);
}

.vocals-group.context-next {
	opacity: 1;
	filter: blur(0);
	transform: translate3d(0, -0.08em, 0) scale(0.94);
}

.vocals-group.out-of-context {
	opacity: 0;
	filter: blur(calc(var(--inactive-blur) * 1.8));
	transform: scale(0.92);
	pointer-events: none;
}

.static-line {
	width: min(86vw, 76ch);
	max-width: min(86vw, 76ch);
	padding: 0;
	margin: 0;
	opacity: 1;
	filter: none;
	transform: none;
}

.static-line .line {
	color: var(--pip-foreground-color);
}

.syllable-group.has-parenthetical {
	width: min(80vw, 100%);
}

.lyric {
	display: inline;
	font-size: var(--lyrics-size);
	font-weight: 700;
	letter-spacing: var(--lyric-letter-spacing);
	word-spacing: var(--lyric-word-spacing);
	line-height: 1.1;
	text-shadow: 0 0 var(--text-shadow-blur-radius, 4px) rgba(var(--pip-glow-rgb), var(--text-shadow-opacity, 0%));
	white-space: normal;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.line {
	--lyric-letter-spacing: -0.018em;
	--lyric-word-spacing: 0.08em;
	display: block;
	letter-spacing: var(--lyric-letter-spacing);
	word-spacing: var(--lyric-word-spacing);
	color: var(--pip-muted-foreground-color);
	transition: color 420ms ease, text-shadow 520ms ease;
}

.line-group.active .line {
	--text-shadow-opacity: 34%;
	--text-shadow-blur-radius: calc(12px * var(--motion-intensity, 1));
	color: var(--pip-foreground-color);
	text-shadow:
		0 0 var(--text-shadow-blur-radius) rgba(var(--pip-glow-rgb), var(--text-shadow-opacity)),
		0 0 calc(18px * var(--motion-intensity, 1)) rgba(var(--pip-glow-rgb), 0.22),
		0 16px 44px rgba(var(--pip-scrim-rgb), 0.32);
}

.line-group.sung .line {
	color: var(--pip-muted-foreground-color);
}

.line-group.context-previous .line,
.line-group.context-next .line {
	color: var(--pip-muted-foreground-color);
}

.lyric-translation {
	display: block;
	margin-top: calc(var(--lyrics-size) * 0.16);
	font-size: calc(var(--lyrics-size) * 0.52);
	font-weight: 600;
	letter-spacing: -0.01em;
	word-spacing: 0.04em;
	line-height: 1.3;
	color: var(--pip-muted-foreground-color);
	text-shadow: 0 1px 12px rgba(var(--pip-scrim-rgb), 0.28);
	transition: color 420ms ease;
	white-space: normal;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.vocals-group.active .lyric-translation {
	color: var(--pip-muted-foreground-color);
}

.vocals-group.sung .lyric-translation {
	color: var(--pip-muted-foreground-color);
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

.vocals.background {
	margin-top: calc(var(--lyrics-size) * 0.12);
	opacity: 0.64;
	filter: saturate(0.92);
}

.vocals.background .lyric {
	font-size: calc(var(--lyrics-size) * 0.74);
	font-weight: 700;
}

.vocals-group.active .vocals.background {
	opacity: 0.78;
}

.vocals.has-parenthetical {
	width: 100%;
}

.syllable-row {
	display: grid;
	flex-basis: 100%;
	grid-template-columns: minmax(0, 1fr);
	grid-template-rows: auto auto;
	align-items: start;
	max-width: 100%;
	width: 100%;
	padding: 0;
	opacity: 1;
	filter: blur(0);
	transition: opacity 420ms ease, filter 420ms ease;
}

.syllable-row.has-parenthetical-echo {
	row-gap: calc(var(--lyrics-size) * 0.04);
}

.syllable-row.parenthetical-only {
	grid-template-rows: auto;
	row-gap: 0;
}

.syllable-row.parenthetical-only .syllable-main:empty,
.syllable-echo:empty {
	display: none;
}

.syllable-row.context-previous {
	opacity: 1;
	filter: blur(0);
}

.syllable-row.context-next {
	opacity: 1;
	filter: blur(0);
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
	grid-area: 2 / 1;
	justify-content: end;
	justify-self: stretch;
	align-self: start;
	text-align: right;
	z-index: 1;
	pointer-events: none;
}

.syllable-row.parenthetical-only .syllable-echo {
	grid-area: 1 / 1;
}

.word {
	display: inline-flex;
	flex-wrap: wrap;
	letter-spacing: var(--lyric-letter-spacing);
	word-spacing: var(--lyric-word-spacing);
	min-width: 0;
	max-width: 100%;
	overflow-wrap: break-word;
	word-break: keep-all;
}

.line .word .lyric,
.line .word .syllable {
	letter-spacing: inherit;
	word-spacing: inherit;
	text-shadow: inherit;
}

.korean-tail-word {
	column-gap: 0;
}

.korean-tail-base {
	display: inline-block;
}

.korean-tail-sustain {
	display: inline-block;
	transform-origin: center;
}

.korean-tail-sustain.active {
	filter: saturate(1.08);
	text-shadow:
		0 0 calc(var(--text-shadow-blur-radius, 8px) * 1.25) rgba(var(--pip-glow-rgb), var(--text-shadow-opacity, 0%)),
		0 10px 28px rgba(var(--pip-glow-rgb), 0.12);
}

.korean-melisma-sustain.active {
	filter: saturate(calc(1.08 + var(--melisma-step, 0) * 0.025));
	text-shadow:
		0 0 calc(var(--text-shadow-blur-radius, 8px) * (1.25 + var(--melisma-step, 0) * 0.08)) rgba(var(--pip-glow-rgb), var(--text-shadow-opacity, 0%)),
		0 10px 34px rgba(var(--pip-glow-rgb), calc(0.12 + var(--melisma-step, 0) * 0.025));
}

.parenthetical-word {
	opacity: 0.78;
}

.parenthetical-word .lyric {
	font-size: calc(var(--lyrics-size) * 0.72);
	letter-spacing: -0.035em;
}

.syllable-row.standalone-parenthetical .parenthetical-word .lyric {
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
	--highlight-angle: 90deg;
	display: inline-block;
	position: relative;
	isolation: isolate;
	letter-spacing: var(--lyric-letter-spacing);
	word-spacing: var(--lyric-word-spacing);
	background: linear-gradient(
		var(--highlight-angle),
		var(--pip-foreground-color) var(--highlight-progress, 0%),
		var(--pip-muted-foreground-color) var(--highlight-progress, 0%)
	);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	will-change: transform, scale;
}

.line.highlight-target {
	--highlight-angle: 90deg;
	position: relative;
	isolation: isolate;
	transform-origin: center;
	will-change: transform, scale;
}

.highlight-target:dir(rtl) {
	--highlight-angle: 270deg;
}

.syllable-group.sung .syllable,
.syllable-row.context-previous .syllable,
.syllable-row.context-next .syllable {
	background: none;
	color: var(--pip-muted-foreground-color);
}

.aura-lyrics.synthetic-timing[data-highlight-effect="fill"] .syllable.active {
	background: linear-gradient(
		var(--highlight-angle),
		var(--pip-foreground-color) 0%,
		var(--pip-foreground-color) max(0%, calc(var(--highlight-progress, 0%) - 8%)),
		var(--pip-synthetic-wake-color) var(--highlight-progress, 0%),
		var(--pip-muted-foreground-color) var(--highlight-progress, 0%)
	);
	-webkit-background-clip: text;
	background-clip: text;
}

.aura-lyrics[data-highlight-effect="fill"] .line.highlight-target,
.aura-lyrics[data-highlight-effect="fill"] .syllable.highlight-target {
	background: linear-gradient(
		var(--highlight-angle),
		var(--pip-foreground-color) 0 var(--highlight-progress, 0%),
		var(--pip-muted-foreground-color) var(--highlight-progress, 0%) 100%
	);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}

.aura-lyrics[data-highlight-effect="glow-sweep"] .line.highlight-target,
.aura-lyrics[data-highlight-effect="glow-sweep"] .syllable.highlight-target {
	background: linear-gradient(
		var(--highlight-angle),
		var(--pip-foreground-color) 0 max(0%, calc(var(--highlight-progress, 0%) - 12%)),
		var(--pip-synthetic-wake-color) var(--highlight-progress, 0%),
		var(--pip-muted-foreground-color) min(100%, calc(var(--highlight-progress, 0%) + 12%)) 100%
	);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	text-shadow:
		0 0 calc(var(--text-shadow-blur-radius, 6px) * 1.25) rgba(var(--pip-glow-rgb), var(--text-shadow-opacity, 0%)),
		0 0 calc(var(--lyrics-size) * 0.28) rgba(var(--pip-glow-rgb), calc(var(--highlight-progress-ratio, 0) * 0.2));
}

.aura-lyrics[data-highlight-effect="underline"] .line.highlight-target,
.aura-lyrics[data-highlight-effect="underline"] .syllable.highlight-target,
.aura-lyrics[data-highlight-effect="marker"] .line.highlight-target,
.aura-lyrics[data-highlight-effect="marker"] .syllable.highlight-target {
	background: linear-gradient(
		var(--highlight-angle),
		var(--pip-foreground-color) 0 var(--highlight-progress, 0%),
		var(--pip-muted-foreground-color) var(--highlight-progress, 0%) 100%
	);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}

.aura-lyrics[data-highlight-effect="underline"] .highlight-target::after,
.aura-lyrics[data-highlight-effect="marker"] .highlight-target::before {
	content: "";
	position: absolute;
	left: 0;
	right: 0;
	z-index: -1;
	pointer-events: none;
	transform: scaleX(var(--highlight-progress-ratio, 0));
	transform-origin: left center;
}

.aura-lyrics[data-highlight-effect="underline"] .highlight-target:dir(rtl)::after,
.aura-lyrics[data-highlight-effect="marker"] .highlight-target:dir(rtl)::before {
	transform-origin: right center;
}

.aura-lyrics[data-highlight-effect="underline"] .highlight-target::after {
	bottom: -0.08em;
	height: max(2px, 0.07em);
	border-radius: 999px;
	background: var(--pip-synthetic-wake-color);
	box-shadow: 0 0 0.24em rgba(var(--pip-glow-rgb), 0.32);
}

.aura-lyrics[data-highlight-effect="marker"] .highlight-target::before {
	top: 48%;
	bottom: 0.02em;
	border-radius: 0.14em 0.24em 0.18em 0.1em;
	background: rgba(var(--pip-accent-rgb), 0.34);
	box-shadow: 0 0 0.18em rgba(var(--pip-glow-rgb), 0.14);
}

.aura-lyrics[data-highlight-effect="outline-fill"] .line.highlight-target,
.aura-lyrics[data-highlight-effect="outline-fill"] .syllable.highlight-target {
	background: linear-gradient(
		var(--highlight-angle),
		var(--pip-synthetic-wake-color) 0 var(--highlight-progress, 0%),
		transparent var(--highlight-progress, 0%) 100%
	);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	-webkit-text-stroke: max(1px, 0.025em) rgba(var(--pip-muted-rgb), 0.92);
}

.aura-lyrics[data-highlight-effect="spotlight"] .line.highlight-target,
.aura-lyrics[data-highlight-effect="spotlight"] .syllable.highlight-target {
	background: linear-gradient(
		var(--highlight-angle),
		var(--pip-muted-foreground-color) 0 max(0%, calc(var(--highlight-progress, 0%) - 18%)),
		var(--pip-foreground-color) max(0%, calc(var(--highlight-progress, 0%) - 7%)),
		var(--pip-synthetic-wake-color) var(--highlight-progress, 0%),
		var(--pip-muted-foreground-color) min(100%, calc(var(--highlight-progress, 0%) + 10%)) 100%
	);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}

.aura-lyrics[data-highlight-motion="ripple"] .highlight-target.active {
	box-shadow:
		0 0 0 calc(var(--lyrics-size) * var(--highlight-ripple, 0) * 0.08) rgba(var(--pip-glow-rgb), calc(var(--highlight-ripple, 0) * 0.18)),
		0 0 calc(var(--lyrics-size) * var(--highlight-ripple, 0) * 0.32) rgba(var(--pip-glow-rgb), calc(var(--highlight-ripple, 0) * 0.2));
	border-radius: 0.18em;
}

.syllable-group.sung .highlight-target,
.syllable-row.context-previous .highlight-target,
.syllable-row.context-next .highlight-target,
.line-group.sung .highlight-target,
.line-group.context-previous .highlight-target,
.line-group.context-next .highlight-target {
	background: none;
	box-shadow: none;
	color: var(--pip-muted-foreground-color);
	-webkit-text-stroke: 0;
}

.syllable-group.sung .highlight-target::before,
.syllable-group.sung .highlight-target::after,
.syllable-row.context-previous .highlight-target::before,
.syllable-row.context-previous .highlight-target::after,
.syllable-row.context-next .highlight-target::before,
.syllable-row.context-next .highlight-target::after,
.line-group.sung .highlight-target::before,
.line-group.sung .highlight-target::after,
.line-group.context-previous .highlight-target::before,
.line-group.context-previous .highlight-target::after,
.line-group.context-next .highlight-target::before,
.line-group.context-next .highlight-target::after {
	display: none;
}

.aura-lyrics.synthetic-timing .vocals-group.syllable-group.active {
	position: relative;
	isolation: isolate;
}

.aura-lyrics.synthetic-timing .vocals-group.syllable-group.active::after {
	--synthetic-halo-opacity: calc(0.16 * var(--motion-intensity, 1));
	--synthetic-halo-amplitude: calc(0.012 * var(--motion-intensity, 1));
	content: "";
	position: absolute;
	inset: calc(var(--lyrics-size) * -0.18);
	z-index: -1;
	border-radius: calc(var(--lyrics-size) * 0.48);
	pointer-events: none;
	opacity: var(--synthetic-halo-opacity);
	background: radial-gradient(
		ellipse at center,
		rgba(var(--pip-synthetic-wake-rgb), 0.24) 0%,
		rgba(var(--pip-foreground-rgb), 0.08) 48%,
		transparent 74%
	);
	box-shadow: 0 0 calc(var(--lyrics-size) * 0.34) rgba(var(--pip-synthetic-wake-rgb), 0.14);
	transform: scale(1);
	transform-origin: center;
	animation: synthetic-wake-halo-breathe 1.8s ease-in-out infinite alternate;
}

.aura-lyrics.synthetic-timing.reduce-motion .vocals-group.syllable-group.active::after {
	animation: none;
	transition: none;
	transform: scale(1);
}

@keyframes synthetic-wake-halo-breathe {
	from {
		opacity: calc(var(--synthetic-halo-opacity) * 0.72);
		transform: scale(1);
	}

	to {
		opacity: var(--synthetic-halo-opacity);
		transform: scale(calc(1 + var(--synthetic-halo-amplitude)));
	}
}

.provider-credit {
	display: grid;
	gap: 6px;
	place-items: center;
	min-width: min(64vw, 420px);
	padding: calc(var(--lyrics-size) * 0.72) calc(var(--lyrics-size) * 0.8);
	margin-top: calc(var(--lyrics-size) * 0.8);
	border: 1px solid rgba(var(--pip-foreground-rgb), 0.14);
	border-radius: calc(var(--lyrics-size) * 0.42);
	background: rgba(var(--pip-scrim-rgb), 0.32);
	text-align: center;
	transform: none;
}

.provider-credit-timed.idle {
	opacity: 0;
	pointer-events: none;
}

.provider-credit-label {
	font-size: max(10px, calc(var(--lyrics-size) * 0.34));
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pip-muted-foreground-color);
	text-shadow: 0 1px 10px rgba(var(--pip-scrim-rgb), 0.28);
}

.provider-diagnostics {
	margin-top: 4px;
	max-width: min(74vw, 720px);
	font-size: max(10px, calc(var(--lyrics-size) * 0.28));
	font-weight: 650;
	letter-spacing: 0.02em;
	line-height: 1.35;
	color: var(--pip-muted-foreground-color);
	text-shadow: 0 1px 10px rgba(var(--pip-scrim-rgb), 0.28);
}

.aura-lyrics.reduce-motion .lyrics-track {
	transition: none;
}

.aura-lyrics.reduce-motion .vocals-group,
.aura-lyrics.reduce-motion .syllable-row,
.aura-lyrics.reduce-motion .lyric,
.aura-lyrics.reduce-motion .lyric-translation,
.aura-lyrics.reduce-motion .syllable {
	filter: none;
	transition-duration: 120ms;
}

.aura-lyrics.reduce-motion .vocals-group {
	transform: none;
}

.aura-lyrics.reduce-motion .highlight-target,
.aura-lyrics.motion-disabled .highlight-target {
	transform: none !important;
	scale: 1 !important;
	box-shadow: none !important;
}

.aura-lyrics.motion-disabled .lyrics-track,
.aura-lyrics.motion-disabled .vocals-group,
.aura-lyrics.motion-disabled .syllable-row,
.aura-lyrics.motion-disabled .lyric,
.aura-lyrics.motion-disabled .lyric-translation,
.aura-lyrics.motion-disabled .syllable {
	transition: none;
}

.aura-lyrics.motion-disabled .vocals-group,
.aura-lyrics.motion-disabled .syllable {
	transform: none !important;
	scale: 1 !important;
}

@media (max-height: 359px) {
	.aura-lyrics {
		--lyrics-size: clamp(17px, calc(9.2vmin * var(--font-scale)), 40px);
	}

	.lyrics-track {
		gap: calc(var(--lyrics-size) * 0.48);
	}

	.static-lyrics-track {
		padding-block: 8vh 18vh;
	}
}

@media (max-height: 219px) {
	.aura-lyrics {
		--lyrics-size: clamp(16px, calc(8.6vmin * var(--font-scale)), 34px);
	}

	#aura-lyrics-root.controls-visible .pip-content {
		padding-bottom: 56px;
	}

	.lyrics-track {
		gap: calc(var(--lyrics-size) * 0.4);
	}
}
`;
