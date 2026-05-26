export const statusStyles = `
.status-card {
	display: grid;
	gap: 10px;
	place-items: center;
	padding: 24px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 24px;
	background: rgba(10, 10, 10, 0.42);
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
	background: rgba(255, 255, 255, 0.92);
	color: #111;
	font-weight: 700;
}
`;
