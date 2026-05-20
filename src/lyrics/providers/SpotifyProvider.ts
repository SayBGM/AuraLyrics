import { parseSpotifyColorLyrics } from "../parsers/SpotifyColorLyricsParser";
import type { LyricsProvider, ProviderContext, ProviderResult, TrackIdentity } from "../types";

export class SpotifyProvider implements LyricsProvider {
	public readonly id = "spotify";

	public supports(track: TrackIdentity): boolean {
		return !track.isLocal && Boolean(track.id);
	}

	public async fetch(track: TrackIdentity, context: ProviderContext): Promise<ProviderResult> {
		const id = track.id ?? track.uri.split(":")[2];
		const payload = await context.cosmosGet<Parameters<typeof parseSpotifyColorLyrics>[0]>(
			`https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`
		);
		const lyrics = parseSpotifyColorLyrics(payload);
		return lyrics ? { ok: true, lyrics } : { ok: false, reason: "no-lyrics" };
	}
}
