import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("release workflow", () => {
	test("publishes GitHub releases only for version tag runs", async () => {
		const workflow = await readFile(".github/workflows/release.yml", "utf8");
		const publishStep = workflow.slice(workflow.indexOf("- name: Publish GitHub release"));

		expect(publishStep).toContain("if: startsWith(github.ref, 'refs/tags/v')");
		expect(publishStep).toContain('TAG="$GITHUB_REF_NAME"');
		expect(publishStep).not.toMatch(/manual-\$\{GITHUB_RUN_NUMBER\}/);
	});
});
