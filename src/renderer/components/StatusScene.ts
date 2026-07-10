export type StatusViewModel = {
	title: string;
	detail?: string;
	tone?: "neutral" | "danger";
	actionLabel?: string;
	onAction?: () => void;
};

export const createStatusScene = (ownerDocument: Document, status: StatusViewModel): HTMLDivElement => {
	const scene = ownerDocument.createElement("div");
	scene.className = `aura-lyrics status ${status.tone ?? "neutral"}`;
	const card = ownerDocument.createElement("div");
	card.className = "status-card";
	const title = ownerDocument.createElement("strong");
	title.textContent = status.title;
	card.append(title);
	if (status.detail) {
		const detail = ownerDocument.createElement("span");
		detail.textContent = status.detail;
		card.append(detail);
	}
	if (status.actionLabel && status.onAction) {
		const button = ownerDocument.createElement("button");
		button.type = "button";
		button.textContent = status.actionLabel;
		button.addEventListener("click", status.onAction);
		card.append(button);
	}
	scene.append(card);
	return scene;
};
