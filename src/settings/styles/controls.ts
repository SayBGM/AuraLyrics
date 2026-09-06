export const controlsStyles = `
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
`;
