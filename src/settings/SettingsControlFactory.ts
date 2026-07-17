import type { NumericSettingSpec } from "./numericSettingSpecs";
import { createSettingsIcon } from "./settingsIcons";

export type ControlPresentation = {
	description?: string;
	disabledReason?: string;
};

export type SettingsControlFactoryCallbacks = {
	onPersist?(persisted: boolean): void;
	onPreview?(): void;
};

export class SettingsControlFactory {
	private committedPreviewRevision = 0;
	private previewRevision = 0;

	public constructor(
		private readonly ownerDocument: Document,
		private readonly commitPreview: () => boolean,
		private readonly callbacks: SettingsControlFactoryCallbacks = {}
	) {}

	public select(
		controlId: string,
		label: string,
		value: string,
		options: string[],
		onChange: (value: string) => boolean,
		optionLabel = (option: string): string => option,
		presentation: ControlPresentation = {}
	): HTMLElement {
		const select = this.ownerDocument.createElement("select");
		select.dataset.controlId = controlId;
		for (const option of options) {
			const element = this.ownerDocument.createElement("option");
			element.value = option;
			element.textContent = optionLabel(option);
			element.selected = option === value;
			select.append(element);
		}
		this.applyDisabled(select, presentation);
		select.addEventListener("change", () => this.markPersistenceComplete(onChange(select.value)));
		return this.row(controlId, label, select, presentation);
	}

	public range(
		controlId: string,
		label: string,
		value: number,
		spec: NumericSettingSpec,
		formatValue: (value: number) => string,
		onChange: (value: number) => number | undefined,
		presentation?: ControlPresentation
	): HTMLElement;
	public range(
		controlId: string,
		label: string,
		value: number,
		min: number,
		max: number,
		step: number,
		onChange: (value: number) => void
	): HTMLElement;
	public range(
		controlId: string,
		label: string,
		value: number,
		specOrMin: NumericSettingSpec | number,
		formatOrMax: ((value: number) => string) | number,
		changeOrStep: ((value: number) => unknown) | number,
		onChangeOrPresentation?: ((value: number) => unknown) | ControlPresentation,
		providedPresentation: ControlPresentation = {}
	): HTMLElement {
		const legacy = typeof specOrMin === "number";
		const spec: NumericSettingSpec = legacy
			? { min: specOrMin, max: formatOrMax as number, step: changeOrStep as number, unit: "percent" }
			: specOrMin;
		const formatValue = legacy ? (next: number): string => String(next) : (formatOrMax as (value: number) => string);
		const onChange = legacy ? (onChangeOrPresentation as (value: number) => unknown) : (changeOrStep as (value: number) => unknown);
		const presentation = legacy ? providedPresentation : ((onChangeOrPresentation as ControlPresentation | undefined) ?? providedPresentation);
		const wrapper = this.ownerDocument.createElement("span");
		wrapper.className = "range-control";
		const input = this.ownerDocument.createElement("input");
		input.type = "range";
		input.id = `aura-setting-${controlId}`;
		input.min = String(spec.min);
		input.max = String(spec.max);
		input.step = String(spec.step);
		input.value = String(value);
		input.dataset.controlId = controlId;
		this.applyDisabled(input, presentation);
		const output = this.ownerDocument.createElement("output");
		output.className = "range-output";
		output.htmlFor = input.id;
		output.textContent = formatValue(value);
		let controlPreviewRevision = 0;
		let previewedValue = value;
		const preview = (): void => {
			const nextValue = Number(input.value);
			output.textContent = formatValue(nextValue);
			if (nextValue === previewedValue) {
				return;
			}
			previewedValue = nextValue;
			this.previewRevision += 1;
			controlPreviewRevision = this.previewRevision;
			const normalizedValue = onChange(nextValue);
			if (typeof normalizedValue === "number" && normalizedValue !== nextValue) {
				previewedValue = normalizedValue;
				input.value = String(normalizedValue);
				output.textContent = formatValue(normalizedValue);
			}
			this.callbacks.onPreview?.();
		};
		const commit = (): void => {
			preview();
			if (controlPreviewRevision <= this.committedPreviewRevision) {
				return;
			}
			const persisted = this.commitPreview();
			if (persisted) {
				this.committedPreviewRevision = this.previewRevision;
			}
			this.callbacks.onPersist?.(persisted);
		};
		input.addEventListener("input", preview);
		input.addEventListener("change", commit);
		input.addEventListener("pointerup", commit);
		wrapper.append(input, output);
		return this.row(controlId, label, wrapper, presentation, input);
	}

	public input(
		controlId: string,
		label: string,
		value: string,
		onChange: (value: string) => boolean,
		onInput?: (value: string) => void,
		presentation: ControlPresentation = {},
		type: "password" | "text" | "url" = "text"
	): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = type;
		input.value = value;
		input.dataset.controlId = controlId;
		this.applyDisabled(input, presentation);
		input.addEventListener("input", () => onInput?.(input.value));
		input.addEventListener("change", () => this.markPersistenceComplete(onChange(input.value)));
		return this.row(controlId, label, input, presentation);
	}

	public toggle(
		controlId: string,
		label: string,
		value: boolean,
		onChange: (value: boolean) => boolean,
		presentation: ControlPresentation = {}
	): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "checkbox";
		input.checked = value;
		input.dataset.controlId = controlId;
		this.applyDisabled(input, presentation);
		input.addEventListener("change", () => this.markPersistenceComplete(onChange(input.checked)));
		return this.row(controlId, label, input, presentation);
	}

	public button(controlId: string, label: string, onClick: () => void): HTMLButtonElement {
		const button = this.ownerDocument.createElement("button");
		button.type = "button";
		button.className = "settings-action";
		button.dataset.controlId = controlId;
		button.textContent = label;
		button.addEventListener("click", onClick);
		return button;
	}

	public iconButton(controlId: string, icon: "down" | "up", title: string, onClick: () => void): HTMLButtonElement {
		const button = this.ownerDocument.createElement("button");
		button.type = "button";
		button.className = "icon-button";
		button.dataset.controlId = controlId;
		button.title = title;
		button.setAttribute("aria-label", title);
		button.append(createSettingsIcon(icon, this.ownerDocument));
		for (const eventName of ["pointerdown", "mousedown", "mouseup"] as const) {
			button.addEventListener(eventName, (event) => {
				event.preventDefault();
				event.stopPropagation();
			});
		}
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			onClick();
		});
		return button;
	}

	public text(value: string, className = "muted"): HTMLElement {
		const span = this.ownerDocument.createElement("span");
		span.className = className;
		span.textContent = value;
		return span;
	}

	public row(
		controlId: string,
		label: string,
		control: HTMLElement,
		presentation: ControlPresentation = {},
		accessibleControl = control
	): HTMLElement {
		const row = this.ownerDocument.createElement("label");
		row.className = "setting-row";
		if (presentation.disabledReason) {
			row.classList.add("is-disabled");
		}
		const copy = this.ownerDocument.createElement("span");
		copy.className = "setting-copy";
		const labelText = this.ownerDocument.createElement("span");
		labelText.className = "setting-label";
		labelText.textContent = label;
		copy.append(labelText);
		const describedBy: string[] = [];
		if (presentation.description) {
			const description = this.ownerDocument.createElement("span");
			description.className = "setting-description";
			description.id = `aura-setting-${controlId}-description`;
			description.textContent = presentation.description;
			describedBy.push(description.id);
			copy.append(description);
		}
		if (presentation.disabledReason) {
			const reason = this.ownerDocument.createElement("span");
			reason.className = "disabled-reason";
			reason.id = `aura-setting-${controlId}-disabled-reason`;
			reason.textContent = presentation.disabledReason;
			describedBy.push(reason.id);
			copy.append(reason);
		}
		if (describedBy.length > 0) {
			accessibleControl.setAttribute("aria-describedby", describedBy.join(" "));
		}
		row.append(copy, control);
		return row;
	}

	private applyDisabled(control: HTMLInputElement | HTMLSelectElement, presentation: ControlPresentation): void {
		control.disabled = Boolean(presentation.disabledReason);
	}

	private markPersistenceComplete(persisted: boolean): void {
		if (persisted) {
			this.committedPreviewRevision = this.previewRevision;
		}
		this.callbacks.onPersist?.(persisted);
	}
}
