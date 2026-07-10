import type { ExtensionSettings } from "../settings/settingsSchema";

export type AnimatedGroup = {
	element: HTMLElement;
	startTime: number;
	endTime: number;
	setHoldEndTime?(endTime: number): void;
	animate(timestamp: number, deltaTime: number): void;
	applySettings?(settings: ExtensionSettings): void;
};
