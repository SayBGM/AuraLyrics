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

.aura-timing-marker {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 13px;
	height: 13px;
	border-radius: 2px 0 2px 0;
	background: var(--pip-accent-color, #ff7457);
	box-shadow: 0 0 10px rgba(var(--pip-glow-rgb, 255, 116, 87), 0.45);
	clip-path: polygon(0 0, 100% 0, 100% 70%, 70% 70%, 70% 100%, 0 100%);
	pointer-events: none;
	z-index: 2;
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

.lyrics-track.align-center .vocals-group.opposite-aligned {
	align-self: center;
}

.lyrics-track.align-left .vocals-group.opposite-aligned,
.lyrics-track.align-natural .vocals-group.opposite-aligned {
	align-self: flex-end;
	text-align: right;
	transform-origin: right center;
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
	display: inline-block;
	letter-spacing: var(--lyric-letter-spacing);
	word-spacing: var(--lyric-word-spacing);
	background: linear-gradient(
		90deg,
		var(--pip-foreground-color) var(--gradient-progress, 0%),
		var(--pip-muted-foreground-color) var(--gradient-progress, 0%)
	);
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
`;
