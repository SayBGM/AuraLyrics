import { describe, expect, test } from "vitest";
import {
	controlsStyles,
	highlightPreviewStyles,
	navigationStyles,
	responsiveStyles,
	settingsStyleModules,
	settingsStyles,
	shellStyles,
	trackDelayStyles,
} from "../../src/settings/settingsStyles";

// Every top-level selector (or @keyframes/@media block) from the original single-file
// settingsStyles.ts, captured before it was split into src/settings/styles/*.ts. This guards the
// split against silently dropping or mangling a rule: every one of these must still appear
// verbatim, somewhere, in the reassembled settingsStyles output.
const ORIGINAL_SELECTOR_HEADS: string[] = [
	"body.aura-lyrics-settings-open .main-trackCreditsModal-container",
	"body.aura-lyrics-settings-open .main-trackCreditsModal-mainSection",
	"body.aura-lyrics-settings-open .main-trackCreditsModal-originalCredits",
	".aura-lyrics-settings",
	".aura-lyrics-settings .settings-layout",
	".aura-lyrics-settings .settings-content",
	".aura-lyrics-settings .settings-navigation",
	".aura-lyrics-settings .settings-tab",
	".aura-lyrics-settings .settings-tab:hover",
	'.aura-lyrics-settings .settings-tab[aria-selected="true"]',
	'.aura-lyrics-settings .settings-tab[aria-selected="true"] svg',
	".aura-lyrics-settings .settings-panel-scroll",
	".aura-lyrics-settings .settings-panel",
	".aura-lyrics-settings .settings-panel h3",
	".aura-lyrics-settings .track-delay-card",
	".aura-lyrics-settings .track-delay-card h4",
	'.aura-lyrics-settings .track-delay-card[aria-disabled="true"]',
	".aura-lyrics-settings .track-delay-header",
	".aura-lyrics-settings .track-delay-metadata,\n.aura-lyrics-settings .track-delay-value-group",
	".aura-lyrics-settings .track-delay-metadata strong",
	".aura-lyrics-settings .track-delay-metadata span,\n.aura-lyrics-settings .track-delay-source,\n.aura-lyrics-settings .track-delay-hint,\n.aura-lyrics-settings .track-delay-empty",
	".aura-lyrics-settings .track-delay-value-group",
	".aura-lyrics-settings .track-delay-value",
	".aura-lyrics-settings .track-delay-actions",
	".aura-lyrics-settings .track-delay-actions .settings-action",
	".aura-lyrics-settings .track-delay-actions .track-delay-reset",
	".aura-lyrics-settings .settings-action:disabled",
	".aura-lyrics-settings .setting-row",
	".aura-lyrics-settings h3 + .setting-row",
	".aura-lyrics-settings .setting-row > span",
	".aura-lyrics-settings input,\n.aura-lyrics-settings select",
	'.aura-lyrics-settings input[type="range"]',
	'.aura-lyrics-settings input[type="checkbox"]',
	'.aura-lyrics-settings input[type="checkbox"]::after',
	'.aura-lyrics-settings input[type="checkbox"]:checked',
	'.aura-lyrics-settings input[type="checkbox"]:checked::after',
	".aura-lyrics-settings .settings-action",
	".aura-lyrics-settings .settings-action:hover",
	".aura-lyrics-settings .provider-controls",
	'.aura-lyrics-settings .provider-controls input[type="checkbox"]',
	".aura-lyrics-settings .icon-button",
	".aura-lyrics-settings .icon-button:hover",
	".aura-lyrics-settings .icon-button:disabled",
	".aura-lyrics-settings .muted",
	".aura-lyrics-settings .settings-status",
	".aura-lyrics-settings .settings-tab:focus-visible,\n.aura-lyrics-settings input:focus-visible,\n.aura-lyrics-settings select:focus-visible,\n.aura-lyrics-settings button:focus-visible",
	".aura-lyrics-settings .settings-group",
	".aura-lyrics-settings .settings-panel h3 + .settings-group",
	".aura-lyrics-settings .settings-group h4",
	".aura-lyrics-settings .settings-group-description",
	".aura-lyrics-settings .setting-copy",
	".aura-lyrics-settings .setting-label",
	".aura-lyrics-settings .setting-description,\n.aura-lyrics-settings .disabled-reason",
	".aura-lyrics-settings .disabled-reason",
	".aura-lyrics-settings .setting-row.is-disabled",
	".aura-lyrics-settings .setting-row.is-disabled input,\n.aura-lyrics-settings .setting-row.is-disabled select,\n.aura-lyrics-settings .settings-action:disabled,\n.aura-lyrics-settings .icon-button:disabled",
	".aura-lyrics-settings .range-control",
	".aura-lyrics-settings .range-output",
	".aura-lyrics-settings .settings-action-row",
	".aura-lyrics-settings .settings-action-row .settings-action,\n.aura-lyrics-settings .reset-region > .settings-action,\n.aura-lyrics-settings .settings-group > .settings-action",
	".aura-lyrics-settings .danger-action",
	".aura-lyrics-settings .danger-action:hover",
	".aura-lyrics-settings .reset-region",
	".aura-lyrics-settings .reset-confirmation-message",
	".aura-lyrics-settings .icon-button",
	".aura-lyrics-settings .token-control",
	".aura-lyrics-settings .token-action",
	".aura-lyrics-settings .provider-order-summary,\n.aura-lyrics-settings .proxy-example",
	".aura-lyrics-settings .proxy-example",
	".aura-lyrics-settings .settings-feedback",
	'.aura-lyrics-settings .settings-feedback[data-state="saved"],\n.aura-lyrics-settings .settings-feedback[data-state="success"]',
	'.aura-lyrics-settings .settings-feedback[data-state="previewing"],\n.aura-lyrics-settings .settings-feedback[data-state="working"]',
	'.aura-lyrics-settings .settings-feedback[data-state="error"]',
	".aura-lyrics-settings .visually-hidden",
	".aura-lyrics-settings .highlight-preview",
	".aura-lyrics-settings .highlight-preview-motion,\n.aura-lyrics-settings .highlight-preview-token",
	".aura-lyrics-settings .highlight-preview-token",
	'.aura-lyrics-settings .highlight-preview[data-effect="glow-sweep"] .highlight-preview-token',
	'.aura-lyrics-settings .highlight-preview[data-effect="underline"] .highlight-preview-token::after,\n.aura-lyrics-settings .highlight-preview[data-effect="marker"] .highlight-preview-token::before',
	'.aura-lyrics-settings .highlight-preview[data-effect="underline"] .highlight-preview-token::after',
	'.aura-lyrics-settings .highlight-preview[data-effect="marker"] .highlight-preview-token::before',
	'.aura-lyrics-settings .highlight-preview[data-effect="outline-fill"] .highlight-preview-token',
	'.aura-lyrics-settings .highlight-preview[data-effect="spotlight"] .highlight-preview-token',
	'.aura-lyrics-settings .highlight-preview[data-motion="spring"] .highlight-preview-motion',
	'.aura-lyrics-settings .highlight-preview[data-motion="pulse"] .highlight-preview-motion',
	'.aura-lyrics-settings .highlight-preview[data-motion="bounce"] .highlight-preview-motion',
	'.aura-lyrics-settings .highlight-preview[data-motion="elastic"] .highlight-preview-motion',
	'.aura-lyrics-settings .highlight-preview[data-motion="wave"] .highlight-preview-motion',
	'.aura-lyrics-settings .highlight-preview[data-motion="ripple"] .highlight-preview-motion',
	".aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-motion,\n.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token,\n.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token::before,\n.aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token::after",
	".aura-lyrics-settings .highlight-preview.is-reduced .highlight-preview-token",
	"@keyframes highlight-preview-fill",
	"@keyframes highlight-preview-glow",
	"@keyframes highlight-preview-outline",
	"@keyframes highlight-preview-spotlight",
	"@keyframes highlight-preview-sweep",
	"@keyframes highlight-preview-spring",
	"@keyframes highlight-preview-pulse",
	"@keyframes highlight-preview-bounce",
	"@keyframes highlight-preview-elastic",
	"@keyframes highlight-preview-wave",
	"@keyframes highlight-preview-ripple",
	"@media (max-width: 680px)",
];

describe("settingsStyles", () => {
	test("assembles the final CSS from focused style modules in display order", () => {
		expect(settingsStyleModules).toEqual([shellStyles, navigationStyles, controlsStyles, trackDelayStyles, highlightPreviewStyles, responsiveStyles]);
		expect(settingsStyles).toBe(settingsStyleModules.join("\n"));
	});

	test("keeps every rule from the pre-split settingsStyles.ts", () => {
		for (const selector of ORIGINAL_SELECTOR_HEADS) {
			expect(settingsStyles).toContain(selector);
		}
	});

	test("keeps focused module boundaries free of unrelated selectors", () => {
		expect(shellStyles).toContain(".aura-lyrics-settings");
		expect(shellStyles).not.toContain(".settings-tab");
		expect(shellStyles).not.toContain(".track-delay-card");
		expect(shellStyles).not.toContain(".highlight-preview");
		expect(navigationStyles).not.toContain(".track-delay-card");
		expect(navigationStyles).not.toContain(".highlight-preview");
		expect(navigationStyles).not.toContain(".setting-row");
		expect(controlsStyles).not.toContain(".track-delay-card");
		expect(controlsStyles).not.toContain(".highlight-preview");
		// controlsStyles legitimately shares one rule with navigationStyles: the focus-visible
		// selector list targets `.settings-tab:focus-visible` alongside input/select/button.
		expect(trackDelayStyles).not.toContain(".highlight-preview");
		expect(trackDelayStyles).not.toContain(".settings-tab");
		expect(highlightPreviewStyles).not.toContain(".track-delay-card");
		expect(highlightPreviewStyles).not.toContain(".settings-tab");
	});

	test("keeps the responsive breakpoint isolated to its own module", () => {
		expect(responsiveStyles).toContain("@media (max-width: 680px)");
		expect(shellStyles).not.toContain("@media");
		expect(navigationStyles).not.toContain("@media");
		expect(controlsStyles).not.toContain("@media");
		expect(trackDelayStyles).not.toContain("@media");
		expect(highlightPreviewStyles).not.toContain("@media");
	});

	test("orders the responsive module last so its overrides win the cascade", () => {
		const responsiveIndex = settingsStyles.indexOf("@media (max-width: 680px)");
		expect(responsiveIndex).toBeGreaterThan(0);
		expect(settingsStyles.slice(responsiveIndex)).not.toContain("@keyframes");
	});
});
