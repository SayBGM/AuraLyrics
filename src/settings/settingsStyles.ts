export const settingsStyles = `
.aura-lyrics-settings { display: grid; gap: 18px; width: min(560px, calc(100vw - 48px)); max-width: 100%; box-sizing: border-box; overflow-x: hidden; color: var(--spice-text); }
.aura-lyrics-settings section { display: grid; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid rgba(var(--spice-rgb-selected-row), .25); }
.aura-lyrics-settings h3 { margin: 0; font-size: 18px; }
.aura-lyrics-settings .setting-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 240px); gap: 14px; align-items: center; min-width: 0; }
.aura-lyrics-settings .setting-row span { min-width: 0; overflow-wrap: anywhere; }
.aura-lyrics-settings input, .aura-lyrics-settings select { width: 100%; max-width: 100%; min-width: 0; min-height: 32px; box-sizing: border-box; color: var(--spice-text); background: rgba(var(--spice-rgb-shadow), .45); border: 0; border-radius: 6px; padding: 0 8px; }
.aura-lyrics-settings input[type="checkbox"] { justify-self: end; min-height: 20px; width: 20px; }
.aura-lyrics-settings button {
	max-width: 100%;
	min-height: 34px;
	border: 1px solid rgba(29, 185, 84, .55);
	border-radius: 999px;
	padding: 0 14px;
	background: #1ed760;
	color: #07130a;
	font-weight: 800;
	box-shadow: 0 6px 18px rgba(29, 185, 84, .18);
	overflow-wrap: anywhere;
}
.aura-lyrics-settings button:hover,
.aura-lyrics-settings button:focus-visible {
	background: #3be477;
	color: #031006;
	outline: none;
	box-shadow: 0 8px 22px rgba(29, 185, 84, .28);
}
.aura-lyrics-settings button:active { transform: translateY(1px); }
.aura-lyrics-settings .provider-controls { display: inline-flex; justify-content: flex-end; align-items: center; gap: 8px; min-width: 0; }
.aura-lyrics-settings .provider-controls input[type="checkbox"] { justify-self: auto; }
.aura-lyrics-settings .icon-button {
	width: 32px;
	min-height: 32px;
	padding: 0;
	border-color: rgba(var(--spice-rgb-selected-row), .38);
	background: rgba(var(--spice-rgb-selected-row), .2);
	color: var(--spice-text);
	box-shadow: none;
}
.aura-lyrics-settings .icon-button:hover,
.aura-lyrics-settings .icon-button:focus-visible {
	background: rgba(var(--spice-rgb-selected-row), .36);
	color: var(--spice-text);
	box-shadow: none;
}
.aura-lyrics-settings .icon-button:disabled {
	opacity: .38;
	background: rgba(var(--spice-rgb-shadow), .24);
	color: rgba(var(--spice-rgb-text), .52);
	border-color: rgba(var(--spice-rgb-selected-row), .16);
	box-shadow: none;
}
.aura-lyrics-settings .muted { opacity: .65; font-size: 12px; }
@media (max-width: 560px) {
	.aura-lyrics-settings { width: 100%; }
	.aura-lyrics-settings .setting-row { grid-template-columns: 1fr; gap: 6px; }
	.aura-lyrics-settings input[type="checkbox"] { justify-self: start; }
}
`;
