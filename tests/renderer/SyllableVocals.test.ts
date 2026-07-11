import { describe, expect, test } from "vitest";
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

describe("SyllableVocals live spring tuning", () => {
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
