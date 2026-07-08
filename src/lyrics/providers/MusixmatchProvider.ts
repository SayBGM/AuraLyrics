import { parseMusixmatchRichsync, parseMusixmatchSubtitle } from "../parsers/MusixmatchParser";
import type { LyricsProvider, ProviderContext, ProviderResult, TrackIdentity } from "../types";
import { requestMusixmatch } from "./musixmatchProxy";

const MUSIXMATCH_DESKTOP_HEADERS = {
	authority: "apic-desktop.musixmatch.com",
	cookie: "x-mxm-token-guid=",
};

type MusixmatchMacroResponse = {
	message?: {
		body?: {
			macro_calls?: Record<string, { message: { header: MusixmatchHeader; body: Record<string, unknown> } }>;
		};
	};
};

type MusixmatchHeader = {
	status_code: number;
	hint?: string;
	mode?: string;
};

type MusixmatchRichsyncResponse = {
	message?: {
		header?: {
			status_code?: number;
			hint?: string;
		};
		body?: {
			richsync?: {
				richsync_body?: string;
			};
		};
	};
};

const TEMPORARY_BLOCK_COOLDOWN_MS = 1000 * 60 * 10;

export class MusixmatchProvider implements LyricsProvider {
	public readonly id = "musixmatch";

	public supports(track: TrackIdentity): boolean {
		return !track.isLocal;
	}

	public async fetch(track: TrackIdentity, context: ProviderContext): Promise<ProviderResult> {
		const params = new URLSearchParams({
			format: "json",
			namespace: "lyrics_synched",
			subtitle_format: "mxm",
			app_id: "web-desktop-app-v1.0",
			q_album: track.album,
			q_artist: track.artist,
			q_artists: track.artist,
			q_track: track.title,
			track_spotify_id: track.uri,
			q_duration: String(track.durationMs / 1000),
			f_subtitle_length: String(Math.floor(track.durationMs / 1000)),
			usertoken: context.musixmatchToken ?? "",
		});
		const payload = await requestMusixmatch<MusixmatchMacroResponse>({
			targetUrl: `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?${params.toString()}`,
			proxyBaseUrl: context.musixmatchProxyBaseUrl,
			cosmosGet: context.cosmosGet,
			cosmosHeaders: MUSIXMATCH_DESKTOP_HEADERS,
			fetch: context.fetch,
		});
		const macro = payload.message?.body?.macro_calls;
		const matcher = macro?.["matcher.track.get"]?.message;
		if (!matcher || matcher.header.status_code !== 200) {
			if (matcher && this.isTemporaryBlock(matcher.header)) {
				return {
					ok: false,
					reason: "temporarily-unavailable",
					message: this.blockMessage(matcher.header),
					cooldownMs: TEMPORARY_BLOCK_COOLDOWN_MS,
				};
			}
			return { ok: false, reason: "error", message: matcher?.header.hint ?? "Musixmatch request failed." };
		}
		const trackId = this.extractTrackId(matcher.body);
		if (trackId) {
			const richsync = await this.fetchRichsync(trackId, track.durationMs, context);
			if (richsync) {
				return { ok: true, lyrics: richsync };
			}
		}
		const subtitle = macro?.["track.subtitles.get"]?.message.body as { subtitle_list?: Array<{ subtitle: { subtitle_body: string } }> } | undefined;
		const body = subtitle?.subtitle_list?.[0]?.subtitle.subtitle_body;
		if (!body) {
			return { ok: false, reason: "no-lyrics" };
		}
		const lyrics = parseMusixmatchSubtitle(body);
		return lyrics ? { ok: true, lyrics } : { ok: false, reason: "no-lyrics" };
	}

	private async fetchRichsync(trackId: number, durationMs: number, context: ProviderContext) {
		const params = new URLSearchParams({
			format: "json",
			app_id: "web-desktop-app-v1.0",
			track_id: String(trackId),
			f_richsync_length: String(Math.floor(durationMs / 1000)),
			f_richsync_length_max_deviation: "1",
			usertoken: context.musixmatchToken ?? "",
		});
		try {
			const payload = await requestMusixmatch<MusixmatchRichsyncResponse>({
				targetUrl: `https://apic-desktop.musixmatch.com/ws/1.1/track.richsync.get?${params.toString()}`,
				proxyBaseUrl: context.musixmatchProxyBaseUrl,
				cosmosGet: context.cosmosGet,
				cosmosHeaders: MUSIXMATCH_DESKTOP_HEADERS,
				fetch: context.fetch,
			});
			const richsyncBody = payload.message?.body?.richsync?.richsync_body;
			return richsyncBody ? parseMusixmatchRichsync(richsyncBody) : undefined;
		} catch {
			return undefined;
		}
	}

	private extractTrackId(body: Record<string, unknown>): number | undefined {
		const track = body.track;
		if (!track || typeof track !== "object") {
			return undefined;
		}
		const trackId = (track as { track_id?: unknown }).track_id;
		return typeof trackId === "number" && Number.isFinite(trackId) ? trackId : undefined;
	}

	private isTemporaryBlock(header: MusixmatchHeader): boolean {
		if ([401, 403, 429].includes(header.status_code)) {
			return true;
		}
		const text = `${header.hint ?? ""} ${header.mode ?? ""}`.toLowerCase();
		return text.includes("captcha") || text.includes("rate") || text.includes("too many") || text.includes("blocked");
	}

	private blockMessage(header: MusixmatchHeader): string {
		const detail = header.hint ?? header.mode;
		return detail ? `Musixmatch temporarily blocked by ${detail}.` : "Musixmatch temporarily blocked by captcha/rate-limit.";
	}
}
