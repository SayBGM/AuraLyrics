import { createSettingsIcon } from "./settingsIcons";

export type NumberControlChange = {
	persisted: boolean;
	value: number;
};

export class SettingsControlFactory {
	private committedPreviewRevision = 0;
	private previewRevision = 0;

	public constructor(
		private readonly ownerDocument: Document,
		private readonly commitPreview: () => boolean
	) {}

	public select(
		controlId: string,
		label: string,
		value: string,
		options: string[],
		onChange: (value: string) => boolean,
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
		select.addEventListener("change", () => {
			this.markPersistenceComplete(onChange(select.value));
		});
		return this.row(label, select);
	}

	public number(controlId: string, label: string, value: number, onChange: (value: number) => NumberControlChange): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "number";
		input.value = String(value);
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => {
			const result = onChange(Number(input.value));
			input.value = String(result.value);
			this.markPersistenceComplete(result.persisted);
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
		let controlPreviewRevision = 0;
		let previewedValue = value;
		const preview = (): void => {
			const nextValue = Number(input.value);
			if (nextValue === previewedValue) {
				return;
			}
			previewedValue = nextValue;
			this.previewRevision += 1;
			controlPreviewRevision = this.previewRevision;
			onChange(nextValue);
		};
		const commit = (): void => {
			preview();
			if (controlPreviewRevision <= this.committedPreviewRevision) {
				return;
			}
			if (this.commitPreview()) {
				this.committedPreviewRevision = this.previewRevision;
			}
		};
		input.addEventListener("input", preview);
		input.addEventListener("change", commit);
		input.addEventListener("pointerup", commit);
		return this.row(label, input);
	}

	public input(
		controlId: string,
		label: string,
		value: string,
		onChange: (value: string) => boolean,
		onInput?: (value: string) => void
	): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "text";
		input.value = value;
		input.dataset.controlId = controlId;
		input.addEventListener("input", () => onInput?.(input.value));
		input.addEventListener("change", () => {
			this.markPersistenceComplete(onChange(input.value));
		});
		return this.row(label, input);
	}

	public toggle(controlId: string, label: string, value: boolean, onChange: (value: boolean) => boolean): HTMLElement {
		const input = this.ownerDocument.createElement("input");
		input.type = "checkbox";
		input.checked = value;
		input.dataset.controlId = controlId;
		input.addEventListener("change", () => {
			this.markPersistenceComplete(onChange(input.checked));
		});
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

	private markPersistenceComplete(persisted: boolean): void {
		if (persisted) {
			this.committedPreviewRevision = this.previewRevision;
		}
	}
}
