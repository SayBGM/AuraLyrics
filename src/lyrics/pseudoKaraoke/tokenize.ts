// §3 — tokenizeLine: split a line into "units" that light up together.
// CJK / Hangul → per-character (chunked for fast songs), Latin → per-word.
// Whitespace tokens are preserved as units; the output stage drops them and
// uses them to decide word boundaries (isPartOfWord).

// Japanese kana/katakana, CJK ideographs, Hangul (jamo + syllables).
export const AGGRESSIVE = /[぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿ᄀ-ᇿ㄰-㆏가-힯]/;

export type TokenizeOptions = {
	lineConfidence?: number;
	lineDurationMs?: number;
};

export const tokenizeLine = (text: string, { lineConfidence = 0.5, lineDurationMs = 2000 }: TokenizeOptions = {}): string[] => {
	const coarse = text.match(/\S+\s*|\s+/g) ?? [text];
	const units: string[] = [];
	for (const token of coarse) {
		const trimmed = token.trim();
		if (!trimmed) {
			units.push(token);
			continue;
		}
		const aggressive = [...trimmed].some((char) => AGGRESSIVE.test(char));
		if (!aggressive) {
			units.push(token);
			continue;
		}
		const trail = (token.match(/\s+$/) ?? [""])[0];
		const core = trail ? token.slice(0, -trail.length) : token;
		const chars = [...core];
		const k = chunkSize(core, lineConfidence, lineDurationMs);
		for (let index = 0; index < chars.length; index += k) {
			const chunk = chars.slice(index, index + k).join("");
			units.push(index + k >= chars.length && trail ? chunk + trail : chunk);
		}
	}
	return units;
};

// estimateAggressiveChunkSize
export const chunkSize = (core: string, confidence: number, durationMs: number): number => {
	const count = [...core].length;
	if (count <= 1) {
		return 1;
	}
	const msPerChar = durationMs / Math.max(1, count);
	if (confidence >= 0.62 || msPerChar >= 170) {
		return 1;
	}
	if (confidence >= 0.42 || msPerChar >= 110) {
		return 2;
	}
	return count >= 8 ? 3 : 2;
};
