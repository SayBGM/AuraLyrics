import { describe, expect, test } from "vitest";
import { pipStyles } from "../../src/styles/pipStyles";

describe("pipStyles", () => {
	test("keeps album art unscaled by default and pulls it inward during interludes", () => {
		expect(pipStyles).toContain("inset: 0");
		expect(pipStyles).toContain("width: 100%");
		expect(pipStyles).toContain("height: 100%");
		expect(pipStyles).toContain("transform: scale(1)");
		expect(pipStyles).toContain("#aura-lyrics-root.interlude-frame-active .pip-cover");
		expect(pipStyles).toContain("transform: scale(0.94)");
		expect(pipStyles).not.toContain("inset: -12%");
		expect(pipStyles).not.toContain("width: 124%");
		expect(pipStyles).not.toContain("transform: scale(1.1)");
	});

	test("allows long lyric lines to wrap inside the PiP viewport", () => {
		expect(pipStyles).toContain("max-width: 80vw");
		expect(pipStyles).toContain("white-space: normal");
		expect(pipStyles).toContain("overflow-wrap: break-word");
		expect(pipStyles).toContain("word-break: keep-all");
		expect(pipStyles).not.toContain("overflow-wrap: anywhere");
	});

	test("keeps PiP content and lyrics track inside a stable safe area", () => {
		const pipContentRule = pipStyles.match(/\.pip-content \{[^}]+\}/)?.[0] ?? "";
		const lyricsTrackRule = pipStyles.match(/\.lyrics-track \{[^}]+\}/)?.[0] ?? "";

		expect(pipContentRule).toContain("padding: 7vh 6vw");
		expect(pipContentRule).not.toContain("padding: 7vh 7vw");
		expect(lyricsTrackRule).toContain("margin: 0 12px");
	});

	test("shows instrumental album art in its original framing", () => {
		const albumCoverRule = pipStyles.match(/#aura-lyrics-root\.album-art-mode \.pip-cover \{[^}]+\}/)?.[0] ?? "";
		const albumScrimRule =
			pipStyles.match(
				/#aura-lyrics-root\.album-art-mode \.pip-scrim,\n#aura-lyrics-root\.album-art-mode \.pip-vignette,\n#aura-lyrics-root\.album-art-mode \.pip-border-frame \{[^}]+\}/
			)?.[0] ?? "";
		const albumContentRule = pipStyles.match(/#aura-lyrics-root\.album-art-mode \.pip-content \{[^}]+\}/)?.[0] ?? "";

		expect(albumCoverRule).toContain("object-fit: contain");
		expect(albumCoverRule).toContain("filter: none");
		expect(albumCoverRule).toContain("opacity: 1");
		expect(albumCoverRule).toContain("transform: scale(1)");
		expect(albumScrimRule).toContain("opacity: 0");
		expect(albumContentRule).toContain("opacity: 0");
		expect(albumContentRule).toContain("pointer-events: none");
	});

	test("keeps lyric tracking stable between inactive and active states", () => {
		const lyricRule = pipStyles.match(/\.lyric \{[^}]+\}/)?.[0] ?? "";
		const lineRule = pipStyles.match(/\.line \{[^}]+\}/)?.[0] ?? "";
		const syllableRule = pipStyles.match(/\.syllable \{[^}]+\}/)?.[0] ?? "";
		const activeLineRule = pipStyles.match(/\.line-group\.active \.line \{[^}]+\}/)?.[0] ?? "";
		const activeGroupLyricRule = pipStyles.match(/\.vocals-group\.active \.lyric \{[^}]+\}/)?.[0] ?? "";

		expect(lyricRule).toContain("letter-spacing: -0.018em");
		expect(lyricRule).toContain("word-spacing: 0.14em");
		expect(lineRule).toContain("letter-spacing: -0.018em");
		expect(lineRule).toContain("word-spacing: 0.04em");
		expect(syllableRule).not.toContain("letter-spacing");
		expect(syllableRule).not.toContain("word-spacing");
		expect(lineRule).not.toContain("letter-spacing 360ms ease");
		expect(lineRule).not.toContain("word-spacing 360ms ease");
		expect(activeLineRule).not.toContain("letter-spacing");
		expect(activeLineRule).toContain("word-spacing: 0.04em");
		expect(activeLineRule).toContain("--text-shadow-opacity: 34%");
		expect(activeLineRule).toContain("--text-shadow-blur-radius: calc(12px * var(--motion-intensity, 1))");
		expect(activeGroupLyricRule).not.toContain("letter-spacing");
		expect(activeGroupLyricRule).not.toContain("word-spacing");
	});

	test("keeps visible spacing between lyric words", () => {
		const lyricRule = pipStyles.match(/\.lyric \{[^}]+\}/)?.[0] ?? "";
		const activeGroupLyricRule = pipStyles.match(/\.vocals-group\.active \.lyric \{[^}]+\}/)?.[0] ?? "";
		const syllableWordRowRule = pipStyles.match(/\.syllable-main,\n\.syllable-echo \{[^}]+\}/)?.[0] ?? "";

		expect(lyricRule).toContain("word-spacing: 0.14em");
		expect(activeGroupLyricRule).toBe("");
		expect(syllableWordRowRule).toContain("column-gap: 0.24em");
		expect(syllableWordRowRule).toContain("row-gap: 0.08em");
	});

	test("anchors left and natural aligned active lyric scaling away from the clipped edge", () => {
		expect(pipStyles).toContain(".lyrics-track.align-left .vocals-group");
		expect(pipStyles).toContain(".lyrics-track.align-natural .vocals-group");
		expect(pipStyles).toContain("transform-origin: left center");
	});

	test("keeps interlude indicators centered regardless of lyric alignment", () => {
		expect(pipStyles).toContain(".lyrics-track.align-left .interlude");
		expect(pipStyles).toContain(".lyrics-track.align-natural .interlude");
		expect(pipStyles).toContain("align-self: center");
		expect(pipStyles).toContain("text-align: center");
		expect(pipStyles).toContain("transform-origin: center");
	});

	test("reserves bleed space so active lyric glow is not clipped", () => {
		const vocalsGroupRule = pipStyles.match(/\.vocals-group \{[^}]+\}/)?.[0] ?? "";
		const activeGroupRule = pipStyles.match(/\.vocals-group\.active \{[^}]+\}/)?.[0] ?? "";
		const viewportRule = pipStyles.match(/\.lyrics-viewport \{[^}]+\}/)?.[0] ?? "";

		expect(viewportRule).toContain("width: 100%");
		expect(viewportRule).toContain("height: 100%");
		expect(viewportRule).not.toContain("--lyrics-viewport-bleed");
		expect(viewportRule).not.toContain("margin: calc(-1 * var(--lyrics-viewport-bleed))");
		expect(vocalsGroupRule).toContain("--lyric-glow-bleed: calc(var(--lyrics-size) * 0.46)");
		expect(vocalsGroupRule).toContain("padding-block: var(--lyric-glow-bleed)");
		expect(vocalsGroupRule).toContain("margin-block: calc(-1 * var(--lyric-glow-bleed))");
		expect(vocalsGroupRule).toContain("margin-inline: 0");
		expect(activeGroupRule).toContain("--lyric-glow-bleed: calc(var(--lyrics-size) * 0.58)");
		expect(viewportRule).toContain("#000 9%");
		expect(viewportRule).toContain("#000 91%");
	});

	test("uses the previous lyric treatment for next context rows", () => {
		const vocalsPreviousRule = pipStyles.match(/\.vocals-group\.context-previous \{[^}]+\}/)?.[0] ?? "";
		const vocalsNextRule = pipStyles.match(/\.vocals-group\.context-next \{[^}]+\}/)?.[0] ?? "";
		const syllablePreviousRule = pipStyles.match(/\.syllable-row\.context-previous \{[^}]+\}/)?.[0] ?? "";
		const syllableNextRule = pipStyles.match(/\.syllable-row\.context-next \{[^}]+\}/)?.[0] ?? "";
		const normalizeRule = (rule: string) => rule.replace(/context-(previous|next)/g, "context");

		expect(normalizeRule(vocalsNextRule)).toBe(normalizeRule(vocalsPreviousRule));
		expect(normalizeRule(syllableNextRule)).toBe(normalizeRule(syllablePreviousRule));
	});

	test("keeps previous and next context lyrics equally readable", () => {
		const vocalsPreviousRule = pipStyles.match(/\.vocals-group\.context-previous \{[^}]+\}/)?.[0] ?? "";
		const vocalsNextRule = pipStyles.match(/\.vocals-group\.context-next \{[^}]+\}/)?.[0] ?? "";
		const syllablePreviousRule = pipStyles.match(/\.syllable-row\.context-previous \{[^}]+\}/)?.[0] ?? "";
		const syllableNextRule = pipStyles.match(/\.syllable-row\.context-next \{[^}]+\}/)?.[0] ?? "";
		const contextLineRule = pipStyles.match(/\.line-group\.context-previous \.line,\n\.line-group\.context-next \.line \{[^}]+\}/)?.[0] ?? "";

		expect(vocalsPreviousRule).toContain("opacity: 0.48");
		expect(vocalsNextRule).toContain("opacity: 0.48");
		expect(vocalsPreviousRule).toContain("filter: blur(calc(var(--inactive-blur) * 0.55))");
		expect(vocalsNextRule).toContain("filter: blur(calc(var(--inactive-blur) * 0.55))");
		expect(syllablePreviousRule).toContain("opacity: 0.48");
		expect(syllableNextRule).toContain("opacity: 0.48");
		expect(contextLineRule).toContain("color: rgba(255, 255, 255, 0.72)");
	});

	test("styles parenthetical word lyrics as right-aligned lowered echoes without reserving lyric width", () => {
		expect(pipStyles).toContain(".syllable-row");
		expect(pipStyles).toContain(".syllable-main");
		expect(pipStyles).toContain(".syllable-echo");
		expect(pipStyles).toContain(".parenthetical-word");
		expect(pipStyles).toContain(".syllable-row.parenthetical-only .parenthetical-word .lyric");
		expect(pipStyles).toContain("grid-template-columns: minmax(0, 1fr)");
		expect(pipStyles).toContain("grid-area: 1 / 1");
		expect(pipStyles).not.toContain("minmax(28%, auto)");
		expect(pipStyles).toContain("justify-content: end");
		expect(pipStyles).toContain("--parenthetical-echo-offset: calc(var(--lyrics-size) * 0.82)");
		expect(pipStyles).toContain("--parenthetical-echo-clearance: calc(var(--lyrics-size) * 0.38)");
		expect(pipStyles).toContain(".syllable-row.has-parenthetical-echo");
		expect(pipStyles).toContain("padding-bottom: calc(var(--parenthetical-echo-offset) + var(--parenthetical-echo-clearance))");
		expect(pipStyles).toContain("transform: translateY(var(--parenthetical-echo-offset))");
		expect(pipStyles).toContain("font-size: calc(var(--lyrics-size) * 0.72)");
		expect(pipStyles).toContain("font-size: var(--lyrics-size)");
	});

	test("styles Korean long-tail syllables without changing word layout", () => {
		const wordRule = pipStyles.match(/\.korean-tail-word \{[^}]+\}/)?.[0] ?? "";
		const sustainRule = pipStyles.match(/\.korean-tail-sustain \{[^}]+\}/)?.[0] ?? "";
		const activeRule = pipStyles.match(/\.korean-tail-sustain\.active \{[^}]+\}/)?.[0] ?? "";
		const melismaActiveRule = pipStyles.match(/\.korean-melisma-sustain\.active \{[^}]+\}/)?.[0] ?? "";

		expect(wordRule).toContain("column-gap: 0");
		expect(sustainRule).toContain("transform-origin: center");
		expect(activeRule).toContain("filter: saturate(1.08)");
		expect(activeRule).toContain("text-shadow");
		expect(melismaActiveRule).toContain("filter: saturate(calc(1.08 + var(--melisma-step, 0) * 0.025))");
		expect(melismaActiveRule).toContain("text-shadow");
	});

	test("styles a colored interlude frame and soft lyric blur", () => {
		expect(pipStyles).toContain(".pip-border-frame");
		expect(pipStyles).toContain(".pip-frame-surface");
		expect(pipStyles).toContain(".pip-frame-inner-shadow");
		expect(pipStyles).toContain(".pip-frame-progress");
		expect(pipStyles).toContain(".pip-frame-progress-top");
		expect(pipStyles).toContain("--pip-frame-size: clamp(12px, 3.4vmin, 18px)");
		expect(pipStyles).not.toContain("--pip-frame-size: 18px");
		expect(pipStyles).toContain("inset: -1px");
		expect(pipStyles).toContain("width: calc(100% * var(--pip-frame-progress-top, 0))");
		expect(pipStyles).toContain("top: var(--pip-frame-size)");
		expect(pipStyles).toContain("bottom: var(--pip-frame-size)");
		expect(pipStyles).toContain("height: calc((100% - (var(--pip-frame-size) * 2)) * var(--pip-frame-progress-right, 0))");
		expect(pipStyles).toContain("height: calc((100% - (var(--pip-frame-size) * 2)) * var(--pip-frame-progress-left, 0))");
		expect(pipStyles).toContain("border-radius: 0");
		expect(pipStyles).toContain("--pip-interlude-progress: 0");
		expect(pipStyles).toContain("--pip-interlude-progress-percent: 0%");
		expect(pipStyles).toContain("rgba(var(--pip-accent-rgb, 248, 248, 244), calc(0.36 + var(--pip-interlude-progress, 0) * 0.52))");
		expect(pipStyles).toContain("brightness(calc(0.92 + var(--pip-interlude-progress, 0) * 0.22))");
		expect(pipStyles).toContain("inset 0 18px 28px rgba(255, 255, 255, 0.16)");
		expect(pipStyles).toContain("inset 0 -18px 32px rgba(0, 0, 0, 0.26)");
		expect(pipStyles).not.toContain(".pip-border-progress");
		expect(pipStyles).not.toContain("stroke-dashoffset");
		expect(pipStyles).not.toContain("conic-gradient(");
		expect(pipStyles).not.toContain("stroke: url(#pip-border-progress-gradient)");
		expect(pipStyles).toContain("#aura-lyrics-root.interlude-frame-active .pip-content");
		expect(pipStyles).toContain("scale(0.875)");
		expect(pipStyles).toContain(".aura-lyrics.interlude-active");
		expect(pipStyles).toContain(".interlude-pill");
		expect(pipStyles).toContain(".interlude-dot");
		expect(pipStyles).toContain(".interlude-wave");
		expect(pipStyles).toContain(".interlude-wave-bar");
		expect(pipStyles).toContain("@keyframes interlude-wave-live");
		expect(pipStyles).not.toContain(".interlude-frame {");
		expect(pipStyles).not.toContain("width: var(--interlude-progress, 0%)");
	});

	test("animates wave interludes only while playback and the interlude are active", () => {
		const activePillRule = pipStyles.match(/\.interlude\.active \.interlude-pill \{[^}]+\}/)?.[0] ?? "";
		const activeDotRule = pipStyles.match(/\.interlude\.active \.interlude-dot \{[^}]+\}/)?.[0] ?? "";
		const activePlayingPillRule = pipStyles.match(/#aura-lyrics-root\.is-playing \.interlude\.active \.interlude-pill \{[^}]+\}/)?.[0] ?? "";
		const activePlayingDotRule = pipStyles.match(/#aura-lyrics-root\.is-playing \.interlude\.active \.interlude-dot \{[^}]+\}/)?.[0] ?? "";
		const waveBarRule = pipStyles.match(/\.interlude-wave-bar \{[^}]+\}/)?.[0] ?? "";
		const activePlayingRule = pipStyles.match(/#aura-lyrics-root\.is-playing \.interlude\.active \.interlude-wave-bar \{[^}]+\}/)?.[0] ?? "";

		expect(activePillRule).not.toContain("animation: interlude-breathe");
		expect(activeDotRule).not.toContain("animation: interlude-dot");
		expect(activePlayingPillRule).toContain("animation: interlude-breathe var(--interlude-pill-cycle, 1.45s) ease-in-out infinite");
		expect(activePlayingDotRule).toContain("animation: interlude-dot var(--interlude-dot-cycle, 1.1s) ease-in-out infinite");
		expect(waveBarRule).not.toContain("animation: interlude-wave-live");
		expect(activePlayingRule).toContain("animation: interlude-wave-live var(--interlude-wave-cycle, 1.32s) ease-in-out infinite");
		expect(activePlayingRule).toContain("animation-delay: calc(var(--bar-index, 0) * 62ms)");
	});
});
