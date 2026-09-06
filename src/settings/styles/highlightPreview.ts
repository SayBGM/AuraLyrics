export const highlightPreviewStyles = `
.aura-lyrics-settings .highlight-preview {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 0.3em;
	min-height: 92px;
	margin: 10px 0 12px;
	border: 1px solid var(--settings-border);
	border-radius: 10px;
	padding: 12px 18px;
	overflow: hidden;
	background:
		radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--settings-accent) 16%, transparent), transparent 58%),
		#111116;
	font-size: clamp(22px, 4vw, 34px);
	font-weight: 750;
	letter-spacing: -0.035em;
}

.aura-lyrics-settings .highlight-preview-motion,
.aura-lyrics-settings .highlight-preview-token {
	display: inline-block;
	position: relative;
	transform-origin: center;
	animation-duration: 2.8s;
	animation-delay: var(--preview-delay, 0s);
	animation-iteration-count: infinite;
	animation-timing-function: cubic-bezier(.16, 1, .3, 1);
}

.aura-lyrics-settings .highlight-preview-token {
	z-index: 0;
	color: var(--settings-muted);
	animation-name: highlight-preview-fill;
}

.aura-lyrics-settings .highlight-preview[data-effect="glow-sweep"] .highlight-preview-token {
	animation-name: highlight-preview-glow;
}

.aura-lyrics-settings .highlight-preview[data-effect="underline"] .highlight-preview-token::after,
.aura-lyrics-settings .highlight-preview[data-effect="marker"] .highlight-preview-token::before {
	content: "";
	position: absolute;
	left: 0;
	right: 0;
	z-index: -1;
	transform: scaleX(0);
	transform-origin: left center;
	animation: highlight-preview-sweep 2.8s cubic-bezier(.16, 1, .3, 1) var(--preview-delay, 0s) infinite;
}

.aura-lyrics-settings .highlight-preview[data-effect="underline"] .highlight-preview-token::after {
	bottom: -0.12em;
	height: 0.08em;
	border-radius: 999px;
	background: var(--settings-accent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--settings-accent) 58%, transparent);
}

.aura-lyrics-settings .highlight-preview[data-effect="marker"] .highlight-preview-token::before {
	top: 52%;
	bottom: 0;
	border-radius: 0.16em;
	background: color-mix(in srgb, var(--settings-accent) 38%, transparent);
}

.aura-lyrics-settings .highlight-preview[data-effect="outline-fill"] .highlight-preview-token {
	color: transparent;
	-webkit-text-stroke: 1px var(--settings-muted);
	animation-name: highlight-preview-outline;
}

.aura-lyrics-settings .highlight-preview[data-effect="spotlight"] .highlight-preview-token {
	animation-name: highlight-preview-spotlight;
}

.aura-lyrics-settings .highlight-preview[data-motion="spring"] .highlight-preview-motion {
	animation-name: highlight-preview-spring;
}

.aura-lyrics-settings .highlight-preview[data-motion="pulse"] .highlight-preview-motion {
	animation-name: highlight-preview-pulse;
}

.aura-lyrics-settings .highlight-preview[data-motion="bounce"] .highlight-preview-motion {
	animation-name: highlight-preview-bounce;
}

.aura-lyrics-settings .highlight-preview[data-motion="elastic"] .highlight-preview-motion {
	animation-name: highlight-preview-elastic;
}

.aura-lyrics-settings .highlight-preview[data-motion="wave"] .highlight-preview-motion {
	animation-name: highlight-preview-wave;
}

.aura-lyrics-settings .highlight-preview[data-motion="ripple"] .highlight-preview-motion {
	animation-name: highlight-preview-ripple;
}

.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-motion,
.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token,
.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token::before,
.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token::after {
	animation: none;
	transform: none;
}

.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token {
	color: var(--settings-text);
}

@keyframes highlight-preview-fill {
	0%, 12%, 100% { color: var(--settings-muted); }
	30%, 72% { color: var(--settings-text); }
}

@keyframes highlight-preview-glow {
	0%, 12%, 100% { color: var(--settings-muted); text-shadow: none; }
	32%, 68% { color: var(--settings-text); text-shadow: 0 0 10px var(--settings-accent), 0 0 22px color-mix(in srgb, var(--settings-accent) 58%, transparent); }
}

@keyframes highlight-preview-outline {
	0%, 12%, 100% { color: transparent; -webkit-text-stroke-color: var(--settings-muted); }
	32%, 68% { color: var(--settings-text); -webkit-text-stroke-color: transparent; }
}

@keyframes highlight-preview-spotlight {
	0%, 12%, 100% { color: var(--settings-muted); opacity: 0.5; }
	32%, 62% { color: var(--settings-text); opacity: 1; }
}

@keyframes highlight-preview-sweep {
	0%, 12%, 100% { transform: scaleX(0); }
	36%, 68% { transform: scaleX(1); }
}

@keyframes highlight-preview-spring {
	0%, 12%, 100% { transform: translateY(0) scale(1); }
	28% { transform: translateY(-0.12em) scale(1.08); }
	48%, 68% { transform: translateY(0) scale(1); }
}

@keyframes highlight-preview-pulse {
	0%, 12%, 100% { transform: scale(1); }
	38%, 64% { transform: scale(1.08); }
}

@keyframes highlight-preview-bounce {
	0%, 12%, 100% { transform: translateY(0); }
	30% { transform: translateY(-0.22em); }
	42% { transform: translateY(0.05em); }
	54%, 68% { transform: translateY(0); }
}

@keyframes highlight-preview-elastic {
	0%, 12%, 100% { transform: scale(1); }
	28% { transform: scaleX(1.14) scaleY(0.9); }
	42% { transform: scaleX(0.95) scaleY(1.08); }
	58%, 68% { transform: scale(1); }
}

@keyframes highlight-preview-wave {
	0%, 12%, 100% { transform: translateY(0) rotate(0); }
	28% { transform: translateY(-0.16em) rotate(-2deg); }
	44% { transform: translateY(0.08em) rotate(2deg); }
	62% { transform: translateY(0) rotate(0); }
}

@keyframes highlight-preview-ripple {
	0%, 12%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 transparent); }
	36% { transform: scale(1.06); filter: drop-shadow(0 0 10px var(--settings-accent)); }
	68% { transform: scale(1); filter: drop-shadow(0 0 18px transparent); }
}
`;
