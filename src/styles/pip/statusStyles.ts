export const statusStyles = `
.status-card {
	display: grid;
	gap: 10px;
	place-items: center;
	padding: 24px;
	border: 1px solid rgba(var(--pip-foreground-rgb), 0.12);
	border-radius: 24px;
	background: rgba(var(--pip-scrim-rgb), 0.42);
	backdrop-filter: blur(18px);
	text-align: center;
}

.status-card strong {
	font-size: 22px;
}

.status-card span {
	font-size: 13px;
	opacity: 0.72;
}

.status-card button {
	-webkit-app-region: no-drag;
	border: 0;
	border-radius: 999px;
	padding: 8px 14px;
	background: var(--pip-foreground-color);
	color: rgb(var(--pip-scrim-rgb));
	font-weight: 700;
}
`;
