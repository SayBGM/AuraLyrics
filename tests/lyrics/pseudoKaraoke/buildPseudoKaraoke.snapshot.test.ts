// Safety-net snapshots for buildPseudoKaraokeLyrics: capture exact output (no rounding)
// before the B1 computation-order refactor, so the refactor can be proven output-identical.
import { describe, expect, test } from "vitest";
import { buildPseudoKaraokeLyrics } from "../../../src/lyrics/pseudoKaraoke/buildPseudoKaraoke";
import type { LineLyrics } from "../../../src/lyrics/types";
import { buildVocalAnalysis } from "./fixtures";

const koreanLine = (): LineLyrics => ({
	type: "line",
	startTime: 2,
	endTime: 6,
	content: [{ type: "vocal", text: "별빛이 내린 밤에 우리는 걸었다", startTime: 2, endTime: 6, oppositeAligned: false }],
});

const englishLine = (): LineLyrics => ({
	type: "line",
	startTime: 1,
	endTime: 5,
	content: [{ type: "vocal", text: "hello bright world tonight", startTime: 1, endTime: 5, oppositeAligned: false }],
});

const mixedLine = (): LineLyrics => ({
	type: "line",
	startTime: 2,
	endTime: 9,
	content: [
		{ type: "vocal", text: "별빛이 내린 밤에", startTime: 2, endTime: 6, oppositeAligned: false },
		{ type: "interlude", startTime: 6, endTime: 7 },
		{ type: "vocal", text: "hello bright world", startTime: 7, endTime: 9, oppositeAligned: false },
	],
});

const longDocumentTexts = [
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

const longDocument = (): LineLyrics => {
	const content: LineLyrics["content"] = [];
	let time = 0;
	for (const text of longDocumentTexts) {
		const start = time;
		const end = time + 3;
		content.push({ type: "vocal", text, startTime: start, endTime: end, oppositeAligned: false });
		time = end;
	}
	return { type: "line", startTime: 0, endTime: time, content };
};

const partialAnalysisLine = (): LineLyrics => ({
	type: "line",
	startTime: 2,
	endTime: 12,
	content: [{ type: "vocal", text: "별빛이 내린 밤에 hello bright world", startTime: 2, endTime: 12, oppositeAligned: false }],
});

describe("buildPseudoKaraokeLyrics output snapshots", () => {
	test("Korean line", () => {
		const analysis = buildVocalAnalysis(2, 6);
		expect(buildPseudoKaraokeLyrics(koreanLine(), analysis)).toMatchSnapshot();
	});

	test("English line", () => {
		const analysis = buildVocalAnalysis(1, 5);
		expect(buildPseudoKaraokeLyrics(englishLine(), analysis)).toMatchSnapshot();
	});

	test("mixed Korean/English line with interlude", () => {
		const analysis = buildVocalAnalysis(2, 9);
		expect(buildPseudoKaraokeLyrics(mixedLine(), analysis)).toMatchSnapshot();
	});

	test("long ~20-line document", () => {
		const doc = longDocument();
		const analysis = buildVocalAnalysis(0, doc.endTime);
		expect(buildPseudoKaraokeLyrics(doc, analysis)).toMatchSnapshot();
	});

	test("analysis undefined", () => {
		expect(buildPseudoKaraokeLyrics(koreanLine(), undefined)).toMatchSnapshot();
	});

	test("fixture analysis covers only part of the line", () => {
		// Line spans [2s, 12s] but analysis only has vocal-like segments across [2s, 6s].
		const analysis = buildVocalAnalysis(2, 6);
		expect(buildPseudoKaraokeLyrics(partialAnalysisLine(), analysis)).toMatchSnapshot();
	});
});
