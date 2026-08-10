import { describe, expect, test, vi } from "vitest";
import type { SyllableVocal } from "../../src/lyrics/types";
import type { Spring } from "../../src/renderer/animation/Spring";
import { SyllableVocals } from "../../src/renderer/components/SyllableVocals";
import { DEFAULT_SETTINGS } from "../../src/settings/settingsSchema";

type LiveSpringSet = {
	scale: Spring;
	yOffset: Spring;
	glow: Spring;
};

const vocal: SyllableVocal = {
	startTime: 0,
	endTime: 10,
	syllables: [{ text: "Aurora", startTime: 0, endTime: 10, isPartOfWord: false }],
};

const liveSprings = (vocals: SyllableVocals): LiveSpringSet => (vocals as unknown as { liveSyllables: LiveSpringSet[] }).liveSyllables[0];

const domRect = (left: number, width: number): DOMRect =>
	({ left, right: left + width, top: 0, bottom: 40, width, height: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

describe("SyllableVocals live spring tuning", () => {
	test("groups character-timed syllables across words into one weighted visual-row highlight track", () => {
		const vocals = new SyllableVocals(
			{
				startTime: 0,
				endTime: 5,
				syllables: [
					{ text: "가", startTime: 0, endTime: 1, isPartOfWord: false },
					{ text: "사", startTime: 1, endTime: 2, isPartOfWord: false },
					{ text: "랑", startTime: 2, endTime: 3, isPartOfWord: false },
					{ text: "해", startTime: 3, endTime: 5, isPartOfWord: false },
				],
			},
			false,
			DEFAULT_SETTINGS
		);
		const tracks = vocals.element.querySelectorAll<HTMLElement>(".syllable-main.syllable-highlight-track");
		const track = tracks[0];
		const syllables = track?.querySelectorAll<HTMLElement>(".syllable.highlight-target");
		const decoration = vocals.getHighlightDecorationTracks()[0];

		expect(tracks).toHaveLength(1);
		expect(track?.textContent).toBe("가사랑해");
		expect(track?.querySelectorAll(".word")).toHaveLength(4);
		expect(track?.dir).toBe("auto");
		expect(track?.classList.contains("idle")).toBe(true);
		expect(track?.style.getPropertyValue("--highlight-track-progress-ratio")).toBe("0");
		expect(Array.from(syllables ?? []).every((syllable) => syllable.classList.contains("idle"))).toBe(true);
		expect(Array.from(syllables ?? []).every((syllable) => !syllable.hasAttribute("dir"))).toBe(true);
		expect(decoration.decorationLayer.getAttribute("aria-hidden")).toBe("true");
		expect(Array.from(syllables ?? []).every((syllable) => !syllable.contains(decoration.decorationLayer))).toBe(true);
		vi.spyOn(track, "getBoundingClientRect").mockReturnValue(domRect(0, 50));
		vi.spyOn(decoration.pieces[0].element, "getClientRects").mockReturnValue([domRect(0, 10)] as unknown as DOMRectList);
		vi.spyOn(decoration.pieces[1].element, "getClientRects").mockReturnValue([domRect(10, 10)] as unknown as DOMRectList);
		vi.spyOn(decoration.pieces[2].element, "getClientRects").mockReturnValue([domRect(20, 10)] as unknown as DOMRectList);
		vi.spyOn(decoration.pieces[3].element, "getClientRects").mockReturnValue([domRect(30, 20)] as unknown as DOMRectList);
		decoration.measureAndApply();

		vocals.animate(1.5, 1 / 60, true);

		// 10 completed pixels + (10 pixels * 50%) over 50 rendered pixels.
		expect(track?.style.getPropertyValue("--highlight-track-progress-ratio")).toBe("0.3");
		expect(track?.classList.contains("active")).toBe(true);
		expect(track?.classList.contains("idle")).toBe(false);
		expect(track?.classList.contains("sung")).toBe(false);

		vocals.animate(6, 1 / 60, true);

		expect(track?.style.getPropertyValue("--highlight-track-progress-ratio")).toBe("1");
		expect(track?.classList.contains("active")).toBe(false);
		expect(track?.classList.contains("idle")).toBe(false);
		expect(track?.classList.contains("sung")).toBe(true);
	});

	test("snaps spring state to the sampled motion when deltaTime is zero", () => {
		const vocals = new SyllableVocals(vocal, false, DEFAULT_SETTINGS);
		vocals.animate(2, 1 / 60);

		vocals.animate(5, 0);

		const springs = liveSprings(vocals);
		expect(springs.scale.position).toBe(springs.scale.target);
		expect(springs.yOffset.position).toBe(springs.yOffset.target);
		expect(springs.glow.position).toBe(springs.glow.target);
		expect(springs.scale.isSleeping()).toBe(true);
		expect(springs.yOffset.isSleeping()).toBe(true);
		expect(springs.glow.isSleeping()).toBe(true);
	});

	test.each([
		[2.5, "25%"],
		[5, "50%"],
		[7.5, "75%"],
	] as const)("reuses lyric animation progress at %s seconds without synthetic-only DOM state", (timestamp, expectedProgress) => {
		const vocals = new SyllableVocals(vocal, false, DEFAULT_SETTINGS);
		const syllable = vocals.element.querySelector<HTMLElement>(".syllable.synced");

		vocals.animate(timestamp, 1 / 60, true);

		expect(syllable?.style.getPropertyValue("--gradient-progress")).toBe(expectedProgress);
		expect(syllable?.style.getPropertyValue("--synthetic-wake-progress")).toBe("");
		expect(syllable?.className).not.toContain("synthetic-wake");
	});

	test("marks the syllable and its highlight track as sung the instant progress reaches 100%, without a state gap", () => {
		const vocals = new SyllableVocals(vocal, false, DEFAULT_SETTINGS);
		const syllable = vocals.element.querySelector<HTMLElement>(".syllable.synced");
		const track = vocals.element.querySelector<HTMLElement>(".syllable-highlight-track");

		vocals.animate(vocal.endTime, 1 / 60, true);

		expect(syllable?.classList.contains("active")).toBe(false);
		expect(syllable?.classList.contains("sung")).toBe(true);
		expect(track?.classList.contains("active")).toBe(false);
		expect(track?.classList.contains("sung")).toBe(true);
	});

	test("keeps live spring identities and state while softness changes their next response", () => {
		const tuned = new SyllableVocals(vocal, false, DEFAULT_SETTINGS);
		const control = new SyllableVocals(vocal, false, DEFAULT_SETTINGS);
		tuned.animate(5, 1 / 60);
		control.animate(5, 1 / 60);
		const before = liveSprings(tuned);
		const positions = {
			scale: before.scale.position,
			yOffset: before.yOffset.position,
			glow: before.glow.position,
		};
		const targets = {
			scale: before.scale.target,
			yOffset: before.yOffset.target,
			glow: before.glow.target,
		};
		const element = tuned.element.querySelector(".syllable.synced");

		tuned.applySettings({ ...DEFAULT_SETTINGS, springSoftness: 1 });

		const after = liveSprings(tuned);
		expect(after.scale).toBe(before.scale);
		expect(after.yOffset).toBe(before.yOffset);
		expect(after.glow).toBe(before.glow);
		expect(tuned.element.querySelector(".syllable.synced")).toBe(element);
		expect({ scale: after.scale.position, yOffset: after.yOffset.position, glow: after.glow.position }).toEqual(positions);
		expect({ scale: after.scale.target, yOffset: after.yOffset.target, glow: after.glow.target }).toEqual(targets);

		tuned.animate(6, 1 / 60);
		control.animate(6, 1 / 60);

		expect(after.scale.position).not.toBe(liveSprings(control).scale.position);
		expect(after.yOffset.position).not.toBe(liveSprings(control).yOffset.position);
		expect(after.glow.position).not.toBe(liveSprings(control).glow.position);
	});
});
