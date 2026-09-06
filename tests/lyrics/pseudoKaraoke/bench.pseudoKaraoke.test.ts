import { describe, it } from "vitest";
import { buildPseudoKaraokeLyrics } from "../../../src/lyrics/pseudoKaraoke/buildPseudoKaraoke";
import type { LineLyrics } from "../../../src/lyrics/types";
import { buildVocalAnalysis } from "./fixtures";

// Ad-hoc benchmark, NOT part of CI (describe.skip): times buildPseudoKaraokeLyrics
// on a ~40-line document with a full-length fixture analysis, before/after the B1
// DP/rhythm computation-order refactor. Run manually with:
//   npx vitest run tests/lyrics/pseudoKaraoke/bench.pseudoKaraoke.test.ts -t "times a 40-line document"
describe.skip("bench: buildPseudoKaraokeLyrics", () => {
	it("times a 40-line document", () => {
		const texts = [
			"별빛이 내린 밤에",
			"우리는 함께 걸었다",
			"hello bright world",
			"singing softly tonight",
			"그대의 손을 잡고",
			"저 멀리 별들 아래",
			"walking through the rain",
			"dreaming of tomorrow",
			"내 마음속 깊은 곳에",
			"언제나 함께할게",
			"you and I together",
			"under the same sky",
			"바람이 불어와도",
			"우린 서로를 믿어",
			"through the darkest night",
			"we will find the light",
			"눈을 감고 느껴봐",
			"이 순간이 영원하길",
			"hold me close tonight",
			"never let me go",
		];
		const doubled = [...texts, ...texts]; // ~40 lines
		const content: LineLyrics["content"] = [];
		let time = 0;
		for (const text of doubled) {
			const start = time;
			const end = time + 3;
			content.push({ type: "vocal", text, startTime: start, endTime: end, oppositeAligned: false });
			time = end;
		}
		const lyrics: LineLyrics = { type: "line", startTime: 0, endTime: time, content };
		const analysis = buildVocalAnalysis(0, time);

		// Warm up (JIT).
		for (let i = 0; i < 3; i += 1) {
			buildPseudoKaraokeLyrics(lyrics, analysis);
		}

		const runs = 20;
		const startedAt = performance.now();
		for (let i = 0; i < runs; i += 1) {
			buildPseudoKaraokeLyrics(lyrics, analysis);
		}
		const elapsed = performance.now() - startedAt;
		console.log(`buildPseudoKaraokeLyrics: ${(elapsed / runs).toFixed(2)}ms/run over ${runs} runs (${doubled.length} lines)`);
	});
});
