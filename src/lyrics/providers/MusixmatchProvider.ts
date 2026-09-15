import {
	applyMusixmatchPerformers,
	buildMusixmatchTranslationMap,
	type MusixmatchTranslationEntry,
	type MusixmatchTranslationMap,
	mergeMusixmatchTranslations,
	parseMusixmatchPerformerSnippets,
	parseMusixmatchRichsync,
	parseMusixmatchSubtitle,
} from "../parsers/MusixmatchParser";
import type { LyricsDocument, LyricsProvider, LyricsProviderMetadata, ProviderContext, ProviderResult, TrackIdentity } from "../types";
import {
	MUSIXMATCH_MOBILE_APP_ID,
	MUSIXMATCH_MOBILE_COSMOS_HEADERS,
	MUSIXMATCH_MOBILE_FETCH_HEADERS,
	musixmatchMobileUrl,
} from "./MusixmatchMobileApi";
import { MusixmatchRequestError, requestMusixmatch } from "./musixmatchProxy";

type MusixmatchHeader = {
	status_code?: number;
	hint?: string;
	mode?: string;
	retry_after?: number | string;
};

type MusixmatchCall = {
	message?: {
		header?: MusixmatchHeader;
		body?: Record<string, unknown>;
	};
};

type MusixmatchMacroResponse = {
	message?: {
		header?: MusixmatchHeader;
		body?: { macro_calls?: Record<string, MusixmatchCall> };
	};
};

type MusixmatchTranslationsResponse = {
	message?: {
		header?: MusixmatchHeader;
		body?: { translations_list?: MusixmatchTranslationEntry[] };
	};
};

type MusixmatchTrack = {
	track_id?: unknown;
	track_name?: unknown;
	artist_name?: unknown;
	track_length?: unknown;
	instrumental?: unknown;
	restricted?: unknown;
};

const TEMPORARY_BLOCK_COOLDOWN_MS = 1000 * 60 * 10;
const TRANSLATION_LANGUAGE = "ko";
const MAX_DURATION_DIFFERENCE_SECONDS = 15;
const MACRO_TIMEOUT_MS = 8000;
const TRANSLATION_TIMEOUT_MS = 3000;

const normalizedMetadata = (value: string): string =>
	value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "");

const isCompatibleMetadata = (expected: string, candidate: unknown): boolean => {
	if (typeof candidate !== "string" || candidate.trim() === "") {
		return true;
	}
	const normalizedExpected = normalizedMetadata(expected);
	const normalizedCandidate = normalizedMetadata(candidate);
	return normalizedExpected.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedExpected);
};

const isTruthy = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "true";
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const callBody = (call: MusixmatchCall | undefined): Record<string, unknown> | undefined => call?.message?.body;
const headerText = (header: MusixmatchHeader | undefined): string => `${header?.hint ?? ""} ${header?.mode ?? ""}`.toLowerCase();
const isCaptcha = (header: MusixmatchHeader | undefined): boolean => headerText(header).includes("captcha");

const retryAfterMs = (header: MusixmatchHeader | undefined): number | undefined => {
	const value = Number(header?.retry_after);
	return Number.isFinite(value) && value >= 0 ? value * 1000 : undefined;
};

/** Finds only translation-specific language declarations; missing metadata never triggers a guess request. */
const translationLanguages = (value: unknown): string[] => {
	const found = new Set<string>();
	const visit = (node: unknown, translationContext: boolean): void => {
		if (Array.isArray(node)) {
			for (const item of node) visit(item, translationContext);
			return;
		}
		const record = asRecord(node);
		if (!record) return;
		for (const [key, child] of Object.entries(record)) {
			const isTranslationField =
				translationContext || /translation.*language|language.*translation|available_languages|track_lyrics_translation_status/i.test(key);
			if (isTranslationField && typeof child === "string") found.add(child.toLowerCase());
			if (isTranslationField && Array.isArray(child)) {
				for (const item of child) {
					if (typeof item === "string") found.add(item.toLowerCase());
					else {
						const itemRecord = asRecord(item);
						const language = itemRecord?.language ?? itemRecord?.language_code ?? itemRecord?.selected_language ?? itemRecord?.to;
						if (typeof language === "string") found.add(language.toLowerCase());
						visit(item, true);
					}
				}
			} else visit(child, isTranslationField);
		}
	};
	visit(value, false);
	return [...found];
};

export class MusixmatchProvider implements LyricsProvider {
	public readonly id = "musixmatch";

	public supports(track: TrackIdentity): boolean {
		return !track.isLocal;
	}

	public async fetch(track: TrackIdentity, context: ProviderContext): Promise<ProviderResult> {
		try {
			return await this.fetchWithToken(track, context, true);
		} catch (error) {
			return this.errorResult(error);
		}
	}

	/** Fetches and merges a translation after the original document is already visible. */
	public async fetchTranslation(
		_track: TrackIdentity,
		lyrics: LyricsDocument,
		metadata: LyricsProviderMetadata | undefined,
		context: ProviderContext
	): Promise<LyricsDocument | undefined> {
		const musixmatch = metadata?.musixmatch;
		if (!musixmatch?.translationLanguages.includes(TRANSLATION_LANGUAGE) || context.signal?.aborted) return undefined;
		const translations = await this.fetchTranslations(musixmatch.trackId, context, true);
		return translations && translations.size > 0 ? mergeMusixmatchTranslations(lyrics, translations) : undefined;
	}

	private async fetchWithToken(track: TrackIdentity, context: ProviderContext, allowTokenRefresh: boolean): Promise<ProviderResult> {
		const payload = await this.fetchMacro(track, context);
		const macro = payload.message?.body?.macro_calls;
		const topLevelHeader = payload.message?.header;
		const matcher = macro?.["matcher.track.get"]?.message;
		const header = matcher?.header ?? topLevelHeader;
		if (!matcher || header?.status_code !== 200) {
			if (allowTokenRefresh && header?.status_code === 401 && !isCaptcha(header) && context.refreshMusixmatchToken && !context.signal?.aborted) {
				const token = await context.refreshMusixmatchToken();
				if (token) return this.fetchWithToken(track, { ...context, musixmatchToken: token }, false);
			}
			return this.statusResult(header);
		}
		if (!matcher.body || !this.matchesTrack(track, matcher.body)) {
			return { ok: false, reason: "no-lyrics", message: "Musixmatch returned a different track." };
		}
		const matchedTrack = this.extractTrack(matcher.body);
		if (isTruthy(matchedTrack?.restricted)) return { ok: false, reason: "restricted", message: "Musixmatch restricted this lyric." };
		if (isTruthy(matchedTrack?.instrumental))
			return { ok: false, reason: "instrumental", message: "Musixmatch identified this track as instrumental." };
		const lyricsRecord = asRecord(callBody(macro?.["track.lyrics.get"])?.lyrics);
		if (isTruthy(lyricsRecord?.restricted)) return { ok: false, reason: "restricted", message: "Musixmatch restricted this lyric." };
		if (isTruthy(lyricsRecord?.instrumental))
			return { ok: false, reason: "instrumental", message: "Musixmatch identified this track as instrumental." };
		if (context.signal?.aborted) return { ok: false, reason: "error", message: "aborted" };

		const metadata = this.metadata(matcher.body, macro);
		const performers = parseMusixmatchPerformerSnippets(matcher.body);
		const richsyncCall = macro?.["track.richsync.get"];
		const richsync = asRecord(callBody(richsyncCall)?.richsync)?.richsync_body;
		if (typeof richsync === "string" && richsyncCall?.message?.header?.status_code === 200) {
			try {
				const lyrics = parseMusixmatchRichsync(richsync);
				if (lyrics) return { ok: true, lyrics: applyMusixmatchPerformers(lyrics, performers), metadata };
			} catch {
				// The regular subtitle from this same macro response remains a valid fallback.
			}
		}
		const subtitleList = callBody(macro?.["track.subtitles.get"])?.subtitle_list;
		const subtitle = Array.isArray(subtitleList) ? asRecord(subtitleList[0]) : undefined;
		const subtitleBody = asRecord(subtitle?.subtitle)?.subtitle_body;
		if (typeof subtitleBody !== "string" || subtitleBody.trim() === "") return { ok: false, reason: "no-lyrics" };
		const lyrics = parseMusixmatchSubtitle(subtitleBody);
		return lyrics ? { ok: true, lyrics: applyMusixmatchPerformers(lyrics, performers), metadata } : { ok: false, reason: "no-lyrics" };
	}

	private async fetchMacro(track: TrackIdentity, context: ProviderContext): Promise<MusixmatchMacroResponse> {
		const duration = Math.floor(track.durationMs / 1000);
		const params = new URLSearchParams({
			format: "json",
			namespace: "lyrics_richsynched",
			subtitle_format: "mxm",
			app_id: MUSIXMATCH_MOBILE_APP_ID,
			q_album: track.album,
			q_artist: track.artist,
			q_artists: track.artist,
			q_track: track.title,
			track_spotify_id: track.uri,
			q_duration: String(track.durationMs / 1000),
			f_subtitle_length: String(duration),
			usertoken: context.musixmatchToken ?? "",
			optional_calls: "track.richsync",
			richsync_compact_type: "words",
			part: "track_lyrics_translation_status,track_structure,track_performer_tagging",
		});
		return requestMusixmatch<MusixmatchMacroResponse>({
			targetUrl: musixmatchMobileUrl("macro.subtitles.get", params),
			proxyBaseUrl: context.proxyBaseUrl,
			cosmosGet: context.cosmosGet,
			cosmosHeaders: MUSIXMATCH_MOBILE_COSMOS_HEADERS,
			fetchHeaders: MUSIXMATCH_MOBILE_FETCH_HEADERS,
			fetch: context.fetch,
			signal: context.signal,
			timeoutMs: MACRO_TIMEOUT_MS,
		});
	}

	private async fetchTranslations(
		trackId: number,
		context: ProviderContext,
		allowTokenRefresh: boolean
	): Promise<MusixmatchTranslationMap | undefined> {
		try {
			const params = new URLSearchParams({
				format: "json",
				app_id: MUSIXMATCH_MOBILE_APP_ID,
				track_id: String(trackId),
				selected_language: TRANSLATION_LANGUAGE,
				comment_format: "text",
				part: "user",
				usertoken: context.musixmatchToken ?? "",
			});
			const payload = await requestMusixmatch<MusixmatchTranslationsResponse>({
				targetUrl: musixmatchMobileUrl("crowd.track.translations.get", params),
				proxyBaseUrl: context.proxyBaseUrl,
				cosmosGet: context.cosmosGet,
				cosmosHeaders: MUSIXMATCH_MOBILE_COSMOS_HEADERS,
				fetchHeaders: MUSIXMATCH_MOBILE_FETCH_HEADERS,
				fetch: context.fetch,
				signal: context.signal,
				timeoutMs: TRANSLATION_TIMEOUT_MS,
			});
			const header = payload.message?.header;
			if (allowTokenRefresh && header?.status_code === 401 && !isCaptcha(header) && context.refreshMusixmatchToken && !context.signal?.aborted) {
				const token = await context.refreshMusixmatchToken();
				return token ? this.fetchTranslations(trackId, { ...context, musixmatchToken: token }, false) : undefined;
			}
			if (header?.status_code && header.status_code !== 200) return undefined;
			const map = buildMusixmatchTranslationMap(payload.message?.body?.translations_list ?? []);
			return map.size > 0 ? map : undefined;
		} catch {
			return undefined;
		}
	}

	private metadata(matcherBody: Record<string, unknown>, macro: Record<string, MusixmatchCall> | undefined): LyricsProviderMetadata | undefined {
		const trackId = this.extractTrackId(matcherBody);
		return trackId ? { musixmatch: { trackId, translationLanguages: translationLanguages(macro) } } : undefined;
	}

	private extractTrackId(body: Record<string, unknown>): number | undefined {
		const trackId = this.extractTrack(body)?.track_id;
		const numeric = typeof trackId === "number" ? trackId : Number(trackId);
		return Number.isFinite(numeric) ? numeric : undefined;
	}

	private matchesTrack(requested: TrackIdentity, body: Record<string, unknown>): boolean {
		const matched = this.extractTrack(body);
		if (!matched) return true;
		if (!isCompatibleMetadata(requested.title, matched.track_name) || !isCompatibleMetadata(requested.artist, matched.artist_name)) return false;
		const duration = typeof matched.track_length === "number" ? matched.track_length : Number(matched.track_length);
		return !Number.isFinite(duration) || duration <= 0 || Math.abs(duration * 1000 - requested.durationMs) <= MAX_DURATION_DIFFERENCE_SECONDS * 1000;
	}

	private extractTrack(body: Record<string, unknown>): MusixmatchTrack | undefined {
		const track = body.track;
		return track && typeof track === "object" && !Array.isArray(track) ? (track as MusixmatchTrack) : undefined;
	}

	private statusResult(header: MusixmatchHeader | undefined): ProviderResult {
		const status = header?.status_code;
		if (status === 404) return { ok: false, reason: "no-lyrics", message: header?.hint };
		if (status === 401 || status === 403 || status === 429 || isCaptcha(header) || /rate|too many|blocked/i.test(headerText(header))) {
			return {
				ok: false,
				reason: "temporarily-unavailable",
				message: this.blockMessage(header),
				cooldownMs: retryAfterMs(header) ?? TEMPORARY_BLOCK_COOLDOWN_MS,
			};
		}
		return { ok: false, reason: "error", message: header?.hint ?? "Musixmatch request failed." };
	}

	private errorResult(error: unknown): ProviderResult {
		if (error instanceof MusixmatchRequestError) {
			if (error.status === 404) return { ok: false, reason: "no-lyrics", message: error.message };
			if (error.status === 401 || error.status === 403 || error.status === 429) {
				return {
					ok: false,
					reason: "temporarily-unavailable",
					message: error.message,
					cooldownMs: error.retryAfterMs ?? TEMPORARY_BLOCK_COOLDOWN_MS,
				};
			}
		}
		return { ok: false, reason: "error", message: error instanceof Error ? error.message : "Musixmatch request failed." };
	}

	private blockMessage(header: MusixmatchHeader | undefined): string {
		const detail = header?.hint ?? header?.mode;
		return detail ? `Musixmatch temporarily blocked by ${detail}.` : "Musixmatch temporarily blocked by captcha/rate-limit.";
	}
}
