import {
	MUSIXMATCH_MOBILE_APP_ID,
	MUSIXMATCH_MOBILE_COSMOS_HEADERS,
	MUSIXMATCH_MOBILE_FETCH_HEADERS,
	musixmatchMobileUrl,
} from "./MusixmatchMobileApi";
import { requestMusixmatch } from "./musixmatchProxy";

export type MusixmatchTokenResponse = {
	message?: {
		header?: {
			status_code?: number;
			hint?: string;
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
			throw new Error(this.errorMessage(response));
		} catch (error) {
			throw new Error(`Musixmatch mobile token request failed. ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private extractToken(response: MusixmatchTokenResponse): string | undefined {
		const message = response.message;
		if (message?.header?.status_code === 200 && message.body?.user_token) {
			return message.body.user_token;
		}
		return undefined;
	}

	private errorMessage(response: MusixmatchTokenResponse): string {
		const header = response.message?.header;
		if (header?.status_code === 401) {
			return "rate-limited or captcha required";
		}
		return header?.hint ?? "failed to generate token";
	}
}
