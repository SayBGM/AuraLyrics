import { describe, expect, test } from "vitest";
import { validateLyrics } from "../../src/lyrics/LyricsValidator";

describe("validateLyrics", () => {
	const base = {
		type: "line" as const,
		startTime: 0,
		endTime: 4,
		content: [{ type: "vocal" as const, text: "ok", startTime: 0, endTime: 4, oppositeAligned: false }],
	};
	test("sorts valid timed content", () => {
		const result = validateLyrics({
			...base,
			content: [...base.content, { type: "vocal", text: "first", startTime: -1, endTime: 0, oppositeAligned: false }],
		});
		expect(result.content[0]).toMatchObject({ text: "first" });
	});
	test("rejects invalid ranges", () => {
		expect(() => validateLyrics({ ...base, startTime: Number.NaN })).toThrow();
		expect(() => validateLyrics({ ...base, endTime: 0 })).toThrow();
		expect(() => validateLyrics({ ...base, content: [{ ...base.content[0], endTime: Number.POSITIVE_INFINITY }] })).toThrow();
	});
	test("rejects malformed static lyric lines", () => {
		expect(() => validateLyrics({ type: "static", lines: null } as never)).toThrow();
		expect(() => validateLyrics({ type: "static", lines: [{ text: 42 }] } as never)).toThrow();
		expect(() => validateLyrics({ type: "static", lines: [{ text: "ok", translatedText: 7 }] } as never)).toThrow();
	});
	test("rejects malformed timed lyric structures", () => {
		expect(() => validateLyrics({ ...base, content: [{ ...base.content[0], text: 42 }] } as never)).toThrow();
		expect(() => validateLyrics({ ...base, content: [{ type: "unknown", startTime: 0, endTime: 4 }] } as never)).toThrow();
		expect(() => validateLyrics({ ...base, content: null } as never)).toThrow();
		expect(() =>
			validateLyrics({
				type: "syllable",
				startTime: 0,
				endTime: 4,
				content: [{ type: "vocal", oppositeAligned: false, lead: { startTime: 0, endTime: 4, syllables: null } }],
			} as never)
		).toThrow();
	});
});
