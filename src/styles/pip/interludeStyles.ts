export const interludeStyles = `
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
	animation: interlude-breathe var(--interlude-pill-cycle, 1.45s) ease-in-out infinite;
}

#aura-lyrics-root.is-playing .interlude.active .interlude-dot {
	animation: interlude-dot var(--interlude-dot-cycle, 1.1s) ease-in-out infinite;
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
	animation: interlude-wave-live var(--interlude-wave-cycle, 1.32s) ease-in-out infinite;
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
