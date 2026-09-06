import { describe, expect, test } from "vitest";
import { ProviderRegistry } from "../../src/lyrics/providers/ProviderRegistry";
import type { LyricsProvider } from "../../src/lyrics/types";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../src/settings/SettingsStore";

const fakeProvider = (id: LyricsProvider["id"]): LyricsProvider => ({
	id,
	supports: () => true,
	fetch: async () => ({ ok: false, reason: "no-lyrics" }),
});

describe("ProviderRegistry", () => {
	test("all() returns every registered provider regardless of settings", () => {
		const spotify = fakeProvider("spotify");
		const lrclib = fakeProvider("lrclib");
		const registry = new ProviderRegistry([spotify, lrclib]);

		expect(registry.all()).toEqual([spotify, lrclib]);
	});

	test("ordered() follows the settings order and excludes disabled providers", () => {
		const spotify = fakeProvider("spotify");
		const lrclib = fakeProvider("lrclib");
		const musixmatch = fakeProvider("musixmatch");
		const registry = new ProviderRegistry([spotify, lrclib, musixmatch]);

		const settings: ExtensionSettings = {
			...DEFAULT_SETTINGS,
			providers: {
				...DEFAULT_SETTINGS.providers,
				order: ["lrclib", "spotify", "musixmatch"],
				enabled: { spotify: true, lrclib: true, musixmatch: false },
			},
		};

		expect(registry.ordered(settings)).toEqual([lrclib, spotify]);
	});

	test("ordered() skips settings order entries that have no matching registered provider", () => {
		const lrclib = fakeProvider("lrclib");
		const registry = new ProviderRegistry([lrclib]);

		const settings: ExtensionSettings = {
			...DEFAULT_SETTINGS,
			providers: {
				...DEFAULT_SETTINGS.providers,
				order: ["spotify", "lrclib", "musixmatch"],
				enabled: { spotify: true, lrclib: true, musixmatch: true },
			},
		};

		expect(registry.ordered(settings)).toEqual([lrclib]);
	});

	test("ordered() returns an empty list when every provider is disabled", () => {
		const registry = new ProviderRegistry([fakeProvider("spotify"), fakeProvider("lrclib")]);
		const settings: ExtensionSettings = {
			...DEFAULT_SETTINGS,
			providers: {
				...DEFAULT_SETTINGS.providers,
				enabled: { spotify: false, lrclib: false, musixmatch: false },
			},
		};

		expect(registry.ordered(settings)).toEqual([]);
	});
});
