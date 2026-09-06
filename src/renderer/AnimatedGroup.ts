import type { ExtensionSettings } from "../settings/settingsSchema";

export type AnimatedGroup = {
	element: HTMLElement;
	startTime: number;
	endTime: number;
	setHoldEndTime?(endTime: number): void;
	animate(timestamp: number, deltaTime: number): void;
	applySettings?(settings: ExtensionSettings): void;
	/**
	 * Optional settle probe used by the renderer's animation window: a group that reports
	 * `false` keeps being animated after it leaves the window until its springs come to rest.
	 * Groups without springs omit it and are treated as settled.
	 */
	isSettled?(): boolean;
};
