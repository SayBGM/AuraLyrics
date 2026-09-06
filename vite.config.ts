import type { Plugin } from "vite";
import { defineConfig } from "vite";

const STYLE_MODULE_PATTERN = /\/src\/(styles\/.*\.ts|settings\/settingsStyles\.ts|settings\/styles\/.*\.ts)$/;

type CssSegment = { protected: boolean; text: string };

const tokenizeCss = (css: string): CssSegment[] => {
	const segments: CssSegment[] = [];
	let buffer = "";
	let i = 0;
	const n = css.length;
	const flush = () => {
		if (buffer) {
			segments.push({ protected: false, text: buffer });
			buffer = "";
		}
	};
	while (i < n) {
		const ch = css[i];
		if (ch === "/" && css[i + 1] === "*") {
			const end = css.indexOf("*/", i + 2);
			i = end === -1 ? n : end + 2;
			buffer += " ";
			continue;
		}
		if (ch === '"' || ch === "'") {
			flush();
			const quote = ch;
			let j = i + 1;
			let literal = ch;
			while (j < n) {
				const c = css[j];
				if (c === "\\") {
					literal += c + (css[j + 1] ?? "");
					j += 2;
					continue;
				}
				literal += c;
				j += 1;
				if (c === quote) break;
			}
			segments.push({ protected: true, text: literal });
			i = j;
			continue;
		}
		if (css.startsWith("url(", i)) {
			flush();
			const end = css.indexOf(")", i + 4);
			const stop = end === -1 ? n : end + 1;
			segments.push({ protected: true, text: css.slice(i, stop) });
			i = stop;
			continue;
		}
		buffer += ch;
		i += 1;
	}
	flush();
	return segments;
};

// Minifies plain CSS text: strips comments, collapses whitespace runs to a single space, and
// removes spacing around a conservative set of punctuation. Content inside quoted strings and
// url(...) is left byte-for-byte untouched.
const minifyCss = (css: string): string => {
	const segments = tokenizeCss(css);
	const rendered = segments
		.map((segment) => {
			if (segment.protected) return segment.text;
			return segment.text.replace(/\s+/g, " ").replace(/\s*([{};:,>])\s*/g, "$1");
		})
		.join("");
	return rendered.replace(/;\}/g, "}").trim();
};

// esbuild leaves the contents of template literals alone, so the ~64KB of hand-formatted CSS in
// src/styles/** and src/settings/settingsStyles.ts ships to dist verbatim (tabs, newlines and
// all). This plugin minifies just those template literals at build time; source files (and the
// vitest run, which never applies build-only plugins) are untouched.
const minifyStyleTemplateLiterals = (): Plugin => ({
	name: "aura-lyrics-minify-style-templates",
	apply: "build",
	transform(code, id) {
		const [path] = id.split("?");
		if (!STYLE_MODULE_PATTERN.test(path)) return null;

		let result = "";
		let changed = false;
		let i = 0;
		const n = code.length;
		while (i < n) {
			const ch = code[i];
			if (ch === "`") {
				let j = i + 1;
				let raw = "";
				let hasInterpolation = false;
				while (j < n) {
					const c = code[j];
					if (c === "\\") {
						raw += c + (code[j + 1] ?? "");
						j += 2;
						continue;
					}
					if (c === "`") break;
					if (c === "$" && code[j + 1] === "{") hasInterpolation = true;
					raw += c;
					j += 1;
				}
				if (hasInterpolation) {
					result += code.slice(i, j + 1);
				} else {
					result += `\`${minifyCss(raw)}\``;
					changed = true;
				}
				i = j + 1;
				continue;
			}
			result += ch;
			i += 1;
		}

		if (!changed) return null;
		return { code: result, map: null };
	},
});

export default defineConfig({
	plugins: [minifyStyleTemplateLiterals()],
	build: {
		target: "chrome110",
		minify: "esbuild",
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
		coverage: {
			provider: "v8",
			include: ["src/**"],
		},
	},
});
