export type SettingsIconName = "advanced" | "appearance" | "down" | "general" | "lyrics" | "motion" | "providers" | "up";

const ICON_PATHS: Record<SettingsIconName, string[]> = {
	general: ["M4 6h16", "M4 12h16", "M4 18h16", "M8 4v4", "M16 10v4", "M10 16v4"],
	lyrics: [
		"M9 18V5l10-2v13",
		"M9 9l10-2",
		"M6.5 21A2.5 2.5 0 1 0 6.5 16 2.5 2.5 0 0 0 6.5 21Z",
		"M16.5 19A2.5 2.5 0 1 0 16.5 14 2.5 2.5 0 0 0 16.5 19Z",
	],
	appearance: [
		"M12 3v2",
		"M12 19v2",
		"M3 12h2",
		"M19 12h2",
		"m5.64 5.64 1.42 1.42",
		"m16.94 16.94 1.42 1.42",
		"m18.36 5.64-1.42 1.42",
		"m7.06 16.94-1.42 1.42",
		"M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
	],
	motion: ["M5 16c2.2-5.3 4.6-8 7.1-8 2.3 0 3.3 2 4.4 2 1 0 1.5-1 2.5-3", "M5 20c2.8-3.8 5-5.7 6.8-5.7 1.7 0 2.1 1.7 3.5 1.7 1.1 0 2.2-.7 3.7-2.5"],
	providers: ["M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z", "m5 11 7 3.7 7-3.7", "m5 15 7 3.7 7-3.7"],
	advanced: [
		"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
		"M12 2.75v2.1",
		"M12 19.15v2.1",
		"M2.75 12h2.1",
		"M19.15 12h2.1",
		"m5.46 5.46 1.48 1.48",
		"m17.06 17.06 1.48 1.48",
		"m18.54 5.46-1.48 1.48",
		"m6.94 17.06-1.48 1.48",
	],
	up: ["M12 19V5", "m6 11 6-6 6 6"],
	down: ["M12 5v14", "m18 13-6 6-6-6"],
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export const createSettingsIcon = (name: SettingsIconName, ownerDocument: Document = document): SVGSVGElement => {
	const svg = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
	svg.setAttribute("width", "17");
	svg.setAttribute("height", "17");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "1.8");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	for (const pathData of ICON_PATHS[name]) {
		const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
		path.setAttribute("d", pathData);
		svg.append(path);
	}
	return svg;
};
