import { describe, expect, test, vi } from "vitest";
import { ExtensionApp } from "../../src/app/ExtensionApp";
import type { SpicetifyGlobal } from "../../src/runtime/spicetify";

const createSpicetify = () => {
	const values = new Map<string, string>();
	const topbarButtons: Array<{ element: HTMLElement; active?: boolean; deregister?: () => void }> = [];
	const spicetify = {
		Player: {
			getProgress: () => 0,
			getDuration: () => 0,
			isPlaying: () => true,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		},
		LocalStorage: {
			get: (key: string) => values.get(key) ?? null,
			set: (key: string, value: string) => {
				values.set(key, value);
			},
		},
		Topbar: {
			Button: vi.fn((_label: string, _icon: string, _onClick: () => void) => {
				const button = { element: document.createElement("button"), deregister: vi.fn() };
				topbarButtons.push(button);
				return button;
			}),
		},
	} as unknown as SpicetifyGlobal;
	return { spicetify, topbarButtons };
};

describe("ExtensionApp", () => {
	test("does not register duplicate listeners when started repeatedly", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);

		app.start();
		app.start();

		expect(spicetify.Player.addEventListener).toHaveBeenCalledTimes(2);
		expect(spicetify.Topbar?.Button).toHaveBeenCalledTimes(1);
		app.destroy();
	});

	test("disposes settings and PiP subscriptions on destroy", () => {
		const { spicetify } = createSpicetify();
		const app = new ExtensionApp(spicetify);
		const internals = app as unknown as {
			settings: { update: (patch: unknown) => void };
			pip: { closed: { emit: (value?: undefined) => void } };
			applySettings: () => void;
			closePip: (closeWindow?: boolean) => void;
		};
		app.start();
		app.destroy();
		internals.applySettings = vi.fn();
		internals.closePip = vi.fn();

		internals.settings.update({ lyricsDelayMs: 99 });
		internals.pip.closed.emit();

		expect(internals.applySettings).not.toHaveBeenCalled();
		expect(internals.closePip).not.toHaveBeenCalled();
	});

	test("updates PiP play state from playback callbacks instead of the lyric frame tick", () => {
		const { spicetify } = createSpicetify();
		let playbackListener: (() => void) | undefined;
		let isPlaying = true;
		spicetify.Player.isPlaying = () => isPlaying;
		spicetify.Player.addEventListener = vi.fn((event: string, listener: () => void) => {
			if (event === "onplaypause") {
				playbackListener = listener;
			}
		});
		const app = new ExtensionApp(spicetify);
		const setPlaying = vi.fn();
		const internals = app as unknown as {
			session: { setPlaying: (playing: boolean) => void };
			lastLoadState: { status: string };
			tick: (deltaTime: number) => void;
		};
		app.start();
		internals.session = { setPlaying };
		internals.lastLoadState = { status: "ready" };

		internals.tick(1 / 60);
		isPlaying = false;
		playbackListener?.();

		expect(setPlaying).toHaveBeenCalledTimes(1);
		expect(setPlaying).toHaveBeenCalledWith(false);
		app.destroy();
	});
});
