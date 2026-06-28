import { describe, expect, test } from "vitest";
import { getUnitWeight } from "../../../src/lyrics/pseudoKaraoke/unitWeights";

describe("getUnitWeight", () => {
	test("Korean particles weigh less than content syllables", () => {
		expect(getUnitWeight("강")).toBeGreaterThan(getUnitWeight("는"));
	});

	test("Latin connectors weigh less than content words", () => {
		expect(getUnitWeight("mountain")).toBeGreaterThan(getUnitWeight("the"));
	});

	test("Latin sustained endings get a tail boost", () => {
		expect(getUnitWeight("running")).toBeGreaterThan(getUnitWeight("run"));
	});

	test("Japanese particles weigh less than content mora", () => {
		expect(getUnitWeight("こ")).toBeGreaterThan(getUnitWeight("は"));
	});

	test("punctuation and whitespace stay light", () => {
		expect(getUnitWeight("!!")).toBeLessThan(0.5);
		expect(getUnitWeight(" ")).toBeLessThan(0.5);
	});

	test("weights stay within the documented clamp range", () => {
		for (const unit of ["가", "는", "水", "hello", "ねこ", "the"]) {
			const weight = getUnitWeight(unit);
			expect(weight).toBeGreaterThan(0);
			expect(weight).toBeLessThanOrEqual(7.2);
		}
	});
});
