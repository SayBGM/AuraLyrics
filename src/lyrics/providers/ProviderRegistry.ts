import type { ExtensionSettings } from "../../settings/SettingsStore";
import type { LyricsProvider } from "../types";

export class ProviderRegistry {
	public constructor(private readonly providers: LyricsProvider[]) {}

	public ordered(settings: ExtensionSettings): LyricsProvider[] {
		const providerById = new Map(this.providers.map((provider) => [provider.id, provider]));
		return settings.providers.order.flatMap((id) => {
			const provider = providerById.get(id);
			return provider && settings.providers.enabled[id] ? [provider] : [];
		});
	}

	public all(): LyricsProvider[] {
		return [...this.providers];
	}
}
