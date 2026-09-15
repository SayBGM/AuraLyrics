import {
	MUSIXMATCH_MOBILE_APP_ID,
	MUSIXMATCH_MOBILE_COSMOS_HEADERS,
	MUSIXMATCH_MOBILE_FETCH_HEADERS,
	musixmatchMobileUrl,
} from "./MusixmatchMobileApi";
import { MusixmatchRequestError, type MusixmatchRequestErrorKind, requestMusixmatch, toMusixmatchRequestError } from "./musixmatchProxy";

export type MusixmatchTokenResponse = {
	message?: {
		header?: {
			status_code?: number;
			hint?: string;
			mode?: string;
			retry_after?: number | string;
		};
		body?: {
			user_token?: string;
		};
	};
};

type CosmosGet = (url: string, body?: unknown, headers?: Record<string, string>) => Promise<MusixmatchTokenResponse>;

const tokenUrl = (): string => musixmatchMobileUrl("token.get", new URLSearchParams({ app_id: MUSIXMATCH_MOBILE_APP_ID }));

export class MusixmatchTokenService {
	private refreshing?: Promise<string>;

	public constructor(
		private readonly cosmosGet: CosmosGet,
		private readonly fetchFn: typeof fetch
	) {}

	public async refresh(proxyBaseUrl?: string): Promise<string> {
		if (!this.refreshing) {
			this.refreshing = this.requestToken(proxyBaseUrl).finally(() => {
				this.refreshing = undefined;
			});
		}
		return this.refreshing;
	}

	private async requestToken(proxyBaseUrl?: string): Promise<string> {
		try {
			const response = await requestMusixmatch<MusixmatchTokenResponse>({
				targetUrl: tokenUrl(),
				proxyBaseUrl,
				cosmosGet: this.cosmosGet,
				cosmosHeaders: MUSIXMATCH_MOBILE_COSMOS_HEADERS,
				fetchHeaders: MUSIXMATCH_MOBILE_FETCH_HEADERS,
				fetch: this.fetchFn,
				timeoutMs: 8000,
			});
			const token = this.extractToken(response);
			if (token) {
				return token;
			}
			throw this.responseError(response);
		} catch (error) {
			throw toMusixmatchRequestError(error);
		}
	}

	private extractToken(response: MusixmatchTokenResponse): string | undefined {
		const message = response.message;
		if (message?.header?.status_code === 200 && message.body?.user_token) {
			return message.body.user_token;
		}
		return undefined;
	}

	private responseError(response: MusixmatchTokenResponse): MusixmatchRequestError {
		const header = response.message?.header;
		const status = header?.status_code;
		const text = `${header?.hint ?? ""} ${header?.mode ?? ""}`.toLowerCase();
		let kind: MusixmatchRequestErrorKind;
		if (text.includes("captcha")) kind = "captcha";
		else if (status === 429 || /rate.?limit|too many|blocked/.test(text)) kind = "rate-limit";
		else if (status === 401 || status === 403) kind = "authentication";
		else kind = status === 200 || status === undefined ? "invalid-response" : "http";
		const retryAfter = Number(header?.retry_after);
		const retryAfterMs = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : undefined;
		const message =
			kind === "captcha"
				? "Musixmatch token request requires captcha verification."
				: kind === "rate-limit"
					? "Musixmatch token request was rate limited."
					: kind === "authentication"
						? "Musixmatch token authentication failed."
						: kind === "http" && status !== undefined
							? `Musixmatch token request failed with HTTP ${status}.`
							: "Musixmatch token response was invalid.";
		return new MusixmatchRequestError(message, kind, status, retryAfterMs);
	}
}
