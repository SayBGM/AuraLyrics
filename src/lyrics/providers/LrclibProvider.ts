import { parseLrc } from "../parsers/LrcParser";
import type { LyricsProvider, ProviderContext, ProviderResult, TrackIdentity } from "../types";

const RATE_LIMIT_COOLDOWN_MS = 1000 * 60 * 5;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

const cosmosErrorStatus = (error: unknown): number | undefined => {
	const record = asRecord(error);
	if (!record) {
		return undefined;
	}
	const directStatus = record.status ?? record.statusCode;
	if (typeof directStatus === "number") {
		return directStatus;
	}
	const response = asRecord(record.response);
	return typeof response?.status === "number" ? response.status : undefined;
};

const errorMessage = (error: unknown, status: number | undefined): string => {
	if (error instanceof Error) {
		return error.message;
	}
	return status === undefined ? "LRCLIB request failed." : `LRCLIB request failed with status ${status}.`;
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
		let decoded: unknown;
		try {
			decoded = await context.cosmosGet(`https://lrclib.net/api/get?${params.toString()}`, null, {
				"User-Agent": context.userAgent,
			});
		} catch (error) {
			const status = cosmosErrorStatus(error);
			if (status === 404) {
				return { ok: false, reason: "no-lyrics", message: "Track was not found on LRCLIB." };
			}
			if (status === 429) {
				return {
					ok: false,
					reason: "temporarily-unavailable",
					message: errorMessage(error, status),
					cooldownMs: RATE_LIMIT_COOLDOWN_MS,
				};
			}
			if (status !== undefined && status >= 500 && status < 600) {
				return { ok: false, reason: "temporarily-unavailable", message: errorMessage(error, status) };
			}
			return { ok: false, reason: "error", message: errorMessage(error, status) };
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
		return { ok: true, lyrics: parseLrc(syncedLyrics) };
	}
}
