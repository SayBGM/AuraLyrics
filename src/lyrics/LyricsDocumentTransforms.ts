import { addInterludes, rebuildInterludes } from "./InterludeBuilder";
import { normalizeLyrics } from "./LyricsNormalizer";
import { validateLyrics } from "./LyricsValidator";
import { splitHangulSyllables } from "./splitHangulSyllables";
import type { LyricsDocument } from "./types";

// Word-level syllable providers (Musixmatch) sync whole Hangul words as one
// token. Keep the canonical document intact and split only its display copy.
export const toDisplayLyrics = (lyrics: LyricsDocument): LyricsDocument => (lyrics.type === "syllable" ? splitHangulSyllables(lyrics) : lyrics);

export const prepareProviderLyrics = (lyrics: LyricsDocument): LyricsDocument => validateLyrics(addInterludes(normalizeLyrics(lyrics)));

export const restoreCachedLyrics = (lyrics: LyricsDocument): LyricsDocument => toDisplayLyrics(validateLyrics(rebuildInterludes(lyrics)));
