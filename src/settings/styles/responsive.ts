export const responsiveStyles = `
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
