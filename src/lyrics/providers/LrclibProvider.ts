import { parseLrc } from "../parsers/LrcParser";
import type { LyricsProvider, ProviderContext, ProviderResult, TrackIdentity } from "../types";
import { applyUrlProxy } from "./urlProxy";

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

type LrclibRecord = {
	trackName: string;
	artistName: string;
	albumName: string;
	duration?: number;
	instrumental: boolean;
	syncedLyrics?: string | null;
};

type RenderableCandidate = {
	record: LrclibRecord;
	lyrics: ReturnType<typeof parseLrc>;
	index: number;
};

const asLrclibRecord = (value: unknown): LrclibRecord | undefined => {
	const record = asRecord(value);
	if (
		!record ||
		typeof record.trackName !== "string" ||
		typeof record.artistName !== "string" ||
		typeof record.albumName !== "string" ||
		typeof record.instrumental !== "boolean" ||
		(record.duration !== undefined && typeof record.duration !== "number") ||
		(record.syncedLyrics !== undefined && record.syncedLyrics !== null && typeof record.syncedLyrics !== "string")
	) {
		return undefined;
	}
	return record as LrclibRecord;
};

const normalizeMetadata = (value: string): string => value.normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");

const compareCandidates = (track: TrackIdentity, left: RenderableCandidate, right: RenderableCandidate): number => {
	const expectedMetadata = [track.title, track.artist, track.album].map(normalizeMetadata);
	const leftMetadata = [left.record.trackName, left.record.artistName, left.record.albumName].map(normalizeMetadata);
	const rightMetadata = [right.record.trackName, right.record.artistName, right.record.albumName].map(normalizeMetadata);
	for (let index = 0; index < expectedMetadata.length; index += 1) {
		const leftMatches = leftMetadata[index] === expectedMetadata[index];
		const rightMatches = rightMetadata[index] === expectedMetadata[index];
		if (leftMatches !== rightMatches) {
			return Number(rightMatches) - Number(leftMatches);
		}
	}
	const leftDurationDifference =
		left.record.duration === undefined || !Number.isFinite(left.record.duration)
			? Number.POSITIVE_INFINITY
			: Math.abs(left.record.duration * 1000 - track.durationMs);
	const rightDurationDifference =
		right.record.duration === undefined || !Number.isFinite(right.record.duration)
			? Number.POSITIVE_INFINITY
			: Math.abs(right.record.duration * 1000 - track.durationMs);
	if (leftDurationDifference !== rightDurationDifference) {
		return leftDurationDifference - rightDurationDifference;
	}
	return left.index - right.index;
};

export class LrclibProvider implements LyricsProvider {
	public readonly id = "lrclib";

	public supports(track: TrackIdentity): boolean {
		return !track.isLocal;
	}

	public async fetch(track: TrackIdentity, context: ProviderContext): Promise<ProviderResult> {
		const searches = [
			new URLSearchParams({
				track_name: track.title,
				artist_name: track.artist,
				album_name: track.album,
			}),
			new URLSearchParams({ q: `${track.title} ${track.artist}` }),
		];
		let sawValidRecord = false;
		let sawNonInstrumentalRecord = false;
		for (const params of searches) {
			let response: Response;
			try {
				const targetUrl = `https://lrclib.net/api/search?${params.toString()}`;
				response = await context.fetch(applyUrlProxy(targetUrl, context.proxyBaseUrl), {
					headers: { "x-user-agent": context.userAgent },
				});
			} catch (error) {
				return { ok: false, reason: "error", message: errorMessage(error) };
			}
			if (!response.ok) {
				if (response.status === 404) {
					continue;
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
			if (!Array.isArray(decoded)) {
				return { ok: false, reason: "error", message: "LRCLIB returned a malformed payload." };
			}
			const records = decoded.map(asLrclibRecord).filter((record): record is LrclibRecord => record !== undefined);
			if (decoded.length > 0 && records.length === 0) {
				return { ok: false, reason: "error", message: "LRCLIB returned a malformed payload." };
			}
			if (records.length === 0) {
				continue;
			}
			sawValidRecord = true;
			const candidates: RenderableCandidate[] = [];
			for (const [index, record] of records.entries()) {
				if (record.instrumental) {
					continue;
				}
				sawNonInstrumentalRecord = true;
				const syncedLyrics = record.syncedLyrics;
				if (!syncedLyrics?.trim()) {
					continue;
				}
				const lyrics = parseLrc(syncedLyrics);
				if (hasRenderableVocals(lyrics)) {
					candidates.push({ record, lyrics, index });
				}
			}
			const candidate = candidates.sort((left, right) => compareCandidates(track, left, right))[0];
			if (candidate) {
				return { ok: true, lyrics: candidate.lyrics };
			}
		}
		return sawValidRecord && !sawNonInstrumentalRecord ? { ok: false, reason: "instrumental" } : { ok: false, reason: "no-lyrics" };
	}
}
