export const settingsStyles = `
body.aura-lyrics-settings-open .main-trackCreditsModal-container {
	width: min(920px, calc(100vw - 32px));
	max-width: min(920px, calc(100vw - 32px));
}

.aura-lyrics-settings {
	--mm-ink: #050505;
	--mm-charcoal: #242424;
	--mm-slate: #6b7280;
	--mm-stone: #8b8f98;
	--mm-canvas: #ffffff;
	--mm-surface: #f7f7f8;
	--mm-surface-soft: #fbfbfc;
	--mm-hairline: #e7e7ea;
	--mm-hairline-soft: #f0f0f2;
	--mm-coral: #ff6848;
	--mm-magenta: #ff4fb8;
	--mm-blue: #2367ff;
	--mm-purple: #7b4dff;
	display: grid;
	gap: 16px;
	width: min(860px, calc(100vw - 48px));
	max-width: 100%;
	box-sizing: border-box;
	overflow-x: hidden;
	overflow-y: visible;
	padding: 4px;
	color: var(--mm-ink);
	font-family: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.aura-lyrics-settings .settings-hero {
	position: relative;
	display: grid;
	gap: 8px;
	padding: 28px;
	border-radius: 32px;
	overflow: hidden;
	background:
		radial-gradient(circle at 88% 18%, rgba(255, 79, 184, 0.32), transparent 34%),
		radial-gradient(circle at 12% 88%, rgba(35, 103, 255, 0.28), transparent 38%),
		linear-gradient(135deg, #ff6848 0%, #ff865f 48%, #7b4dff 100%);
	color: #fff;
}

.aura-lyrics-settings .settings-hero::after {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(120deg, rgba(255, 255, 255, 0.28), transparent 42%);
	pointer-events: none;
}

.aura-lyrics-settings .settings-eyebrow {
	position: relative;
	z-index: 1;
	width: fit-content;
	padding: 5px 10px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.2);
	color: rgba(255, 255, 255, 0.9);
	font-size: 12px;
	font-weight: 700;
	line-height: 1.5;
	letter-spacing: 0.08em;
}

.aura-lyrics-settings .settings-hero strong {
	position: relative;
	z-index: 1;
	max-width: 430px;
	font-size: clamp(32px, 7vw, 48px);
	font-weight: 600;
	line-height: 1.1;
	letter-spacing: -0.055em;
}

.aura-lyrics-settings .settings-hero p {
	position: relative;
	z-index: 1;
	max-width: 440px;
	margin: 0;
	color: rgba(255, 255, 255, 0.82);
	font-size: 14px;
	font-weight: 500;
	line-height: 1.5;
}

.aura-lyrics-settings section {
	display: grid;
	gap: 12px;
	padding: 20px;
	border: 1px solid var(--mm-hairline);
	border-radius: 16px;
	background: var(--mm-canvas);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.aura-lyrics-settings h3 {
	margin: 0 0 2px;
	color: var(--mm-ink);
	font-size: 20px;
	font-weight: 600;
	line-height: 1.3;
	letter-spacing: -0.02em;
}

.aura-lyrics-settings .setting-row {
	display: grid;
	grid-template-columns: minmax(180px, 0.85fr) minmax(320px, 1.15fr);
	gap: 22px;
	align-items: center;
	min-width: 0;
	padding-top: 10px;
	border-top: 1px solid var(--mm-hairline-soft);
}

.aura-lyrics-settings h3 + .setting-row {
	border-top: 0;
	padding-top: 0;
}

.aura-lyrics-settings .setting-row span {
	min-width: 0;
	color: var(--mm-charcoal);
	font-size: 14px;
	font-weight: 500;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.aura-lyrics-settings input,
.aura-lyrics-settings select {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	min-height: 40px;
	box-sizing: border-box;
	color: var(--mm-ink);
	background: var(--mm-surface);
	border: 1px solid var(--mm-hairline);
	border-radius: 8px;
	padding: 0 12px;
	font: 500 14px/1.5 "DM Sans", Inter, sans-serif;
	outline: none;
}

.aura-lyrics-settings input:focus,
.aura-lyrics-settings select:focus {
	border-color: var(--mm-blue);
	box-shadow: 0 0 0 3px rgba(35, 103, 255, 0.12);
}

.aura-lyrics-settings input[type="range"] {
	padding: 0;
	accent-color: var(--mm-ink);
	background: transparent;
	border: 0;
}

.aura-lyrics-settings input[type="checkbox"] {
	justify-self: end;
	appearance: none;
	position: relative;
	width: 44px;
	min-height: 24px;
	height: 24px;
	padding: 0;
	border-radius: 999px;
	background: #d8dbe0;
	border: 1px solid #c9cdd4;
	transition: background 160ms ease, border-color 160ms ease;
}

.aura-lyrics-settings input[type="checkbox"]::after {
	content: "";
	position: absolute;
	top: 3px;
	left: 3px;
	width: 16px;
	height: 16px;
	border-radius: 999px;
	background: var(--mm-canvas);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
	transition: transform 180ms cubic-bezier(.2, .9, .2, 1);
}

.aura-lyrics-settings input[type="checkbox"]:checked {
	background: var(--mm-ink);
	border-color: var(--mm-ink);
}

.aura-lyrics-settings input[type="checkbox"]:checked::after {
	transform: translateX(20px);
}

.aura-lyrics-settings button {
	max-width: 100%;
	min-height: 40px;
	border: 1px solid var(--mm-ink);
	border-radius: 999px;
	padding: 0 18px;
	background: var(--mm-ink);
	color: var(--mm-canvas);
	font: 700 14px/1.4 "DM Sans", Inter, sans-serif;
	letter-spacing: -0.01em;
	box-shadow: none;
	overflow-wrap: anywhere;
	transition: transform 150ms ease, background 150ms ease, color 150ms ease;
}

.aura-lyrics-settings button:hover,
.aura-lyrics-settings button:focus-visible {
	background: var(--mm-charcoal);
	color: var(--mm-canvas);
	outline: none;
}

.aura-lyrics-settings button:active {
	transform: translateY(1px);
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
}

.aura-lyrics-settings .icon-button {
	width: 36px;
	min-height: 36px;
	padding: 0;
	border-color: var(--mm-hairline);
	background: var(--mm-canvas);
	color: var(--mm-ink);
	box-shadow: none;
}

.aura-lyrics-settings .icon-button:hover,
.aura-lyrics-settings .icon-button:focus-visible {
	background: var(--mm-ink);
	color: var(--mm-canvas);
	box-shadow: none;
}

.aura-lyrics-settings .icon-button:disabled {
	opacity: 1;
	background: var(--mm-surface-soft);
	color: var(--mm-stone);
	border-color: var(--mm-hairline-soft);
	box-shadow: none;
}

.aura-lyrics-settings .muted {
	display: block;
	color: var(--mm-slate);
	font-size: 12px;
	font-weight: 500;
	line-height: 1.6;
}

@media (max-width: 560px) {
	.aura-lyrics-settings {
		width: 100%;
	}

	.aura-lyrics-settings .settings-hero {
		padding: 22px;
		border-radius: 24px;
	}

	.aura-lyrics-settings section {
		padding: 16px;
	}

	.aura-lyrics-settings .setting-row {
		grid-template-columns: 1fr;
		gap: 8px;
	}

	.aura-lyrics-settings input[type="checkbox"] {
		justify-self: start;
	}
}
`;
