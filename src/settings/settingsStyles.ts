export const settingsStyles = `
body.aura-lyrics-settings-open .main-trackCreditsModal-container {
	width: min(920px, calc(100vw - 32px));
	max-width: min(920px, calc(100vw - 32px));
	height: min(760px, calc(100vh - 32px));
	max-height: min(760px, calc(100vh - 32px));
	box-sizing: border-box;
	background: #0d0d0f;
	color: #f5f5f7;
}

body.aura-lyrics-settings-open .main-trackCreditsModal-mainSection {
	max-height: 100%;
	overflow: hidden;
	padding: 0;
}

body.aura-lyrics-settings-open .main-trackCreditsModal-originalCredits {
	padding-bottom: 0;
}

.aura-lyrics-settings {
	--settings-bg: #0d0d0f;
	--settings-sidebar: #141417;
	--settings-control: #1a1a1f;
	--settings-control-hover: #232329;
	--settings-text: #f5f5f7;
	--settings-muted: #a7a7b0;
	--settings-border: #2a2a31;
	--settings-accent: #ff7457;
	display: block;
	width: min(888px, calc(100vw - 32px));
	max-width: 100%;
	height: min(700px, calc(100vh - 92px));
	max-height: 100%;
	box-sizing: border-box;
	overflow: hidden;
	background: var(--settings-bg);
	color: var(--settings-text);
	font-family: Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.aura-lyrics-settings .settings-layout {
	display: grid;
	grid-template-columns: 200px minmax(0, 1fr);
	height: 100%;
	min-width: 0;
	min-height: 0;
}

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
	min-height: 42px;
	box-sizing: border-box;
	border: 1px solid transparent;
	border-radius: 8px;
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
	background: color-mix(in srgb, var(--settings-accent) 15%, var(--settings-control));
	color: var(--settings-text);
}

.aura-lyrics-settings .settings-tab[aria-selected="true"] svg {
	color: var(--settings-accent);
}

.aura-lyrics-settings .settings-panel-scroll {
	min-width: 0;
	min-height: 0;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-gutter: stable;
	background: var(--settings-bg);
}

.aura-lyrics-settings .settings-panel {
	display: grid;
	align-content: start;
	gap: 0;
	min-width: 0;
	box-sizing: border-box;
	padding: 24px 28px 32px;
}

.aura-lyrics-settings .settings-panel h3 {
	margin: 0 0 18px;
	color: var(--settings-text);
	font-size: 22px;
	font-weight: 700;
	line-height: 1.25;
	letter-spacing: -0.025em;
}

.aura-lyrics-settings .setting-row {
	display: grid;
	grid-template-columns: minmax(150px, 0.8fr) minmax(220px, 1.2fr);
	gap: 24px;
	align-items: center;
	min-width: 0;
	min-height: 58px;
	box-sizing: border-box;
	padding: 9px 0;
	border-top: 1px solid var(--settings-border);
}

.aura-lyrics-settings h3 + .setting-row {
	border-top: 0;
}

.aura-lyrics-settings .setting-row > span {
	min-width: 0;
	color: var(--settings-text);
	font-size: 14px;
	font-weight: 500;
	line-height: 1.45;
	overflow-wrap: anywhere;
}

.aura-lyrics-settings input,
.aura-lyrics-settings select {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	min-height: 40px;
	box-sizing: border-box;
	border: 1px solid var(--settings-border);
	border-radius: 7px;
	padding: 0 12px;
	background: var(--settings-control);
	color: var(--settings-text);
	font: 500 14px/1.5 Inter, "Helvetica Neue", sans-serif;
	outline: none;
}

.aura-lyrics-settings input[type="range"] {
	padding: 0;
	border: 0;
	background: transparent;
	accent-color: var(--settings-accent);
}

.aura-lyrics-settings input[type="checkbox"] {
	justify-self: end;
	appearance: none;
	position: relative;
	width: 42px;
	min-height: 24px;
	height: 24px;
	padding: 0;
	border-radius: 999px;
	background: #34343c;
	cursor: pointer;
}

.aura-lyrics-settings input[type="checkbox"]::after {
	content: "";
	position: absolute;
	top: 3px;
	left: 3px;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: var(--settings-text);
	transition: transform 160ms ease;
}

.aura-lyrics-settings input[type="checkbox"]:checked {
	border-color: var(--settings-accent);
	background: var(--settings-accent);
}

.aura-lyrics-settings input[type="checkbox"]:checked::after {
	transform: translateX(18px);
}

.aura-lyrics-settings .settings-action {
	justify-self: start;
	min-height: 40px;
	margin-top: 12px;
	border: 1px solid var(--settings-border);
	border-radius: 7px;
	padding: 0 16px;
	background: var(--settings-control);
	color: var(--settings-text);
	font: 650 14px/1.4 Inter, "Helvetica Neue", sans-serif;
	cursor: pointer;
}

.aura-lyrics-settings .settings-action:hover {
	border-color: #3b3b44;
	background: var(--settings-control-hover);
}

.aura-lyrics-settings .provider-controls {
	display: inline-flex;
	justify-content: flex-end;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.aura-lyrics-settings .provider-controls input[type="checkbox"] {
	justify-self: auto;
	margin-right: 4px;
}

.aura-lyrics-settings .icon-button {
	display: inline-grid;
	place-items: center;
	width: 34px;
	min-width: 34px;
	height: 34px;
	border: 1px solid var(--settings-border);
	border-radius: 7px;
	padding: 0;
	background: var(--settings-control);
	color: var(--settings-text);
	cursor: pointer;
}

.aura-lyrics-settings .icon-button:hover {
	background: var(--settings-control-hover);
}

.aura-lyrics-settings .icon-button:disabled {
	opacity: 0.38;
	cursor: default;
}

.aura-lyrics-settings .muted {
	display: block;
	margin-top: 10px;
	color: var(--settings-muted);
	font-size: 12px;
	font-weight: 500;
	line-height: 1.55;
	overflow-wrap: anywhere;
}

.aura-lyrics-settings .settings-status {
	color: var(--settings-text);
}

.aura-lyrics-settings .settings-tab:focus-visible,
.aura-lyrics-settings input:focus-visible,
.aura-lyrics-settings select:focus-visible,
.aura-lyrics-settings button:focus-visible {
	outline: 2px solid var(--settings-accent);
	outline-offset: 2px;
}

@media (max-width: 680px) {
	body.aura-lyrics-settings-open .main-trackCreditsModal-container {
		width: calc(100vw - 16px);
		max-width: calc(100vw - 16px);
		height: min(760px, calc(100vh - 16px));
		max-height: min(760px, calc(100vh - 16px));
	}

	.aura-lyrics-settings {
		width: 100%;
		height: min(720px, calc(100vh - 76px));
	}

	.aura-lyrics-settings .settings-layout {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
	}

	.aura-lyrics-settings .settings-navigation {
		flex-direction: row;
		gap: 4px;
		padding: 8px 10px;
		border-right: 0;
		border-bottom: 1px solid var(--settings-border);
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: thin;
	}

	.aura-lyrics-settings .settings-tab {
		flex: 0 0 auto;
		width: auto;
		min-height: 38px;
		padding: 0 10px;
	}

	.aura-lyrics-settings .settings-panel {
		padding: 20px 18px 28px;
	}

	.aura-lyrics-settings .setting-row {
		grid-template-columns: minmax(0, 1fr);
		gap: 8px;
		padding: 12px 0;
	}

	.aura-lyrics-settings input[type="checkbox"] {
		justify-self: start;
	}

	.aura-lyrics-settings .provider-controls {
		justify-content: flex-start;
	}
}
`;
