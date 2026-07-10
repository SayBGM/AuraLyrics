import type { InterludeStyle } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import { InterludeView } from "./components/Interlude";
import type { FrameProgressDimensions } from "./interludeProgress";
import { frameSizeForViewport, progressPercent, splitFrameProgress } from "./interludeProgress";

type InterludeFramePresentation = {
	frameActive: boolean;
	properties: Record<string, string>;
};

const PROGRESS_PROPERTIES = [
	"--pip-interlude-progress",
	"--pip-interlude-progress-percent",
	"--pip-frame-progress-top",
	"--pip-frame-progress-right",
	"--pip-frame-progress-bottom",
	"--pip-frame-progress-left",
] as const;

export const interludeFramePresentation = (
	style: InterludeStyle,
	progress: number | undefined,
	dimensions?: FrameProgressDimensions
): InterludeFramePresentation => {
	if (style !== "frame" || progress === undefined) {
		return { frameActive: false, properties: {} };
	}
	const sides = splitFrameProgress(progress, dimensions);
	return {
		frameActive: true,
		properties: {
			"--pip-interlude-progress": String(progress),
			"--pip-interlude-progress-percent": progressPercent(progress),
			"--pip-frame-progress-top": String(sides.top),
			"--pip-frame-progress-right": String(sides.right),
			"--pip-frame-progress-bottom": String(sides.bottom),
			"--pip-frame-progress-left": String(sides.left),
		},
	};
};

export class InterludeFrameController {
	public constructor(
		private readonly hostRoot: HTMLElement,
		private readonly container: HTMLElement,
		private readonly style: InterludeStyle,
		private readonly groups: AnimatedGroup[]
	) {}

	public update(): void {
		const activeInterlude = this.groups.find(isActiveInterlude);
		const frameActive = activeInterlude !== undefined && this.style === "frame";
		this.container.classList.toggle("interlude-active", frameActive);
		for (const element of this.frameHosts()) {
			this.apply(element, activeInterlude?.progress);
		}
	}

	public destroy(): void {
		this.container.classList.remove("interlude-active");
		for (const element of this.frameHosts()) {
			for (const className of [
				"interlude-active",
				"interlude-style-frame",
				"interlude-style-dots",
				"interlude-style-wave",
				"interlude-frame-active",
			]) {
				element.classList.remove(className);
			}
			for (const property of PROGRESS_PROPERTIES) {
				element.style.removeProperty(property);
			}
		}
	}

	private apply(element: HTMLElement, progress: number | undefined): void {
		const presentation = interludeFramePresentation(this.style, progress, measureFrameProgressDimensions(element));
		element.classList.toggle("interlude-active", presentation.frameActive);
		element.classList.toggle("interlude-style-frame", this.style === "frame");
		element.classList.toggle("interlude-style-dots", this.style === "dots");
		element.classList.toggle("interlude-style-wave", this.style === "wave");
		element.classList.toggle("interlude-frame-active", presentation.frameActive);
		for (const property of PROGRESS_PROPERTIES) {
			const value = presentation.properties[property];
			if (value === undefined) {
				element.style.removeProperty(property);
			} else {
				element.style.setProperty(property, value);
			}
		}
	}

	private frameHosts(): HTMLElement[] {
		return [this.hostRoot, this.hostRoot.parentElement].filter((value): value is HTMLElement => value !== undefined && value !== null);
	}
}

const isActiveInterlude = (group: AnimatedGroup): group is InterludeView => group instanceof InterludeView && group.isActive;

const measureFrameProgressDimensions = (element: HTMLElement): FrameProgressDimensions | undefined => {
	const rect = element.getBoundingClientRect();
	const width = element.clientWidth || rect.width;
	const height = element.clientHeight || rect.height;
	if (width <= 0 || height <= 0) {
		return undefined;
	}
	return {
		width,
		height,
		frameSize: frameSizeForViewport({ width, height }),
	};
};
