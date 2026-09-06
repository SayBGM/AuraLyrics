import type { InterludeStyle } from "../settings/SettingsStore";
import type { AnimatedGroup } from "./AnimatedGroup";
import { isActiveInterlude } from "./components/Interlude";
import type { FrameProgressDimensions } from "./interludeProgress";
import { frameSizeForViewport, progressPercent, splitFrameProgress } from "./interludeProgress";

type InterludeFramePresentation = {
	frameActive: boolean;
	properties: Record<string, string>;
};

type FrameHost = {
	element: HTMLElement;
	dimensions?: FrameProgressDimensions;
	measured: boolean;
	observer?: ResizeObserver;
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
	private readonly hosts: FrameHost[];
	private lastProgress?: number;
	private lastFrameActive?: boolean;

	public constructor(
		hostRoot: HTMLElement,
		private readonly container: HTMLElement,
		private readonly style: InterludeStyle,
		private readonly groups: AnimatedGroup[]
	) {
		const elements = [hostRoot, hostRoot.parentElement].filter((value): value is HTMLElement => value !== undefined && value !== null);
		this.hosts = elements.map((element) => ({ element, measured: false }));
		if (this.style !== "frame") {
			return;
		}
		const ResizeObserverConstructor = hostRoot.ownerDocument.defaultView?.ResizeObserver;
		if (!ResizeObserverConstructor) {
			return;
		}
		for (const host of this.hosts) {
			host.observer = new ResizeObserverConstructor(() => {
				host.measured = false;
			});
			host.observer.observe(host.element);
		}
	}

	public update(): void {
		// Only the frame style paints the PiP window; dots/wave live entirely inside the
		// lyrics track and their root classes are owned by the PiP controller.
		if (this.style !== "frame") {
			return;
		}
		const activeInterlude = this.groups.find(isActiveInterlude);
		const progress = activeInterlude?.progress;
		const frameActive = activeInterlude !== undefined;
		if (frameActive === this.lastFrameActive && progress === this.lastProgress) {
			return;
		}
		this.lastFrameActive = frameActive;
		this.lastProgress = progress;
		this.container.classList.toggle("interlude-active", frameActive);
		for (const host of this.hosts) {
			this.apply(host, progress);
		}
	}

	public destroy(): void {
		this.container.classList.remove("interlude-active");
		for (const host of this.hosts) {
			host.observer?.disconnect();
			host.observer = undefined;
			for (const className of ["interlude-active", "interlude-frame-active"]) {
				host.element.classList.remove(className);
			}
			for (const property of PROGRESS_PROPERTIES) {
				host.element.style.removeProperty(property);
			}
		}
	}

	private apply(host: FrameHost, progress: number | undefined): void {
		const element = host.element;
		const presentation = interludeFramePresentation(this.style, progress, progress === undefined ? undefined : this.dimensionsFor(host));
		element.classList.toggle("interlude-active", presentation.frameActive);
		element.classList.add("interlude-style-frame");
		element.classList.remove("interlude-style-dots", "interlude-style-wave");
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

	private dimensionsFor(host: FrameHost): FrameProgressDimensions | undefined {
		if (!host.measured) {
			host.dimensions = measureFrameProgressDimensions(host.element);
			host.measured = host.dimensions !== undefined;
		}
		return host.dimensions;
	}
}

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
