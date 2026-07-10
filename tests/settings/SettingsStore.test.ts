import { describe, expect, test, vi } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore } from "../../src/settings/SettingsStore";

class MemoryStorage {
	private readonly values = new Map<string, string>();

	public get(key: string) {
		return this.values.get(key) ?? null;
	}

	public set(key: string, value: string) {
		this.values.set(key, value);
		return true;
	}
}

describe("SettingsStore", () => {
	test("uses the immersive preset by default", () => {
		const store = new SettingsStore(new MemoryStorage());

		expect(store.get().preset).toBe("immersive");
		expect(store.get().fontScale).toBe(1);
		expect(store.get().backgroundEnabled).toBe(true);
		expect(store.get().backgroundBlurPx).toBeLessThanOrEqual(12);
		expect(store.get().backgroundDim).toBeLessThanOrEqual(0.4);
		expect(store.get().vignetteStrength).toBeLessThanOrEqual(0.3);
		expect(store.get().inactiveBlurPx).toBeGreaterThan(0);
		expect(store.get().syncPreference).toBe("prefer-syllable");
		expect(store.get().interludeStyle).toBe("dots");
	});

	test("keeps the immersive preset close to the original album art", () => {
		const store = new SettingsStore(new MemoryStorage());

		const settings = store.applyPreset("immersive");

		expect(settings.backgroundBlurPx).toBeLessThanOrEqual(12);
		expect(settings.backgroundDim).toBeLessThanOrEqual(0.4);
		expect(settings.vignetteStrength).toBeLessThanOrEqual(0.3);
	});

	test("migrates legacy popup lyrics keys once", () => {
		const storage = new MemoryStorage();
		storage.set("popup-lyrics:font-size", "54");
		storage.set("popup-lyrics:delay", "125");
		storage.set("popup-lyrics:show-cover", "false");
		storage.set("popup-lyrics:services-order", JSON.stringify(["lrclib", "spotify"]));

		const store = new SettingsStore(storage);

		expect(store.get().fontScale).toBeCloseTo(54 / 25);
		expect(store.get().lyricsDelayMs).toBe(125);
		expect(store.get().backgroundEnabled).toBe(true);
		expect(store.get().providers.order.slice(0, 2)).toEqual(["lrclib", "spotify"]);
	});

	test("normalizes partial saved settings with nested provider defaults", () => {
		const storage = new MemoryStorage();
		storage.set(
			"aura-lyrics:settings",
			JSON.stringify({
				providers: {
					order: ["unknown", "musixmatch", "spotify", "spotify"],
					enabled: {
						musixmatch: false,
					},
					musixmatchToken: "token",
				},
			})
		);

		const settings = new SettingsStore(storage).get();

		expect(settings.providers.order).toEqual(["musixmatch", "spotify", "lrclib"]);
		expect(settings.providers.enabled).toEqual({
			...DEFAULT_SETTINGS.providers.enabled,
			musixmatch: false,
		});
		expect(settings.providers.musixmatchToken).toBe("token");
	});

	test("normalizes invalid interlude styles back to the default dots style", () => {
		const storage = new MemoryStorage();
		storage.set(
			"aura-lyrics:settings",
			JSON.stringify({
				interludeStyle: "sparkles",
			})
		);

		const settings = new SettingsStore(storage).get();

		expect(settings.interludeStyle).toBe("dots");
	});

	test("migrates saved settings from the previous dynamic popup key", () => {
		const storage = new MemoryStorage();
		storage.set(
			"dynamic-popup-lyrics:settings",
			JSON.stringify({
				fontSizePx: 50,
				backgroundDim: 5,
				fontScale: undefined,
				visibleContextLines: 9,
			})
		);

		const settings = new SettingsStore(storage).get();

		expect(settings.fontScale).toBeCloseTo(2);
		expect(settings.backgroundDim).toBe(1);
		expect(settings.visibleContextLines).toBe(2);
	});

	test("drops removed legacy fields while normalizing saved settings", () => {
		const storage = new MemoryStorage();
		storage.set(
			"aura-lyrics:settings",
			JSON.stringify({
				aspectRatio: "16:9",
				fontSizePx: 30,
			})
		);

		const settings = new SettingsStore(storage).get() as typeof DEFAULT_SETTINGS & {
			aspectRatio?: unknown;
			fontSizePx?: unknown;
		};

		expect(settings.fontScale).toBeCloseTo(30 / 25);
		expect(settings.aspectRatio).toBeUndefined();
		expect(settings.fontSizePx).toBeUndefined();
	});

	test("previews normalized settings and emits without persisting", () => {
		const storage = new MemoryStorage();
		const set = vi.spyOn(storage, "set");
		const store = new SettingsStore(storage);
		set.mockClear();
		const listener = vi.fn();
		store.subscribe(listener);

		const settings = store.preview({ fontScale: 99 });

		expect(settings.fontScale).toBe(2.4);
		expect(settings.preset).toBe("custom");
		expect(store.get()).toEqual(settings);
		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledWith(settings);
		expect(set).not.toHaveBeenCalled();
	});

	test("commits the current preview once without changing or re-emitting it", () => {
		const storage = new MemoryStorage();
		const set = vi.spyOn(storage, "set");
		const store = new SettingsStore(storage);
		set.mockClear();
		const listener = vi.fn();
		store.subscribe(listener);
		const previewed = store.preview({ glowStrength: 0.25 });
		listener.mockClear();

		const saved = store.commit();

		expect(saved).toBe(true);
		expect(store.get()).toEqual(previewed);
		expect(set).toHaveBeenCalledOnce();
		expect(set).toHaveBeenCalledWith("aura-lyrics:settings", JSON.stringify(previewed));
		expect(listener).not.toHaveBeenCalled();
	});

	test("keeps update as an immediate persist and emit operation", () => {
		const storage = new MemoryStorage();
		const set = vi.spyOn(storage, "set");
		const store = new SettingsStore(storage);
		set.mockClear();
		const listener = vi.fn();
		store.subscribe(listener);

		const settings = store.update({ motionIntensity: 0.5 });

		expect(settings.motionIntensity).toBe(0.5);
		expect(set).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledWith(settings);
	});

	test("persists before notifying listeners in subscription order", () => {
		const events: string[] = [];
		const storage = new MemoryStorage();
		const store = new SettingsStore(storage);
		vi.spyOn(storage, "set").mockImplementation((key, value) => {
			events.push("persist");
			return MemoryStorage.prototype.set.call(storage, key, value);
		});
		store.subscribe(() => events.push("first"));
		store.subscribe(() => events.push("second"));

		store.update({ glowStrength: 0.4 });

		expect(events).toEqual(["persist", "first", "second"]);
	});

	test("keeps no-op updates observable and isolates listener snapshots", () => {
		const storage = new MemoryStorage();
		const set = vi.spyOn(storage, "set");
		const store = new SettingsStore(storage);
		set.mockClear();
		const observedFontScales: number[] = [];
		store.subscribe((settings) => {
			settings.fontScale = 2.4;
		});
		store.subscribe((settings) => observedFontScales.push(settings.fontScale));

		store.update({ preset: "immersive" }, false);

		expect(set).toHaveBeenCalledOnce();
		expect(observedFontScales).toEqual([DEFAULT_SETTINGS.fontScale]);
		expect(store.get().fontScale).toBe(DEFAULT_SETTINGS.fontScale);
	});

	test("reset and preset changes persist before emitting their normalized state", () => {
		const storage = new MemoryStorage();
		const store = new SettingsStore(storage);
		store.update({ fontScale: 1.8 });
		const states: Array<{ preset: string; fontScale: number }> = [];
		store.subscribe((settings) => states.push({ preset: settings.preset, fontScale: settings.fontScale }));

		const preset = store.applyPreset("clean");
		const reset = store.reset();

		expect(preset.preset).toBe("clean");
		expect(states[0]).toEqual({ preset: "clean", fontScale: 1.8 });
		expect(reset).toEqual(DEFAULT_SETTINGS);
		expect(states[1]).toEqual({ preset: "immersive", fontScale: 1 });
		expect(JSON.parse(storage.get("aura-lyrics:settings") ?? "null")).toEqual(DEFAULT_SETTINGS);
	});

	test("keeps runtime state and notifications when immediate persistence fails", () => {
		const storage = new MemoryStorage();
		const store = new SettingsStore(storage);
		vi.spyOn(storage, "set").mockReturnValue(false);
		const listener = vi.fn();
		store.subscribe(listener);

		const settings = store.update({ lyricsDelayMs: 250 });

		expect(settings.lyricsDelayMs).toBe(250);
		expect(store.get().lyricsDelayMs).toBe(250);
		expect(listener).toHaveBeenCalledWith(settings);
		expect(store.consumePersistenceFailure()).toBe(true);
	});

	test("reports persistence failures without exposing stored values", () => {
		const storage = new MemoryStorage();
		const store = new SettingsStore(storage);
		vi.spyOn(storage, "set").mockReturnValue(false);
		const listener = vi.fn();
		store.persistenceFailed.subscribe(listener);

		store.preview({ providers: { ...store.get().providers, musixmatchToken: "secret-token" } });
		const saved = store.commit();

		expect(saved).toBe(false);
		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledWith(undefined);
	});

	test("retains constructor persistence failures until a caller consumes them", () => {
		const store = new SettingsStore({
			get: () => null,
			set: () => false,
		});

		expect(store.consumePersistenceFailure()).toBe(true);
		expect(store.consumePersistenceFailure()).toBe(false);
	});

	test("reports a failed migration marker write as a pending persistence failure", () => {
		const storage = new MemoryStorage();
		vi.spyOn(storage, "set").mockImplementation((key, value) => {
			if (key === "aura-lyrics:migrated-v1") {
				return false;
			}
			return MemoryStorage.prototype.set.call(storage, key, value);
		});

		const store = new SettingsStore(storage);

		expect(store.consumePersistenceFailure()).toBe(true);
	});

	test("normalizes scalar legacy settings before exposing or persisting them", () => {
		const storage = new MemoryStorage();
		storage.set("popup-lyrics:font-size", "999999");
		storage.set("popup-lyrics:delay", "999999");
		storage.set("popup-lyrics:blur-size", "999999");
		storage.set("popup-lyrics:services:musixmatch:token", `  ${"x".repeat(5000)}  `);

		const settings = new SettingsStore(storage).get();

		expect(settings.fontScale).toBe(2.4);
		expect(settings.lyricsDelayMs).toBe(5000);
		expect(settings.backgroundBlurPx).toBe(80);
		expect(settings.providers.musixmatchToken).toBeUndefined();
	});

	test("writes the migration marker only after migrated settings are durably readable", () => {
		const writes: string[] = [];
		const storage = new MemoryStorage();
		storage.set("popup-lyrics:delay", "125");
		vi.spyOn(storage, "set").mockImplementation((key, value) => {
			writes.push(key);
			return MemoryStorage.prototype.set.call(storage, key, value);
		});

		new SettingsStore(storage);

		expect(writes).toEqual(["aura-lyrics:settings", "aura-lyrics:migrated-v1"]);
		expect(storage.get("aura-lyrics:migrated-v1")).toBe("true");
	});

	test("does not write the migration marker when migrated settings cannot be saved", () => {
		const writes: string[] = [];
		const storage = new MemoryStorage();
		storage.set("popup-lyrics:delay", "125");
		vi.spyOn(storage, "set").mockImplementation((key) => {
			writes.push(key);
			return false;
		});

		new SettingsStore(storage);

		expect(writes).toEqual(["aura-lyrics:settings"]);
		expect(storage.get("aura-lyrics:migrated-v1")).toBeNull();
	});

	test("does not mark a legacy settings document migrated until read-back succeeds", () => {
		const writes: string[] = [];
		const storage = {
			get: vi.fn((key: string) => (key === "dynamic-popup-lyrics:settings" ? JSON.stringify({ fontScale: 1.2 }) : null)),
			set: vi.fn((key: string) => {
				writes.push(key);
				return true;
			}),
		};

		const store = new SettingsStore(storage);

		expect(store.get().fontScale).toBe(1.2);
		expect(writes).toEqual(["aura-lyrics:settings"]);
	});
});
