export const transitionStyles = `
.pip-cover-layer {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.pip-cover-layer > .pip-cover {
	transition: opacity 360ms ease;
}

#aura-lyrics-root .pip-cover[data-cover-state="pending"],
#aura-lyrics-root .pip-cover[data-cover-state="outgoing"] {
	opacity: 0;
}

#aura-lyrics-root .pip-cover[data-cover-state="active"],
#aura-lyrics-root .pip-cover[data-cover-state="incoming"] {
	opacity: 0.95;
}

#aura-lyrics-root.album-art-mode .pip-cover[data-cover-state="pending"],
#aura-lyrics-root.album-art-mode .pip-cover[data-cover-state="outgoing"] {
	opacity: 0;
}

#aura-lyrics-root.album-art-mode .pip-cover[data-cover-state="active"],
#aura-lyrics-root.album-art-mode .pip-cover[data-cover-state="incoming"] {
	opacity: 1;
}

#aura-lyrics-root.reduce-motion .pip-cover-layer > .pip-cover {
	transition: none;
}

.pip-content > [data-scene-plane] {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: grid;
	place-items: center;
	padding: inherit;
	box-sizing: border-box;
	overflow: hidden;
	will-change: transform, opacity;
}

.pip-content > [data-scene-plane="outgoing"] {
	pointer-events: none;
}

.pip-content.scene-transition-next > [data-scene-plane="outgoing"] {
	animation: scene-transition-next-outgoing 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pip-content.scene-transition-next > [data-scene-plane="incoming"] {
	animation: scene-transition-next-incoming 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pip-content.scene-transition-previous > [data-scene-plane="outgoing"] {
	animation: scene-transition-previous-outgoing 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pip-content.scene-transition-previous > [data-scene-plane="incoming"] {
	animation: scene-transition-previous-incoming 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pip-content.scene-transition-up > [data-scene-plane="outgoing"] {
	animation: scene-transition-up-outgoing 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pip-content.scene-transition-up > [data-scene-plane="incoming"] {
	animation: scene-transition-up-incoming 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes scene-transition-next-outgoing {
	from {
		transform: translate3d(0, 0, 0);
		opacity: 1;
	}
	to {
		transform: translate3d(-100%, 0, 0);
		opacity: 0;
	}
}

@keyframes scene-transition-next-incoming {
	from {
		transform: translate3d(100%, 0, 0);
		opacity: 0;
	}
	to {
		transform: translate3d(0, 0, 0);
		opacity: 1;
	}
}

@keyframes scene-transition-previous-outgoing {
	from {
		transform: translate3d(0, 0, 0);
		opacity: 1;
	}
	to {
		transform: translate3d(100%, 0, 0);
		opacity: 0;
	}
}

@keyframes scene-transition-previous-incoming {
	from {
		transform: translate3d(-100%, 0, 0);
		opacity: 0;
	}
	to {
		transform: translate3d(0, 0, 0);
		opacity: 1;
	}
}

@keyframes scene-transition-up-outgoing {
	from {
		transform: translate3d(0, 0, 0);
		opacity: 1;
	}
	to {
		transform: translate3d(0, -100%, 0);
		opacity: 0;
	}
}

@keyframes scene-transition-up-incoming {
	from {
		transform: translate3d(0, 100%, 0);
		opacity: 0;
	}
	to {
		transform: translate3d(0, 0, 0);
		opacity: 1;
	}
}
`;
