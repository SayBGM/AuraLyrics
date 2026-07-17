import { describe, expect, test } from "vitest";
import { contextStateForRow, focusedRowIndex, LyricsViewportController } from "../../src/renderer/LyricsViewportController";

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

	test.each([
		[180, [true, true, false, true, true]],
		[300, [true, false, false, false, true]],
		[420, [false, false, false, false, false]],
	] as const)("caps context rows for a %dpx-high PiP", (height, expected) => {
		const container = document.createElement("div");
		const viewport = document.createElement("div");
		const track = document.createElement("div");
		viewport.append(track);
		container.append(viewport);
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: height });
		for (let index = 0; index < 5; index += 1) {
			const row = document.createElement("div");
			row.className = `vocals-group${index === 2 ? " active" : ""}`;
			track.append(row);
		}
		const controller = new LyricsViewportController(track, viewport, container, { interludeStyle: "dots", visibleContextLines: 2 }, []);

		controller.update();

		expect(Array.from(track.children).map((row) => row.classList.contains("out-of-context"))).toEqual(expected);
		controller.destroy();
	});

	test("turns an active provider credit into a standalone scene", () => {
		const container = document.createElement("div");
		const viewport = document.createElement("div");
		const track = document.createElement("div");
		viewport.append(track);
		container.append(viewport);
		const lyric = document.createElement("div");
		lyric.className = "vocals-group sung";
		const credit = document.createElement("div");
		credit.className = "vocals-group provider-credit-timed active";
		track.append(lyric, credit);
		const controller = new LyricsViewportController(track, viewport, container, { interludeStyle: "dots", visibleContextLines: 2 }, []);

		controller.update();

		expect(lyric.classList.contains("out-of-context")).toBe(true);
		expect(credit.classList.contains("context-current")).toBe(true);
		controller.destroy();
	});
});
