import { createSettingsIcon } from "./settingsIcons";

export class SettingsControlFactory {
	public constructor(
		private readonly ownerDocument: Document,
		private readonly commitPreview: () => boolean
	) {}

	public select(
		controlId: string,
		label: string,
		value: string,
		options: string[],
		onChange: (value: string) => void,
		optionLabel = (option: string): string => option
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
		select.addEventListener("change", () => onChange(select.value));
		return this.row(label, select);
	}

	public number(controlId: string, label: string, value: number, onChange: (value: number) => number): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "number";
		input.value = String(value);
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => {
			input.value = String(onChange(Number(input.value)));
		});
		return this.row(label, input);
	}

	public range(
		controlId: string,
		label: string,
		value: number,
		min: number,
		max: number,
		step: number,
		onChange: (value: number) => void
	): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "range";
		input.min = String(min);
		input.max = String(max);
		input.step = String(step);
		input.value = String(value);
		input.dataset.controlId = controlId;
		let dirty = false;
		let previewedValue = value;
		const preview = (): void => {
			const nextValue = Number(input.value);
			if (nextValue === previewedValue) {
				return;
			}
			previewedValue = nextValue;
			dirty = true;
			onChange(nextValue);
		};
		const commit = (): void => {
			preview();
			if (!dirty) {
				return;
			}
			dirty = !this.commitPreview();
		};
		input.addEventListener("input", preview);
		input.addEventListener("change", commit);
		input.addEventListener("pointerup", commit);
		return this.row(label, input);
	}

	public input(controlId: string, label: string, value: string, onChange: (value: string) => void): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "text";
		input.value = value;
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => onChange(input.value));
		return this.row(label, input);
	}

	public toggle(controlId: string, label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "checkbox";
		input.checked = value;
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => onChange(input.checked));
		return this.row(label, input);
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

	public text(value: string): HTMLElement {
		const span = this.ownerDocument.createElement("span");
		span.className = "muted";
		span.textContent = value;
		return span;
	}

	public status(value: string): HTMLElement {
		const status = this.text(value);
		status.classList.add("settings-status");
		status.setAttribute("role", "status");
		status.setAttribute("aria-live", "polite");
		return status;
	}

	public row(label: string, control: HTMLElement): HTMLElement {
		const row = this.ownerDocument.createElement("label");
		row.className = "setting-row";
		const span = this.ownerDocument.createElement("span");
		span.textContent = label;
		row.append(span, control);
		return row;
	}
}
