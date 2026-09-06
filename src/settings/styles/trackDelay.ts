export const trackDelayStyles = `
.aura-lyrics-settings .track-delay-card {
	display: grid;
	gap: 14px;
	margin: 0 0 18px;
	border: 1px solid var(--settings-border);
	border-radius: 12px;
	padding: 18px;
	background: color-mix(in srgb, var(--settings-accent) 7%, var(--settings-control));
}

.aura-lyrics-settings .track-delay-card h4 {
	margin: 0;
	color: var(--settings-text);
	font-size: 15px;
	font-weight: 700;
}

.aura-lyrics-settings .track-delay-card[aria-disabled="true"] {
	background: var(--settings-control);
	opacity: 0.72;
}

.aura-lyrics-settings .track-delay-header {
	display: flex;
	justify-content: space-between;
	align-items: end;
	gap: 20px;
	min-width: 0;
}

.aura-lyrics-settings .track-delay-metadata,
.aura-lyrics-settings .track-delay-value-group {
	display: grid;
	gap: 4px;
	min-width: 0;
}

.aura-lyrics-settings .track-delay-metadata strong {
	color: var(--settings-text);
	font-size: 16px;
	line-height: 1.35;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.aura-lyrics-settings .track-delay-metadata span,
.aura-lyrics-settings .track-delay-source,
.aura-lyrics-settings .track-delay-hint,
.aura-lyrics-settings .track-delay-empty {
	margin: 0;
	color: var(--settings-muted);
	font-size: 12px;
	line-height: 1.5;
}

.aura-lyrics-settings .track-delay-value-group {
	flex: 0 0 auto;
	text-align: right;
}

.aura-lyrics-settings .track-delay-value {
	color: var(--settings-text);
	font-size: 20px;
	font-weight: 750;
	font-variant-numeric: tabular-nums;
}

.aura-lyrics-settings .track-delay-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.aura-lyrics-settings .track-delay-actions .settings-action {
	min-height: var(--settings-control-height);
	margin-top: 0;
	padding: 0 12px;
}

.aura-lyrics-settings .track-delay-actions .track-delay-reset {
	margin-left: auto;
}
`;
