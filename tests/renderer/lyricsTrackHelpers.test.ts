import { describe, expect, test, vi } from "vitest";
import { createProviderCreditElement } from "../../src/renderer/components/ProviderCredit";

describe("createProviderCreditElement", () => {
	test("creates a localized canonical provider credit and diagnostics in the supplied document", () => {
		const ownerDocument = document.implementation.createHTMLDocument("pip");
		const createElement = vi.spyOn(ownerDocument, "createElement");

		const credit = createProviderCreditElement(ownerDocument, {
			provider: "lrclib",
			language: "ko",
			loadSource: "network",
			showDiagnostics: true,
			diagnostics: {
				cache: { status: "miss", primaryProvider: "spotify" },
				attempts: [{ provider: "lrclib", status: "success" }],
			},
		});

		expect(createElement).toHaveBeenCalledTimes(3);
		expect(credit.querySelector(".provider-credit-label")?.textContent).toBe("가사 제공: LRCLIB");
		expect(credit.querySelector(".provider-diagnostics")?.textContent).toContain("network · cache miss");
		expect(credit.querySelector(".provider-diagnostics")?.textContent).toContain("lrclib: success");
	});
});
