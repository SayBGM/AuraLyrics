export const settingsStyles = `
body.aura-lyrics-settings-open .main-trackCreditsModal-container {
	display: flex;
	flex-direction: column;
	width: min(920px, calc(100vw - 32px));
	max-width: min(920px, calc(100vw - 32px));
	height: min(760px, calc(100vh - 32px));
	max-height: min(760px, calc(100vh - 32px));
	box-sizing: border-box;
	overflow: hidden;
	background: #0d0d0f;
	color: #f5f5f7;
}

body.aura-lyrics-settings-open .main-trackCreditsModal-mainSection {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	width: 100%;
	min-height: 0;
	max-height: 100%;
	overflow: hidden;
	padding: 0;
}

body.aura-lyrics-settings-open .main-trackCreditsModal-originalCredits {
	display: flex;
	flex: 1 1 auto;
	width: 100%;
	height: 100%;
	max-height: 100%;
	min-height: 0;
	overflow: hidden;
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
	--settings-accent-text: #210b06;
	--settings-danger: #ff5c68;
	--settings-focus: #ffd4ca;
	--settings-control-height: 40px;
	--settings-radius: 8px;
	--settings-disabled-control: 0.45;
	--settings-disabled-group: 0.65;
	color-scheme: dark;
	display: block;
	flex: 1 1 auto;
	width: min(888px, calc(100vw - 32px));
	max-width: 100%;
	height: 100%;
	max-height: 100%;
	min-height: 0;
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

.aura-lyrics-settings .settings-content {
	display: grid;
	grid-template-rows: minmax(0, 1fr) 44px;
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

.aura-lyrics-settings .settings-action:disabled {
	opacity: 0.42;
	cursor: default;
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
	min-height: var(--settings-control-height);
	box-sizing: border-box;
	border: 1px solid var(--settings-border);
	border-radius: var(--settings-radius);
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
	min-height: var(--settings-control-height);
	margin-top: 12px;
	border: 1px solid var(--settings-border);
	border-radius: var(--settings-radius);
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
	border-radius: var(--settings-radius);
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
	outline: 2px solid var(--settings-focus);
	outline-offset: 2px;
}

.aura-lyrics-settings .settings-group {
	min-width: 0;
	margin-top: 22px;
	border: 1px solid var(--settings-border);
	border-radius: 12px;
	padding: 16px 18px 6px;
	background: color-mix(in srgb, var(--settings-control) 56%, transparent);
}

.aura-lyrics-settings .settings-panel h3 + .settings-group {
	margin-top: 0;
}

.aura-lyrics-settings .settings-group h4 {
	margin: 0;
	color: var(--settings-text);
	font-size: 15px;
	font-weight: 750;
	line-height: 1.4;
}

.aura-lyrics-settings .settings-group-description {
	margin: 5px 0 12px;
	color: var(--settings-muted);
	font-size: 12px;
	line-height: 1.55;
}

.aura-lyrics-settings .setting-copy {
	display: grid;
	gap: 4px;
	min-width: 0;
}

.aura-lyrics-settings .setting-label {
	min-width: 0;
	color: var(--settings-text);
	font-size: 14px;
	font-weight: 500;
	line-height: 1.45;
	overflow-wrap: anywhere;
}

.aura-lyrics-settings .setting-description,
.aura-lyrics-settings .disabled-reason {
	color: var(--settings-muted);
	font-size: 12px;
	font-weight: 500;
	line-height: 1.45;
}

.aura-lyrics-settings .disabled-reason {
	color: #f3b0a3;
}

.aura-lyrics-settings .setting-row.is-disabled {
	opacity: var(--settings-disabled-group);
}

.aura-lyrics-settings .setting-row.is-disabled input,
.aura-lyrics-settings .setting-row.is-disabled select,
.aura-lyrics-settings .settings-action:disabled,
.aura-lyrics-settings .icon-button:disabled {
	opacity: var(--settings-disabled-control);
}

.aura-lyrics-settings .range-control {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 72px;
	align-items: center;
	gap: 12px;
	min-width: 0;
}

.aura-lyrics-settings .range-output {
	color: var(--settings-text);
	font-size: 13px;
	font-variant-numeric: tabular-nums;
	text-align: right;
}

.aura-lyrics-settings .settings-action-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 4px 0 12px;
}

.aura-lyrics-settings .settings-action-row .settings-action,
.aura-lyrics-settings .reset-region > .settings-action,
.aura-lyrics-settings .settings-group > .settings-action {
	margin-top: 0;
}

.aura-lyrics-settings .danger-action {
	border-color: color-mix(in srgb, var(--settings-danger) 64%, var(--settings-border));
	color: #ffb8bd;
}

.aura-lyrics-settings .danger-action:hover {
	border-color: var(--settings-danger);
	background: color-mix(in srgb, var(--settings-danger) 14%, var(--settings-control));
}

.aura-lyrics-settings .reset-region {
	padding: 4px 0 12px;
}

.aura-lyrics-settings .reset-confirmation-message {
	margin: 0 0 10px;
	color: #ffbec3;
	font-size: 13px;
}

.aura-lyrics-settings .icon-button {
	width: var(--settings-control-height);
	min-width: var(--settings-control-height);
	height: var(--settings-control-height);
}

.aura-lyrics-settings .token-control {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	gap: 8px;
	min-width: 0;
}

.aura-lyrics-settings .token-action {
	min-width: 62px;
	margin: 0;
	padding: 0 10px;
}

.aura-lyrics-settings .provider-order-summary,
.aura-lyrics-settings .proxy-example {
	display: block;
	margin: 10px 0 12px;
	color: var(--settings-muted);
	font-size: 12px;
	line-height: 1.55;
	overflow-wrap: anywhere;
}

.aura-lyrics-settings .proxy-example {
	border: 1px solid var(--settings-border);
	border-radius: 6px;
	padding: 9px 10px;
	background: #111116;
	color: #dedee5;
}

.aura-lyrics-settings .settings-feedback {
	display: flex;
	align-items: center;
	min-width: 0;
	border-top: 1px solid var(--settings-border);
	padding: 0 20px;
	background: var(--settings-sidebar);
	color: var(--settings-muted);
	font-size: 13px;
	font-weight: 650;
}

.aura-lyrics-settings .settings-feedback[data-state="saved"],
.aura-lyrics-settings .settings-feedback[data-state="success"] {
	color: #8ee6ad;
}

.aura-lyrics-settings .settings-feedback[data-state="previewing"],
.aura-lyrics-settings .settings-feedback[data-state="working"] {
	color: #ffd3a3;
}

.aura-lyrics-settings .settings-feedback[data-state="error"] {
	color: #ff9ea6;
}

.aura-lyrics-settings .visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
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
		min-height: 44px;
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

	.aura-lyrics-settings .track-delay-header {
		align-items: start;
		flex-direction: column;
		gap: 12px;
	}

	.aura-lyrics-settings .track-delay-value-group {
		text-align: left;
	}

	.aura-lyrics-settings .track-delay-actions .track-delay-reset {
		width: 100%;
		margin-left: 0;
	}

	.aura-lyrics-settings input[type="checkbox"] {
		justify-self: start;
	}

	.aura-lyrics-settings .provider-controls {
		justify-content: flex-start;
	}

	.aura-lyrics-settings .settings-group {
		padding: 14px 14px 4px;
	}

	.aura-lyrics-settings .icon-button,
	.aura-lyrics-settings .settings-action {
		min-height: 44px;
	}

	.aura-lyrics-settings .track-delay-actions .settings-action {
		min-height: 44px;
	}

	.aura-lyrics-settings .icon-button {
		width: 44px;
		min-width: 44px;
		height: 44px;
	}

	.aura-lyrics-settings .token-control {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.aura-lyrics-settings .token-control input {
		grid-column: 1 / -1;
	}
}
`;
