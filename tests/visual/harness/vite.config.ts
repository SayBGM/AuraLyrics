import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const harnessRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
	root: harnessRoot,
	server: {
		fs: {
			allow: [repoRoot],
		},
	},
});
