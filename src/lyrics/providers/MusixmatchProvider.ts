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
import type {
	LyricsDocument,
	LyricsProvider,
	LyricsProviderMetadata,
	ProviderContext,
	ProviderRequestDiagnostic,
	ProviderResult,
	TrackIdentity,
} from "../types";
import {
	MUSIXMATCH_MOBILE_APP_ID,
	MUSIXMATCH_MOBILE_COSMOS_HEADERS,
	MUSIXMATCH_MOBILE_FETCH_HEADERS,
	musixmatchMobileUrl,
} from "./MusixmatchMobileApi";
import { MusixmatchRequestError, requestMusixmatch, toMusixmatchRequestError } from "./musixmatchProxy";

type Header = { status_code?: number; hint?: string; mode?: string; retry_after?: number | string };
type Message<T> = { header?: Header; body?: T };
type Call = { message?: Message<Record<string, unknown>> };
type MacroResponse = { message?: Message<{ macro_calls?: Record<string, Call> }> };
type SubtitleResponse = { message?: Message<{ subtitle?: unknown; subtitle_list?: unknown }> };
type SearchResponse = { message?: Message<{ track_list?: unknown }> };
type TranslationsResponse = { message?: Message<{ translations_list?: MusixmatchTranslationEntry[] }> };
type MxmTrack = {
	track_id?: unknown;
	track_name?: unknown;
	artist_name?: unknown;
	track_length?: unknown;
	track_spotify_id?: unknown;
	instrumental?: unknown;
	restricted?: unknown;
};
type Budget = { deadline: number; requests: number; authRetries: number };

const BLOCK_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_DURATION_DIFFERENCE_SECONDS = 15;
const MACRO_TIMEOUT_MS = 8000;
const TRANSLATION_TIMEOUT_MS = 3000;
const FALLBACK_TIMEOUT_MS = 5000;
/** Search + subtitle are the only two logical recovery requests per fetch. */
const MAX_FALLBACK_REQUESTS = 2;
const REQUEST_DEADLINE_MS = 20_000;
const MAX_SEARCH_CANDIDATES = 5;
const TRANSLATION_LANGUAGE = "ko";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const bodyOf = (call: Call | undefined): Record<string, unknown> | undefined => call?.message?.body;
const headerText = (header: Header | undefined): string => `${header?.hint ?? ""} ${header?.mode ?? ""}`.toLowerCase();
const isCaptcha = (header: Header | undefined): boolean => headerText(header).includes("captcha");
const isRateLimit = (header: Header | undefined): boolean => header?.status_code === 429 || /rate|too many|blocked/i.test(headerText(header));
const isTruthy = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "true";
const normalize = (value: string): string =>
	value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "");
const VERSION_WORDS = /\b(acoustic|demo|edit|instrumental|karaoke|live|mix|remaster(?:ed)?|remix|version)\b/giu;
const versions = (value: string): string[] => [...value.matchAll(VERSION_WORDS)].map(([word]) => word.toLowerCase()).sort();

const retryAfterMs = (header: Header | undefined): number | undefined => {
	const value = Number(header?.retry_after);
	return Number.isFinite(value) && value >= 0 ? value * 1000 : undefined;
};

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
			const inTranslation =
				translationContext || /translation.*language|language.*translation|available_languages|track_lyrics_translation_status/i.test(key);
			if (inTranslation && typeof child === "string") found.add(child.toLowerCase());
			if (inTranslation && Array.isArray(child)) {
				for (const item of child) {
					if (typeof item === "string") found.add(item.toLowerCase());
					else {
						const itemRecord = asRecord(item);
						const language = itemRecord?.language ?? itemRecord?.language_code ?? itemRecord?.selected_language ?? itemRecord?.to;
						if (typeof language === "string") found.add(language.toLowerCase());
						visit(item, true);
					}
				}
			} else visit(child, inTranslation);
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
		const diagnostics: ProviderRequestDiagnostic[] = [];
		const budget = this.budget();
		try {
			return await this.fetchWithToken(track, context, true, diagnostics, budget);
		} catch (error) {
			return this.errorResult(error, diagnostics);
		}
	}

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

	private async fetchWithToken(
		track: TrackIdentity,
		context: ProviderContext,
		allowRefresh: boolean,
		diagnostics: ProviderRequestDiagnostic[],
		budget: Budget
	): Promise<ProviderResult> {
		let payload: MacroResponse;
		try {
			payload = await this.fetchMacro(track, context, diagnostics, budget);
		} catch (error) {
			if (this.canRefresh(error, allowRefresh, context, budget)) {
				const token = await this.refreshToken(context, budget, diagnostics);
				if (token) return this.fetchWithToken(track, { ...context, musixmatchToken: token }, false, diagnostics, budget);
			}
			if (error instanceof MusixmatchRequestError && error.status === 404 && error.kind === "http")
				return this.searchFallback(track, context, allowRefresh, diagnostics, budget);
			throw error;
		}

		const macro = payload.message?.body?.macro_calls;
		this.recordMacroCalls(macro, diagnostics);
		const recoverSearch = (): ProviderResult | Promise<ProviderResult> => {
			for (const name of ["matcher.track.get", "track.richsync.get", "track.subtitles.get", "track.lyrics.get"] as const) {
				const header = macro?.[name]?.message?.header;
				if (this.isBlocked(header) || header?.status_code === 401) return this.statusResult(header, diagnostics, name);
			}
			return this.searchFallback(track, context, allowRefresh, diagnostics, budget);
		};
		const top = payload.message?.header;
		if (this.isBlocked(top) || (top?.status_code !== undefined && top.status_code !== 200)) {
			if (top?.status_code === 404 && !this.isBlocked(top)) return recoverSearch();
			return this.refreshOrStatus(track, context, allowRefresh, diagnostics, top ?? {}, "macro", budget);
		}

		const matcher = macro?.["matcher.track.get"]?.message;
		const matcherHeader = matcher?.header;
		if (!matcher || matcherHeader?.status_code !== 200 || !matcher.body) {
			if (matcherHeader?.status_code === 401)
				return this.refreshOrStatus(track, context, allowRefresh, diagnostics, matcherHeader, "macro.matcher", budget);
			if (this.isBlocked(matcherHeader)) return this.statusResult(matcherHeader, diagnostics, "macro.matcher");
			if (matcherHeader?.status_code === 404) return recoverSearch();
			return this.statusResult(matcherHeader, diagnostics, "macro.matcher");
		}

		const mismatch = this.mismatchReason(track, matcher.body);
		if (mismatch) {
			diagnostics.push({ stage: "macro.validation", outcome: mismatch, durationMs: 0 });
			return recoverSearch();
		}
		diagnostics.push({ stage: "macro.validation", outcome: "matched", durationMs: 0 });
		const matchedTrack = this.extractTrack(matcher.body);
		const restriction = this.restrictionResult(matchedTrack, diagnostics);
		if (restriction) return restriction;
		const lyricsRestriction = this.restrictionResult(asRecord(bodyOf(macro?.["track.lyrics.get"])?.lyrics), diagnostics);
		if (lyricsRestriction) return lyricsRestriction;
		if (context.signal?.aborted) return { ok: false, reason: "error", message: "aborted", diagnostics };

		const metadata = this.metadata(matcher.body, macro);
		const performers = parseMusixmatchPerformerSnippets(matcher.body);
		const richsyncCall = macro?.["track.richsync.get"];
		const richsync = asRecord(bodyOf(richsyncCall)?.richsync)?.richsync_body;
		if (richsyncCall?.message?.header?.status_code === 200 && !this.isBlocked(richsyncCall.message.header) && typeof richsync === "string") {
			try {
				const lyrics = parseMusixmatchRichsync(richsync);
				if (lyrics) return { ok: true, lyrics: applyMusixmatchPerformers(lyrics, performers), metadata, diagnostics };
			} catch {
				diagnostics.push({ stage: "macro.richsync.parse", outcome: "invalid-response", durationMs: 0 });
			}
		}

		const subtitleCall = macro?.["track.subtitles.get"];
		const subtitleHeader = subtitleCall?.message?.header;
		let malformedSubtitle = false;
		if (!this.isBlocked(subtitleHeader) && (subtitleHeader?.status_code === undefined || subtitleHeader.status_code === 200)) {
			try {
				const subtitle = this.parseSubtitle(bodyOf(subtitleCall));
				if (subtitle) return { ok: true, lyrics: applyMusixmatchPerformers(subtitle, performers), metadata, diagnostics };
			} catch {
				malformedSubtitle = true;
				diagnostics.push({ stage: "macro.subtitle.parse", outcome: "invalid-response", durationMs: 0 });
			}
		}
		if (subtitleHeader?.status_code === 401)
			return this.refreshOrStatus(track, context, allowRefresh, diagnostics, subtitleHeader, "macro.subtitle", budget);
		if (this.isBlocked(subtitleHeader)) return this.statusResult(subtitleHeader, diagnostics, "macro.subtitle");

		for (const name of ["track.richsync.get", "track.lyrics.get"] as const) {
			const header = macro?.[name]?.message?.header;
			if (header?.status_code === 401) return this.refreshOrStatus(track, context, allowRefresh, diagnostics, header, name, budget);
			if (this.isBlocked(header)) return this.statusResult(header, diagnostics, name);
		}
		if (subtitleHeader?.status_code !== undefined && ![200, 404].includes(subtitleHeader.status_code)) {
			return this.statusResult(subtitleHeader, diagnostics, "macro.subtitle");
		}
		const trackId = this.trackId(matchedTrack);
		if (!trackId && malformedSubtitle) return this.errorResult(new MusixmatchRequestError("", "invalid-response"), diagnostics);
		if (!trackId) return { ok: false, reason: "no-lyrics", message: this.safeMessage("macro.subtitle", subtitleHeader, "missing"), diagnostics };
		const direct = await this.subtitleFallback(trackId, context, allowRefresh, diagnostics, budget, metadata, performers);
		if (!direct.result.ok && direct.result.reason === "no-lyrics") {
			for (const name of ["track.richsync.get", "track.lyrics.get"] as const) {
				const header = macro?.[name]?.message?.header;
				if (header?.status_code !== undefined && ![200, 404].includes(header.status_code)) return this.statusResult(header, diagnostics, name);
			}
		}
		if (!direct.result.ok && direct.result.reason === "no-lyrics" && malformedSubtitle) {
			return this.errorResult(new MusixmatchRequestError("", "invalid-response"), diagnostics);
		}
		return direct.result;
	}

	private async refreshOrStatus(
		track: TrackIdentity,
		context: ProviderContext,
		allowRefresh: boolean,
		diagnostics: ProviderRequestDiagnostic[],
		header: Header,
		stage: string,
		budget: Budget
	): Promise<ProviderResult> {
		if (
			allowRefresh &&
			header.status_code === 401 &&
			!isCaptcha(header) &&
			!isRateLimit(header) &&
			context.refreshMusixmatchToken &&
			!context.signal?.aborted
		) {
			try {
				const token = await this.refreshToken(context, budget, diagnostics);
				if (token) return this.fetchWithToken(track, { ...context, musixmatchToken: token }, false, diagnostics, budget);
			} catch (error) {
				return this.errorResult(error, diagnostics);
			}
		}
		return this.statusResult(header, diagnostics, stage);
	}

	private async searchFallback(
		track: TrackIdentity,
		context: ProviderContext,
		allowRefresh: boolean,
		diagnostics: ProviderRequestDiagnostic[],
		budget: Budget,
		authRetry = false
	): Promise<ProviderResult> {
		let payload: SearchResponse;
		try {
			payload = await this.fallbackRequest<SearchResponse>(
				"fallback.search",
				"track.search",
				new URLSearchParams({
					format: "json",
					app_id: MUSIXMATCH_MOBILE_APP_ID,
					q_track: track.title,
					q_artist: track.artist,
					f_has_subtitle: "1",
					s_track_rating: "desc",
					page_size: String(MAX_SEARCH_CANDIDATES),
					page: "1",
					usertoken: context.musixmatchToken ?? "",
				}),
				context,
				diagnostics,
				budget,
				authRetry
			);
		} catch (error) {
			if (this.canRefresh(error, allowRefresh, context, budget)) {
				try {
					const token = await this.refreshToken(context, budget, diagnostics);
					if (token) return this.searchFallback(track, { ...context, musixmatchToken: token }, false, diagnostics, budget, true);
				} catch (refreshError) {
					return this.errorResult(refreshError, diagnostics);
				}
			}
			return this.fallbackError(error, diagnostics);
		}
		const header = payload.message?.header;
		if (header?.status_code === 401 && allowRefresh && !isCaptcha(header) && !isRateLimit(header) && context.refreshMusixmatchToken) {
			try {
				const token = await this.refreshToken(context, budget, diagnostics);
				if (token) return this.searchFallback(track, { ...context, musixmatchToken: token }, false, diagnostics, budget, true);
			} catch (error) {
				return this.errorResult(error, diagnostics);
			}
		}
		if (this.isBlocked(header) || (header?.status_code !== undefined && header.status_code !== 200))
			return this.fallbackStatus(header, diagnostics, "fallback.search");
		const list = payload.message?.body?.track_list;
		if (!Array.isArray(list)) return this.errorResult(new MusixmatchRequestError("", "invalid-response"), diagnostics);
		const candidates = list.slice(0, MAX_SEARCH_CANDIDATES);
		let matches = candidates
			.map((entry) => this.extractTrack(asRecord(entry) ?? {}))
			.filter((candidate): candidate is MxmTrack => Boolean(candidate && !this.candidateMismatch(track, candidate)));
		const linked = matches.filter(
			(candidate) =>
				typeof candidate.track_spotify_id === "string" &&
				candidate.track_spotify_id.replace(/^spotify:track:/, "") === track.uri.replace(/^spotify:track:/, "")
		);
		if (linked.length === 1) matches = linked;
		if (matches.length !== 1) {
			diagnostics.push({ stage: "fallback.validation", outcome: matches.length > 1 ? "ambiguous" : "no-safe-candidate", durationMs: 0 });
			return { ok: false, reason: "no-lyrics", message: "Musixmatch fallback found no unique safe match.", diagnostics };
		}
		diagnostics.push({ stage: "fallback.validation", outcome: "matched", durationMs: 0 });
		const candidate = matches[0];
		const restriction = this.restrictionResult(candidate, diagnostics);
		if (restriction) return restriction;
		const trackId = this.trackId(candidate);
		if (!trackId) return { ok: false, reason: "no-lyrics", message: "Musixmatch fallback candidate has no track id.", diagnostics };
		return (await this.subtitleFallback(trackId, context, allowRefresh, diagnostics, budget, { musixmatch: { trackId, translationLanguages: [] } }))
			.result;
	}

	private async subtitleFallback(
		trackId: number,
		context: ProviderContext,
		allowRefresh: boolean,
		diagnostics: ProviderRequestDiagnostic[],
		budget: Budget,
		metadata?: LyricsProviderMetadata,
		performers: ReturnType<typeof parseMusixmatchPerformerSnippets> = [],
		authRetry = false
	): Promise<{ result: ProviderResult; status?: number; terminal: boolean }> {
		let payload: SubtitleResponse;
		try {
			payload = await this.fallbackRequest<SubtitleResponse>(
				"fallback.subtitle",
				"track.subtitle.get",
				new URLSearchParams({
					format: "json",
					app_id: MUSIXMATCH_MOBILE_APP_ID,
					track_id: String(trackId),
					subtitle_format: "mxm",
					usertoken: context.musixmatchToken ?? "",
				}),
				context,
				diagnostics,
				budget,
				authRetry
			);
		} catch (error) {
			if (this.canRefresh(error, allowRefresh, context, budget)) {
				try {
					const token = await this.refreshToken(context, budget, diagnostics);
					if (token)
						return this.subtitleFallback(trackId, { ...context, musixmatchToken: token }, false, diagnostics, budget, metadata, performers, true);
				} catch (refreshError) {
					return { result: this.errorResult(refreshError, diagnostics), terminal: true };
				}
			}
			const result = this.fallbackError(error, diagnostics);
			return { result, status: error instanceof MusixmatchRequestError ? error.status : undefined, terminal: true };
		}
		const header = payload.message?.header;
		if (header?.status_code === 401 && allowRefresh && !isCaptcha(header) && !isRateLimit(header) && context.refreshMusixmatchToken) {
			try {
				const token = await this.refreshToken(context, budget, diagnostics);
				if (token)
					return this.subtitleFallback(trackId, { ...context, musixmatchToken: token }, false, diagnostics, budget, metadata, performers, true);
			} catch (error) {
				return { result: this.errorResult(error, diagnostics), terminal: true };
			}
		}
		if (this.isBlocked(header) || (header?.status_code !== undefined && header.status_code !== 200)) {
			return { result: this.fallbackStatus(header, diagnostics, "fallback.subtitle"), status: header?.status_code, terminal: true };
		}
		const lyrics = this.parseSubtitle(payload.message?.body);
		if (!lyrics) {
			return {
				result: { ok: false, reason: "no-lyrics", message: "Musixmatch fallback subtitle was empty.", diagnostics },
				status: 404,
				terminal: true,
			};
		}
		return { result: { ok: true, lyrics: applyMusixmatchPerformers(lyrics, performers), metadata, diagnostics }, status: 200, terminal: true };
	}

	private async fallbackRequest<T>(
		stage: string,
		path: string,
		params: URLSearchParams,
		context: ProviderContext,
		diagnostics: ProviderRequestDiagnostic[],
		budget: Budget,
		authRetry = false
	): Promise<T> {
		this.checkBudget(context, budget);
		const remaining = budget.deadline - Date.now();
		if ((!authRetry && budget.requests >= MAX_FALLBACK_REQUESTS) || remaining <= 0) {
			diagnostics.push({ stage, outcome: "budget-exhausted", durationMs: 0 });
			throw new MusixmatchRequestError("", "timeout");
		}
		if (!authRetry) budget.requests += 1;
		const startedAt = Date.now();
		try {
			const response = await requestMusixmatch<T>({
				targetUrl: musixmatchMobileUrl(path, params),
				proxyBaseUrl: context.proxyBaseUrl,
				cosmosGet: context.cosmosGet,
				cosmosHeaders: MUSIXMATCH_MOBILE_COSMOS_HEADERS,
				fetchHeaders: MUSIXMATCH_MOBILE_FETCH_HEADERS,
				fetch: context.fetch,
				signal: context.signal,
				timeoutMs: Math.min(remaining, FALLBACK_TIMEOUT_MS),
			});
			const status = this.responseHeader(response)?.status_code;
			diagnostics.push({
				stage,
				status,
				outcome: status === undefined || status === 200 ? "response" : "rejected",
				durationMs: Date.now() - startedAt,
			});
			return response;
		} catch (error) {
			diagnostics.push({
				stage,
				status: error instanceof MusixmatchRequestError ? error.status : undefined,
				outcome: error instanceof MusixmatchRequestError ? error.kind : context.signal?.aborted ? "aborted" : "error",
				durationMs: Date.now() - startedAt,
			});
			throw error;
		}
	}

	private async fetchMacro(
		track: TrackIdentity,
		context: ProviderContext,
		diagnostics: ProviderRequestDiagnostic[],
		budget: Budget
	): Promise<MacroResponse> {
		this.checkBudget(context, budget);
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
			f_subtitle_length: String(Math.floor(track.durationMs / 1000)),
			usertoken: context.musixmatchToken ?? "",
			optional_calls: "track.richsync",
			richsync_compact_type: "words",
			part: "track_lyrics_translation_status,track_structure,track_performer_tagging",
		});
		const startedAt = Date.now();
		try {
			const response = await requestMusixmatch<MacroResponse>({
				targetUrl: musixmatchMobileUrl("macro.subtitles.get", params),
				proxyBaseUrl: context.proxyBaseUrl,
				cosmosGet: context.cosmosGet,
				cosmosHeaders: MUSIXMATCH_MOBILE_COSMOS_HEADERS,
				fetchHeaders: MUSIXMATCH_MOBILE_FETCH_HEADERS,
				fetch: context.fetch,
				signal: context.signal,
				timeoutMs: Math.max(1, Math.min(MACRO_TIMEOUT_MS, budget.deadline - Date.now())),
			});
			const status = response.message?.header?.status_code;
			diagnostics.push({
				stage: "macro",
				status,
				outcome: status === undefined || status === 200 ? "response" : "rejected",
				durationMs: Date.now() - startedAt,
			});
			return response;
		} catch (error) {
			diagnostics.push({
				stage: "macro",
				status: error instanceof MusixmatchRequestError ? error.status : undefined,
				outcome: error instanceof MusixmatchRequestError ? error.kind : context.signal?.aborted ? "aborted" : "error",
				durationMs: Date.now() - startedAt,
			});
			throw error;
		}
	}

	private async fetchTranslations(trackId: number, context: ProviderContext, allowRefresh: boolean): Promise<MusixmatchTranslationMap | undefined> {
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
			const payload = await requestMusixmatch<TranslationsResponse>({
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
			if (
				allowRefresh &&
				header?.status_code === 401 &&
				!isCaptcha(header) &&
				!isRateLimit(header) &&
				context.refreshMusixmatchToken &&
				!context.signal?.aborted
			) {
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

	private budget(): Budget {
		return { deadline: Date.now() + REQUEST_DEADLINE_MS, requests: 0, authRetries: 0 };
	}

	private checkBudget(context: ProviderContext, budget: Budget): void {
		if (context.signal?.aborted) throw new MusixmatchRequestError("", "aborted");
		if (budget.deadline <= Date.now()) throw new MusixmatchRequestError("", "timeout");
	}

	private async refreshToken(context: ProviderContext, budget: Budget, diagnostics: ProviderRequestDiagnostic[]): Promise<string | undefined> {
		this.checkBudget(context, budget);
		if (!context.refreshMusixmatchToken || budget.authRetries >= 1) return undefined;
		budget.authRetries += 1;
		const startedAt = Date.now();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let abort: (() => void) | undefined;
		try {
			const stop = new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new MusixmatchRequestError("", "timeout")),
					Math.max(1, Math.min(MACRO_TIMEOUT_MS, budget.deadline - Date.now()))
				);
				abort = () => reject(new MusixmatchRequestError("", "aborted"));
				context.signal?.addEventListener("abort", abort, { once: true });
			});
			const token = await Promise.race([context.refreshMusixmatchToken(), stop]);
			diagnostics.push({ stage: "token.get", outcome: token ? "success" : "authentication", durationMs: Date.now() - startedAt });
			return token;
		} catch (error) {
			const safe = toMusixmatchRequestError(error, context.signal);
			diagnostics.push({ stage: "token.get", status: safe.status, outcome: safe.kind, durationMs: Date.now() - startedAt });
			throw safe;
		} finally {
			if (timer !== undefined) clearTimeout(timer);
			if (abort) context.signal?.removeEventListener("abort", abort);
		}
	}

	private canRefresh(error: unknown, allowRefresh: boolean, context: ProviderContext, budget: Budget): boolean {
		if (!allowRefresh || !context.refreshMusixmatchToken || context.signal?.aborted || budget.authRetries >= 1) return false;
		return error instanceof MusixmatchRequestError && error.kind === "authentication" && error.status === 401;
	}

	private recordMacroCalls(macro: Record<string, Call> | undefined, diagnostics: ProviderRequestDiagnostic[]): void {
		for (const name of ["matcher.track.get", "track.richsync.get", "track.subtitles.get", "track.lyrics.get"] as const) {
			const call = macro?.[name];
			if (!call) continue;
			const status = call.message?.header?.status_code;
			// These are bundled subcalls, so only the enclosing macro has a measured duration.
			diagnostics.push({ stage: name, status, outcome: status === 200 ? "response" : this.headerOutcome(call.message?.header), durationMs: 0 });
		}
	}

	private mismatchReason(track: TrackIdentity, body: Record<string, unknown>): string | undefined {
		const matched = this.extractTrack(body);
		if (!matched) return undefined;
		if (!this.compatibleMetadata(track.title, matched.track_name, false)) return "different-title";
		if (!this.compatibleMetadata(track.artist, matched.artist_name, false)) return "different-artist";
		const duration = this.number(matched.track_length);
		if (duration !== undefined && duration > 0 && Math.abs(duration * 1000 - track.durationMs) > MAX_DURATION_DIFFERENCE_SECONDS * 1000)
			return "different-duration";
		return undefined;
	}

	private candidateMismatch(track: TrackIdentity, candidate: MxmTrack): boolean {
		if (!this.compatibleMetadata(track.title, candidate.track_name, true)) return true;
		if (!this.compatibleMetadata(track.artist, candidate.artist_name, true)) return true;
		const duration = this.number(candidate.track_length);
		return duration === undefined || duration <= 0 || Math.abs(duration * 1000 - track.durationMs) > MAX_DURATION_DIFFERENCE_SECONDS * 1000;
	}

	private compatibleMetadata(expected: string, candidate: unknown, strict: boolean): boolean {
		if (typeof candidate !== "string" || candidate.trim() === "") return !strict;
		const expectedValue = normalize(expected);
		const candidateValue = normalize(candidate);
		if (!expectedValue || !candidateValue) return !strict;
		if (expectedValue !== candidateValue) return false;
		return versions(expected).join("|") === versions(candidate).join("|");
	}

	private number(value: unknown): number | undefined {
		const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	private extractTrack(body: Record<string, unknown>): MxmTrack | undefined {
		const track = asRecord(body.track);
		return track as MxmTrack | undefined;
	}

	private trackId(track: MxmTrack | undefined): number | undefined {
		const value = this.number(track?.track_id);
		return value !== undefined && value > 0 ? value : undefined;
	}

	private metadata(matcherBody: Record<string, unknown>, macro: Record<string, Call> | undefined): LyricsProviderMetadata | undefined {
		const trackId = this.trackId(this.extractTrack(matcherBody));
		return trackId ? { musixmatch: { trackId, translationLanguages: translationLanguages(macro) } } : undefined;
	}

	private parseSubtitle(body: Record<string, unknown> | undefined): ReturnType<typeof parseMusixmatchSubtitle> {
		const list = body?.subtitle_list;
		const first = Array.isArray(list) ? asRecord(list[0]) : undefined;
		const subtitle = asRecord(first?.subtitle) ?? asRecord(body?.subtitle);
		const source = subtitle?.subtitle_body;
		if (typeof source !== "string" || !source.trim()) return undefined;
		try {
			const lyrics = parseMusixmatchSubtitle(source);
			if (lyrics) return lyrics;
		} catch {
			/* Normalize parser failures at the provider boundary. */
		}
		throw new MusixmatchRequestError("", "invalid-response");
	}

	private restrictionResult(track: MxmTrack | undefined, diagnostics: ProviderRequestDiagnostic[]): ProviderResult | undefined {
		if (isTruthy(track?.restricted)) {
			diagnostics.push({ stage: "validation", outcome: "restricted", durationMs: 0 });
			return { ok: false, reason: "restricted", message: "Musixmatch restricted this lyric.", diagnostics };
		}
		if (isTruthy(track?.instrumental)) {
			diagnostics.push({ stage: "validation", outcome: "instrumental", durationMs: 0 });
			return { ok: false, reason: "instrumental", message: "Musixmatch identified this track as instrumental.", diagnostics };
		}
		return undefined;
	}

	private responseHeader(response: unknown): Header | undefined {
		return asRecord(asRecord(response)?.message)?.header as Header | undefined;
	}

	private isBlocked(header: Header | undefined): boolean {
		return Boolean(header && (isCaptcha(header) || isRateLimit(header) || header.status_code === 403));
	}

	private headerOutcome(header: Header | undefined): string {
		if (isCaptcha(header)) return "captcha";
		if (isRateLimit(header)) return "rate-limit";
		if (header?.status_code === 401 || header?.status_code === 403) return "authentication";
		return "http";
	}

	private statusResult(header: Header | undefined, diagnostics: ProviderRequestDiagnostic[], stage: string): ProviderResult {
		const outcome = this.headerOutcome(header);
		const status = header?.status_code;
		if (!this.isBlocked(header) && (status === 404 || status === 405))
			return { ok: false, reason: "no-lyrics", message: this.safeMessage(stage, header, "no-lyrics"), diagnostics };
		if (this.isBlocked(header) || status === 401)
			return {
				ok: false,
				reason: "temporarily-unavailable",
				message: this.blockMessage(header),
				cooldownMs: retryAfterMs(header) ?? BLOCK_COOLDOWN_MS,
				diagnostics,
			};
		return { ok: false, reason: "error", message: this.safeMessage(stage, header, outcome), diagnostics };
	}

	private fallbackStatus(header: Header | undefined, diagnostics: ProviderRequestDiagnostic[], stage: string): ProviderResult {
		return this.statusResult(header, diagnostics, stage);
	}

	private fallbackError(error: unknown, diagnostics: ProviderRequestDiagnostic[]): ProviderResult {
		return this.errorResult(error, diagnostics);
	}

	private errorResult(error: unknown, diagnostics: ProviderRequestDiagnostic[]): ProviderResult {
		const safe = toMusixmatchRequestError(error);
		if (["captcha", "rate-limit", "authentication"].includes(safe.kind)) {
			return { ok: false, reason: "temporarily-unavailable", message: safe.message, cooldownMs: safe.retryAfterMs ?? BLOCK_COOLDOWN_MS, diagnostics };
		}
		if (safe.kind === "http" && (safe.status === 404 || safe.status === 405)) {
			return { ok: false, reason: "no-lyrics", message: safe.message, diagnostics };
		}
		return { ok: false, reason: "error", message: safe.message, diagnostics };
	}

	private safeMessage(stage: string, header: Header | undefined, fallback: string): string {
		if (fallback === "no-lyrics") return "Musixmatch returned no lyrics.";
		if (isCaptcha(header)) return "Musixmatch captcha verification is required.";
		if (isRateLimit(header)) return "Musixmatch rate limit was reached.";
		if (header?.status_code === 401 || header?.status_code === 403) return "Musixmatch authentication failed.";
		return `Musixmatch ${stage} request failed.`;
	}

	private blockMessage(header: Header | undefined): string {
		if (isCaptcha(header)) return "Musixmatch captcha verification is required.";
		if (isRateLimit(header)) return "Musixmatch rate limit was reached.";
		return "Musixmatch authentication failed.";
	}
}
