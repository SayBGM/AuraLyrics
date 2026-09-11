export const metadataStyles = `
.track-metadata-scene {
	place-items: end start;
	box-sizing: border-box;
	padding: clamp(28px, 7vmin, 52px);
	color: var(--pip-foreground-color);
}

.track-metadata-layout {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: end;
	gap: clamp(14px, 2.8vmin, 22px);
	width: min(82vw, 680px);
	min-width: 0;
	padding: clamp(12px, 2.6vmin, 18px);
	box-sizing: border-box;
	background: linear-gradient(90deg, rgba(var(--pip-scrim-rgb), 0.38), rgba(var(--pip-scrim-rgb), 0));
}

.track-metadata-cover {
	display: block;
	width: clamp(64px, 15vmin, 108px);
	aspect-ratio: 1;
	object-fit: cover;
	border-radius: clamp(4px, 1.2vmin, 8px);
	box-shadow: 0 14px 36px rgba(var(--pip-scrim-rgb), 0.34);
}

.track-metadata-copy {
	display: grid;
	align-content: end;
	gap: clamp(4px, 1vmin, 8px);
	min-width: 0;
	padding-bottom: 1px;
}

.track-metadata-eyebrow {
	color: var(--pip-muted-foreground-color);
	font-size: clamp(9px, 1.9vmin, 12px);
	font-weight: 800;
	letter-spacing: 0.2em;
}

.track-metadata-title {
	overflow: hidden;
	color: var(--pip-foreground-color);
	font-size: clamp(22px, 5.7vmin, 42px);
	font-weight: 760;
	letter-spacing: -0.035em;
	line-height: 1.02;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.track-metadata-byline {
	overflow: hidden;
	color: var(--pip-muted-foreground-color);
	font-size: clamp(12px, 2.6vmin, 17px);
	font-weight: 550;
	line-height: 1.3;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.track-metadata-notice {
	display: grid;
	gap: 4px;
	max-width: min(100%, 420px);
	margin-top: clamp(5px, 1.2vmin, 10px);
	padding: clamp(8px, 1.5vmin, 12px);
	border: 1px solid rgba(var(--pip-foreground-rgb), 0.16);
	border-radius: 10px;
	background: rgba(var(--pip-scrim-rgb), 0.35);
	box-sizing: border-box;
}

.track-metadata-notice.danger {
	border-color: rgba(255, 126, 126, 0.38);
}

.track-metadata-notice-title {
	color: var(--pip-foreground-color);
	font-size: clamp(12px, 2.2vmin, 16px);
	line-height: 1.15;
}

.track-metadata-notice-detail {
	color: var(--pip-muted-foreground-color);
	font-size: clamp(10px, 1.8vmin, 13px);
	line-height: 1.35;
}

.track-metadata-notice-action {
	-webkit-app-region: no-drag;
	justify-self: start;
	margin-top: 3px;
	padding: 5px 9px;
	border: 0;
	border-radius: 999px;
	background: var(--pip-foreground-color);
	color: rgb(var(--pip-scrim-rgb));
	font-size: clamp(10px, 1.8vmin, 13px);
	font-weight: 700;
	cursor: pointer;
}

.track-metadata-diagnostics {
	color: var(--pip-muted-foreground-color);
	font-size: clamp(9px, 1.5vmin, 11px);
	line-height: 1.3;
}

.track-metadata-diagnostics summary {
	-webkit-app-region: no-drag;
	cursor: pointer;
}

.track-metadata-diagnostics ul {
	max-width: 100%;
	margin: 5px 0 0;
	padding-left: 16px;
	overflow-wrap: anywhere;
}

.track-metadata-progress {
	position: relative;
	display: block;
	width: min(100%, 280px);
	height: 2px;
	margin-top: clamp(5px, 1.2vmin, 9px);
	overflow: hidden;
	background: rgba(var(--pip-foreground-rgb), 0.18);
}

.track-metadata-progress::after {
	position: absolute;
	inset: 0;
	content: "";
	background: var(--pip-foreground-color);
	transform: scaleX(0);
	transform-origin: left center;
	animation: track-metadata-progress 3s linear forwards;
}

@keyframes track-metadata-progress {
	from {
		transform: scaleX(0);
	}

	to {
		transform: scaleX(1);
	}
}

#aura-lyrics-root.reduce-motion .track-metadata-progress::after {
	animation: none;
	transform: scaleX(1);
}
`;
