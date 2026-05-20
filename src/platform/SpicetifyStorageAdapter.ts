import type { SpicetifyGlobal } from "../runtime/spicetify";

export class SpicetifyStorageAdapter {
	public constructor(private readonly spicetify: SpicetifyGlobal) {}

	public get(key: string): string | null {
		try {
			return this.spicetify.LocalStorage?.get(key) ?? null;
		} catch {
			return null;
		}
	}

	public set(key: string, value: string): void {
		try {
			this.spicetify.LocalStorage?.set(key, value);
		} catch {
			// Spicetify LocalStorage can fail in constrained CEF states; treat it as best-effort.
		}
	}

	public delete(key: string): void {
		try {
			this.spicetify.LocalStorage?.set(key, "");
		} catch {
			// Best-effort cleanup only.
		}
	}
}
