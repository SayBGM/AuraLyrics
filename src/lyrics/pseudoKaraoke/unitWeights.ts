// §4 — getUnitWeight: how long a unit is likely to be sung, as a relative number.
import { AGGRESSIVE } from "./tokenize";
import { clamp } from "./utils";

const HANGUL_SYLLABLES = /^[가-힣]$/;
const HANGUL_ANY = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const JAPANESE = /[぀-ヿㇰ-ㇿ]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const PUNCT = /[^\p{L}\p{N}\s]/u;

const isHangul = (char: string): boolean => HANGUL_ANY.test(char);
const isJapanese = (char: string): boolean => JAPANESE.test(char);
const isHan = (char: string): boolean => HAN.test(char);
const isPunct = (char: string): boolean => PUNCT.test(char);

// Complex vowels (jung index) → held longer. ㅘㅙㅚ ㅝㅞㅟ ㅢ
const COMPLEX_VOWELS = new Set([9, 10, 11, 14, 15, 16, 19]);
// Sonorant finals (jong index) ㄴㄹㅁㅇ etc → slightly longer.
const SUSTAIN_FINALS = new Set([4, 8, 16, 21, 27]);
const KO_PARTICLES = new Set([
	"은",
	"는",
	"이",
	"가",
	"을",
	"를",
	"도",
	"만",
	"에",
	"엔",
	"로",
	"으로",
	"와",
	"과",
	"랑",
	"이랑",
	"한테",
	"께",
	"의",
	"야",
]);

const JP_SMALL = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮヵヶ]/;
const JP_PART = new Set(["は", "が", "を", "に", "へ", "と", "も", "で", "の", "ね", "よ", "か", "な", "さ"]);

const HAN_PART = new Set(["的", "了", "吗", "呢", "啊", "呀", "吧", "啦", "嘛", "着", "过"]);

const LATIN_CONNECTORS = new Set(["a", "an", "the", "to", "of", "in", "on", "at", "for", "and", "or", "but"]);

type HangulMeta = { jung: number; jong: number };

const hangulMeta = (char: string): HangulMeta | undefined => {
	if (!HANGUL_SYLLABLES.test(char)) {
		return undefined;
	}
	const offset = (char.codePointAt(0) ?? 0) - 0xac00;
	return { jung: Math.floor(offset / 28) % 21, jong: offset % 28 };
};

export const hangulWeight = (text: string, repeated: number): number => {
	let total = 0;
	for (const char of [...text]) {
		const meta = hangulMeta(char);
		if (!meta) {
			total += 0.8;
			continue;
		}
		let weight = 0.96;
		if (COMPLEX_VOWELS.has(meta.jung)) {
			weight += 0.18;
		}
		if (meta.jong === 0) {
			weight += 0.12;
		} else if (SUSTAIN_FINALS.has(meta.jong)) {
			weight += 0.03;
		} else {
			weight -= 0.04;
		}
		total += weight;
	}
	const penalty = KO_PARTICLES.has(text) ? 0.76 : 1;
	return clamp((total + repeated * 0.14) * penalty, 0.78, 7.2);
};

export const japaneseWeight = (text: string, repeated: number): number => {
	let mora = 0;
	for (const char of [...text]) {
		if (JP_SMALL.test(char)) {
			mora += 0.1;
			continue;
		}
		if (char === "ー") {
			mora += 0.58;
			continue;
		}
		if ("っッんン".includes(char)) {
			mora += 0.7;
			continue;
		}
		mora += 0.98;
	}
	const penalty = JP_PART.has(text) ? 0.74 : 1;
	return clamp((mora + repeated * 0.16) * penalty, 0.72, 7);
};

export const hanWeight = (text: string, repeated: number): number => {
	const count = [...text].length;
	const penalty = count <= 2 && HAN_PART.has(text) ? 0.8 : 1;
	return clamp((count * 0.97 + repeated * 0.12) * penalty, 0.8, 6.8);
};

export const latinWeight = (text: string, chars: string[], repeated: number): number => {
	const lower = text.toLowerCase();
	const vowelGroups = (lower.match(/[aeiouy]+/g) ?? []).length;
	const letters = chars.filter((char) => /[A-Za-z]/.test(char)).length;
	const digits = chars.filter((char) => /[0-9]/.test(char)).length;
	const units = Math.max(vowelGroups, Math.ceil(letters / 3.4), digits);
	const penalty = LATIN_CONNECTORS.has(lower) ? 0.72 : 1;
	const tailBoost = /(ing|ed|er|est|oo|ee|ah|oh)$/i.test(text) ? 0.42 : 0;
	return clamp((units * 0.95 + tailBoost + repeated * 0.15) * penalty, 0.75, 6.8);
};

export const getUnitWeight = (unit: string): number => {
	const trimmed = unit.trim();
	if (!trimmed) {
		return Math.max(0.2, unit.length * 0.15);
	}
	const chars = [...trimmed];
	const repeated = chars.reduce((count, char, index) => count + (index && char === chars[index - 1] ? 1 : 0), 0);

	if (chars.every(isPunct)) {
		return Math.max(0.22, chars.length * 0.18);
	}
	if (chars.every(isHangul)) {
		return hangulWeight(trimmed, repeated);
	}
	if (chars.every(isJapanese)) {
		return japaneseWeight(trimmed, repeated);
	}
	if (chars.every(isHan)) {
		return hanWeight(trimmed, repeated);
	}
	if (chars.every((char) => AGGRESSIVE.test(char))) {
		return Math.max(0.9, chars.length + repeated * 0.28);
	}
	if (/[A-Za-z0-9]/.test(trimmed)) {
		return latinWeight(trimmed, chars, repeated);
	}
	return Math.max(0.45, chars.length * 0.4);
};
