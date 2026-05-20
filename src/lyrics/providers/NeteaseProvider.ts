import { normalizeText } from "../LyricsNormalizer";
import { parseLrc } from "../parsers/LrcParser";
import type { LyricsProvider, ProviderContext, ProviderResult, TrackIdentity } from "../types";

type NeteaseSearchResponse = {
	result?: {
		songs?: Array<{ id: number; duration: number; album: { name: string } }>;
	};
};

type NeteaseLyricResponse = {
	lrc?: {
		lyric?: string;
	};
};

export class NeteaseProvider implements LyricsProvider {
	public readonly id = "netease";

	public supports(track: TrackIdentity): boolean {
		return !track.isLocal;
	}

	public async fetch(track: TrackIdentity, context: ProviderContext): Promise<ProviderResult> {
		const headers = { "User-Agent": "Mozilla/5.0" };
		const query = encodeURIComponent(`${normalizeText(track.title)} ${track.artist}`);
		const search = await context.cosmosGet<NeteaseSearchResponse>(
			`https://music.xianqiao.wang/neteaseapiv2/search?limit=10&type=1&keywords=${query}`,
			null,
			headers
		);
		const candidates = search.result?.songs;
		if (!candidates?.length) {
			return { ok: false, reason: "no-lyrics", message: "Cannot find track." };
		}
		const candidate = candidates.find((item) => Math.abs(track.durationMs - item.duration) < 1000) ?? candidates[0];
		const lyric = await context.cosmosGet<NeteaseLyricResponse>(`https://music.xianqiao.wang/neteaseapiv2/lyric?id=${candidate.id}`, null, headers);
		if (!lyric.lrc?.lyric) {
			return { ok: false, reason: "no-lyrics" };
		}
		return { ok: true, lyrics: parseLrc(lyric.lrc.lyric) };
	}
}
