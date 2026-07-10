import { parseLrc } from "../parsers/LrcParser";
import type { LyricsProvider, ProviderContext, ProviderResult, TrackIdentity } from "../types";

const RATE_LIMIT_COOLDOWN_MS = 1000 * 60 * 5;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

const errorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	return "LRCLIB request failed.";
};

const hasRenderableVocals = (lyrics: ReturnType<typeof parseLrc>): boolean => {
	if (lyrics.type === "line") {
		return lyrics.content.some((item) => item.type === "vocal" && item.text.trim().length > 0);
	}
	return lyrics.content.some((item) => item.type === "vocal" && item.lead.syllables.some((syllable) => syllable.text.trim().length > 0));
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
		let response: Response;
		try {
			response = await context.fetch(`https://lrclib.net/api/get?${params.toString()}`, {
				headers: { "x-user-agent": context.userAgent },
			});
		} catch (error) {
			return { ok: false, reason: "error", message: errorMessage(error) };
		}
		if (!response.ok) {
			if (response.status === 404) {
				return { ok: false, reason: "no-lyrics", message: "Track was not found on LRCLIB." };
			}
			if (response.status === 429) {
				return {
					ok: false,
					reason: "temporarily-unavailable",
					message: "LRCLIB request failed with status 429.",
					cooldownMs: RATE_LIMIT_COOLDOWN_MS,
				};
			}
			if (response.status >= 500 && response.status < 600) {
				return {
					ok: false,
					reason: "temporarily-unavailable",
					message: `LRCLIB request failed with status ${response.status}.`,
				};
			}
			return { ok: false, reason: "error", message: `LRCLIB request failed with status ${response.status}.` };
		}
		let decoded: unknown;
		try {
			decoded = await response.json();
		} catch (error) {
			return { ok: false, reason: "error", message: errorMessage(error) };
		}
		const payload = asRecord(decoded);
		if (!payload) {
			return { ok: false, reason: "error", message: "LRCLIB returned a malformed payload." };
		}
		if ("instrumental" in payload && typeof payload.instrumental !== "boolean") {
			return { ok: false, reason: "error", message: "LRCLIB returned a malformed payload." };
		}
		if (payload.instrumental === true) {
			return { ok: false, reason: "instrumental" };
		}
		const syncedLyrics = payload.syncedLyrics;
		if (syncedLyrics === undefined || syncedLyrics === null) {
			return { ok: false, reason: "no-lyrics" };
		}
		if (typeof syncedLyrics !== "string") {
			return { ok: false, reason: "error", message: "LRCLIB returned a malformed payload." };
		}
		if (syncedLyrics.trim().length === 0) {
			return { ok: false, reason: "no-lyrics" };
		}
		const lyrics = parseLrc(syncedLyrics);
		if (!hasRenderableVocals(lyrics)) {
			return { ok: false, reason: "error", message: "LRCLIB returned lyrics without renderable vocals." };
		}
		return { ok: true, lyrics };
	}
}
