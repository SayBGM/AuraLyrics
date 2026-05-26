import { describe, expect, test } from "vitest";
import { pickAccentColor } from "../../src/app/TrackAccentService";

describe("TrackAccentService", () => {
	test("picks the first valid Spicetify color in visual priority order", () => {
		expect(
			pickAccentColor({
				VIBRANT_NON_ALARMING: "transparent",
				PROMINENT: "#112233",
				VIBRANT: "#445566",
				DARK_VIBRANT: "#000000",
				DESATURATED: "#777777",
				LIGHT_VIBRANT: "#ffffff",
			})
		).toBe("#112233");
	});

	test("returns undefined when the color extractor palette has no valid hex color", () => {
		expect(
			pickAccentColor({
				VIBRANT_NON_ALARMING: "",
				PROMINENT: "rgb(1, 2, 3)",
				VIBRANT: "blue",
				DARK_VIBRANT: "#12345",
				DESATURATED: "#xyzxyz",
				LIGHT_VIBRANT: "none",
			})
		).toBeUndefined();
	});
});
