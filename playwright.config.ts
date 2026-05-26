import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/visual",
	outputDir: "./test-results",
	snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
	fullyParallel: false,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: process.env.AURA_VISUAL_BASE_URL ?? "http://127.0.0.1:4173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				browserName: "chromium",
			},
		},
	],
	webServer: {
		command: "npx vite --host 127.0.0.1 --port 4173 --strictPort --config tests/visual/harness/vite.config.ts",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
