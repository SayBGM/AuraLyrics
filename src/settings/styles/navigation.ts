export const navigationStyles = `
.aura-lyrics-settings .settings-navigation {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	padding: 16px 12px;
	border-right: 1px solid var(--settings-border);
	background: var(--settings-sidebar);
}

.aura-lyrics-settings .settings-tab {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	min-height: var(--settings-control-height);
	box-sizing: border-box;
	border: 1px solid transparent;
	border-radius: var(--settings-radius);
	padding: 0 12px;
	background: transparent;
	color: var(--settings-muted);
	font: 600 14px/1.4 Inter, "Helvetica Neue", sans-serif;
	text-align: left;
	cursor: pointer;
}

.aura-lyrics-settings .settings-tab:hover {
	background: var(--settings-control);
	color: var(--settings-text);
}

.aura-lyrics-settings .settings-tab[aria-selected="true"] {
	background: var(--settings-accent);
	color: var(--settings-accent-text);
}

.aura-lyrics-settings .settings-tab[aria-selected="true"] svg {
	color: currentColor;
}
`;
