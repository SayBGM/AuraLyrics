import { describe, expect, test } from "vitest";
import { contextStateForRow, focusedRowIndex } from "../../src/renderer/LyricsViewportController";

describe("lyrics viewport model", () => {
	test("prefers an explicit preview row before active or sung rows", () => {
		const rows = [
			{ active: false, sung: true },
			{ active: true, sung: false },
			{ active: false, sung: false },
		];

		expect(focusedRowIndex(rows, 2)).toBe(2);
		expect(focusedRowIndex(rows)).toBe(1);
	});

	test("uses the latest sung row and derives the context window", () => {
		const rows = [
			{ active: false, sung: true },
			{ active: false, sung: true },
			{ active: false, sung: false },
		];

		const focused = focusedRowIndex(rows);
		expect(focused).toBe(1);
		expect([0, 1, 2, 3].map((index) => contextStateForRow(index, focused, 1))).toEqual([
			{ outOfContext: false, position: "previous" },
			{ outOfContext: false, position: "current" },
			{ outOfContext: false, position: "next" },
			{ outOfContext: true, position: undefined },
		]);
	});
});
