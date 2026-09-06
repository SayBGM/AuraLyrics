import type { ExtensionSettings } from "../settings/SettingsStore";

/**
 * The CSS custom properties that both roots carry: the PiP document root
 * (`DocumentPipController`) and every scene container the renderer mounts. Each call site adds
 * its own extras on top — the renderer writes `--spring-softness`/font/highlight datasets, the
 * PiP root writes the `interlude-style-*` and `background-disabled` classes.
 */
export const cssPropertiesForSettings = (settings: ExtensionSettings): Record<string, string> => ({
	"--font-scale": String(settings.fontScale),
	"--background-blur": `${settings.backgroundBlurPx}px`,
	"--background-dim": String(settings.backgroundDim),
	"--background-saturation": String(settings.backgroundSaturation),
	"--vignette-strength": String(settings.vignetteStrength),
	"--inactive-blur": `${settings.inactiveBlurPx}px`,
	"--motion-intensity": String(settings.motionIntensity),
});

/** Writes the shared properties plus the two motion classes derived from the same settings. */
export const applySharedRootSettings = (root: HTMLElement, settings: ExtensionSettings): void => {
	for (const [property, value] of Object.entries(cssPropertiesForSettings(settings))) {
		root.style.setProperty(property, value);
	}
	root.classList.toggle("reduce-motion", settings.reduceMotion || !settings.motionEnabled);
	root.classList.toggle("motion-disabled", !settings.motionEnabled);
};
