import { parseLrc } from "../parsers/LrcParser";
import type { LyricsProvider, ProviderContext, ProviderResult, TrackIdentity } from "../types";

type LrclibResponse = {
	instrumental?: boolean;
	syncedLyrics?: string;
};

export class LrclibProvider implements LyricsProvider {
	public readonly id = "lrclib";

	public supports(track: TrackIdentity): boolean {
		return !track.isLocal;
	}

	public async fetch(track: TrackIdentity, context: ProviderContext): Promise<ProviderResult> {
		const params = new URLSearchParams({
			track_name: track.title,
			artist_name: track.artist,
			album_name: track.album,
			duration: String(track.durationMs / 1000),
		});
		const response = await context.fetch(`https://lrclib.net/api/get?${params.toString()}`, {
			headers: { "x-user-agent": context.userAgent },
		});
		if (!response.ok) {
			return { ok: false, reason: "no-lyrics", message: "Track was not found on LRCLIB." };
		}
		const payload = (await response.json()) as LrclibResponse;
		if (payload.instrumental) {
			return { ok: false, reason: "instrumental" };
		}
		if (!payload.syncedLyrics) {
			return { ok: false, reason: "no-lyrics" };
		}
		return { ok: true, lyrics: parseLrc(payload.syncedLyrics) };
	}
}
