import { describe, expect, test, vi } from "vitest";
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

	test("keeps the configured context while auto compact mode has no measured dimensions", () => {
		const container = document.createElement("div");
		const viewport = document.createElement("div");
		const track = document.createElement("div");
		viewport.append(track);
		container.append(viewport);
		for (let index = 0; index < 3; index += 1) {
			const row = document.createElement("div");
			row.className = `vocals-group${index === 1 ? " active" : ""}`;
			track.append(row);
		}
		const controller = new LyricsViewportController(
			track,
			viewport,
			container,
			{ interludeStyle: "dots", visibleContextLines: 1, compactMode: "auto" },
			[]
		);

		controller.update();

		expect(Array.from(track.children).every((row) => !row.classList.contains("out-of-context"))).toBe(true);
		expect(container.classList.contains("compact-mode")).toBe(false);
		controller.destroy();
	});

	test("writes no classes, measurements or transform while the focused row is unchanged", () => {
		const container = document.createElement("div");
		const viewport = document.createElement("div");
		const track = document.createElement("div");
		viewport.append(track);
		container.append(viewport);
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
		const rows = [0, 1, 2].map((index) => {
			const row = document.createElement("div");
			row.className = `vocals-group${index === 1 ? " active" : ""}`;
			Object.defineProperty(row, "offsetTop", { configurable: true, value: index * 180 });
			Object.defineProperty(row, "clientHeight", { configurable: true, value: 80 });
			track.append(row);
			return row;
		});
		const controller = new LyricsViewportController(track, viewport, container, { interludeStyle: "dots", visibleContextLines: 2 }, []);

		controller.update();
		const transform = track.style.transform;
		const toggles = rows.map((row) => vi.spyOn(row.classList, "toggle"));
		const heights = rows.map((row) => vi.spyOn(row, "getBoundingClientRect"));
		track.style.transform = "sentinel";

		controller.update();
		controller.update();

		expect(toggles.every((toggle) => toggle.mock.calls.length === 0)).toBe(true);
		expect(heights.every((height) => height.mock.calls.length === 0)).toBe(true);
		expect(track.style.transform).toBe("sentinel");

		rows[1].classList.remove("active");
		rows[2].classList.add("active");
		controller.update();

		expect(toggles[2]).toHaveBeenCalled();
		expect(track.style.transform).not.toBe("sentinel");
		expect(track.style.transform).not.toBe(transform);
		controller.destroy();
	});
});
