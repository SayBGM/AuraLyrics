export const shellStyles = `
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
`;
