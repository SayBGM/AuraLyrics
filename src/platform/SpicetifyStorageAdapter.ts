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

	public set(key: string, value: string): boolean {
		if (!this.spicetify.LocalStorage) {
			return false;
		}
		try {
			this.spicetify.LocalStorage.set(key, value);
			return true;
		} catch {
			return false;
		}
	}

	public delete(key: string): boolean {
		return this.set(key, "");
	}
}
