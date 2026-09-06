import { describe, expect, test } from "vitest";
import { applyUrlProxy } from "../../src/lyrics/providers/urlProxy";

describe("applyUrlProxy", () => {
	test("returns the target URL unchanged when no proxy base URL is configured", () => {
		expect(applyUrlProxy("https://example.com/api?q=1", undefined)).toBe("https://example.com/api?q=1");
	});

	test("prefixes the proxy base URL with the target URL percent-encoded", () => {
		const result = applyUrlProxy("https://example.com/api?q=hello world", "https://proxy.example.com/?url=");

		expect(result).toBe(`https://proxy.example.com/?url=${encodeURIComponent("https://example.com/api?q=hello world")}`);
	});

	test("percent-encodes reserved characters in the target URL so the proxy sees a single query value", () => {
		const result = applyUrlProxy("https://example.com/a&b=c", "https://proxy.example.com/?url=");

		expect(result).not.toContain("&b=c");
		expect(result).toContain(encodeURIComponent("https://example.com/a&b=c"));
	});
});
