import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: "src/extension.ts",
			name: "AuraLyrics",
			formats: ["iife"],
			fileName: () => "aura-lyrics.js",
		},
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
			},
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		include: ["tests/**/*.test.ts"],
	},
});
