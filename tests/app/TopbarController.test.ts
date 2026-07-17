import { describe, expect, test, vi } from "vitest";
import { TopbarController } from "../../src/app/TopbarController";
import type { SpicetifyGlobal } from "../../src/runtime/spicetify";

type RegisteredButton = {
	active?: boolean;
	deregister: ReturnType<typeof vi.fn>;
	element: HTMLButtonElement;
	icon: string;
	label: string;
	onClick: () => void;
};

const createSpicetify = () => {
	const registered: RegisteredButton[] = [];
	class Button {
		public readonly element = document.createElement("button");
		public readonly deregister = vi.fn();
		public active?: boolean;

		public constructor(label: string, icon: string, onClick: () => void) {
			this.element.addEventListener("click", onClick);
			registered.push(Object.assign(this, { icon, label, onClick }));
		}
	}
	return {
		registered,
		spicetify: { Topbar: { Button } } as unknown as SpicetifyGlobal,
	};
};

describe("TopbarController", () => {
	test("registers separate lyrics and settings buttons while preserving the lyrics context-menu shortcut", () => {
		const { registered, spicetify } = createSpicetify();
		const onToggle = vi.fn();
		const onSettings = vi.fn();
		const controller = new TopbarController(spicetify, onToggle, onSettings);

		controller.register();

		expect(registered.map(({ icon, label }) => ({ icon, label }))).toEqual([
			{ icon: "lyrics", label: "AuraLyrics" },
			{ icon: "settings", label: "AuraLyrics Settings" },
		]);
		registered[0].element.click();
		registered[1].element.click();
		const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		registered[0].element.dispatchEvent(contextMenu);

		expect(onToggle).toHaveBeenCalledOnce();
		expect(onSettings).toHaveBeenCalledTimes(2);
		expect(contextMenu.defaultPrevented).toBe(true);
	});

	test("applies active state only to lyrics and deregisters both buttons", () => {
		const { registered, spicetify } = createSpicetify();
		const onSettings = vi.fn();
		const controller = new TopbarController(spicetify, vi.fn(), onSettings);
		controller.register();

		controller.setActive(true);

		expect(registered[0].active).toBe(true);
		expect(registered[0].element.classList.contains("active")).toBe(true);
		expect(registered[1].active).toBeUndefined();
		expect(registered[1].element.classList.contains("active")).toBe(false);

		controller.destroy();
		registered[0].element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

		expect(registered[0].deregister).toHaveBeenCalledOnce();
		expect(registered[1].deregister).toHaveBeenCalledOnce();
		expect(onSettings).not.toHaveBeenCalled();
	});
});
