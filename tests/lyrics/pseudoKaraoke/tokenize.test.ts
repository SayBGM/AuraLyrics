import { describe, expect, test } from "vitest";
import { chunkSize, tokenizeLine } from "../../../src/lyrics/pseudoKaraoke/tokenize";

describe("tokenizeLine", () => {
	test("splits Hangul into single characters for slow lines", () => {
		const units = tokenizeLine("별빛이", { lineConfidence: 0.7, lineDurationMs: 3000 });
		expect(units).toEqual(["별", "빛", "이"]);
	});

	test("keeps Latin words whole", () => {
		const units = tokenizeLine("hello world");
		expect(units).toHaveLength(2);
		expect(units[0].trim()).toBe("hello");
		expect(units[1].trim()).toBe("world");
	});

	test("chunks CJK for fast lines", () => {
		const units = tokenizeLine("가나다라마바사아", { lineConfidence: 0.2, lineDurationMs: 800 });
		expect(units).toEqual(["가나다", "라마바", "사아"]);
	});

	test("preserves trailing whitespace on the last chunk of a token", () => {
		const units = tokenizeLine("별빛이 내린", { lineConfidence: 0.7, lineDurationMs: 4000 });
		expect(units.some((unit) => /\s$/.test(unit))).toBe(true);
	});
});

describe("chunkSize", () => {
	test("returns 1 for slow songs and high confidence", () => {
		expect(chunkSize("가나다", 0.7, 3000)).toBe(1);
		expect(chunkSize("가나다", 0.1, 3000)).toBe(1); // msPerChar >= 170
	});

	test("grows for fast, low-confidence songs", () => {
		expect(chunkSize("가나다라마바사아", 0.1, 800)).toBe(3);
		expect(chunkSize("가나다", 0.5, 390)).toBe(2); // msPerChar ≈ 130, conf ≥ 0.42
	});
});
