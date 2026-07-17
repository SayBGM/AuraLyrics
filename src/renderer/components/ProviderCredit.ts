import type { LyricsLoadDiagnostics } from "../../lyrics/types";
import type { ExtensionSettings } from "../../settings/settingsSchema";
import { providerDisplayName } from "../../shared/providerDisplayNames";
import type { AnimatedGroup } from "../AnimatedGroup";

type ProviderCreditOptions = {
	diagnostics?: LyricsLoadDiagnostics;
	language: ExtensionSettings["language"];
	loadSource?: "cache" | "network";
	provider: string;
	showDiagnostics: boolean;
};

export class ProviderCredit implements AnimatedGroup {
	public readonly element: HTMLDivElement;
	public readonly endTime = Number.POSITIVE_INFINITY;

	public constructor(
		public readonly startTime: number,
		options: ProviderCreditOptions,
		ownerDocument: Document = document
	) {
		this.element = createProviderCreditElement(ownerDocument, options);
		this.element.classList.add("provider-credit-timed");
	}

	public animate(timestamp: number): void {
		const active = timestamp >= this.startTime;
		this.element.classList.toggle("active", active);
		this.element.classList.toggle("idle", !active);
		this.element.classList.remove("sung");
	}
}

export const createProviderCreditElement = (
	ownerDocument: Document,
	{ diagnostics, language, loadSource, provider, showDiagnostics }: ProviderCreditOptions
): HTMLDivElement => {
	const credit = ownerDocument.createElement("div");
	credit.className = "vocals-group provider-credit";
	credit.dataset.scrollRow = "true";
	const label = ownerDocument.createElement("span");
	label.className = "provider-credit-label";
	label.textContent = providerCreditLabel(providerDisplayName(provider), language);
	credit.append(label);
	if (showDiagnostics && diagnostics) {
		const detail = ownerDocument.createElement("span");
		detail.className = "provider-diagnostics";
		detail.textContent = `${loadSource ? `${loadSource} · ` : ""}${providerDiagnosticsText(diagnostics)}`;
		credit.append(detail);
	}
	return credit;
};

const providerCreditLabel = (provider: string, language: ExtensionSettings["language"]): string => {
	if (language === "ko") return `가사 제공: ${provider}`;
	if (language === "ja") return `歌詞提供: ${provider}`;
	return `Lyrics by ${provider}`;
};

const providerDiagnosticsText = (diagnostics: LyricsLoadDiagnostics): string => {
	const cache = diagnostics.cache;
	const cacheDetail =
		cache.status === "hit" || cache.status === "provider-mismatch"
			? `cache ${cache.status.replace("-", " ")} (${cache.provider})`
			: `cache ${cache.status.replace("-", " ")}`;
	const attempts = diagnostics.attempts.map((attempt) => `${attempt.provider}: ${attempt.status.replace("-", " ")}`).join(" -> ");
	return attempts ? `${cacheDetail} · ${attempts}` : cacheDetail;
};
