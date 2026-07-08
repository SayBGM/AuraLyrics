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

const TOKEN_ENDPOINTS = [
	{
		id: "desktop",
		url: "https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0",
		headers: {
			authority: "apic-desktop.musixmatch.com",
		},
		allowProxy: true,
	},
	{
		id: "mobile",
		url: "https://apic-appmobile.musixmatch.com/ws/1.1/token.get?app_id=mac-ios-v2.0",
		headers: {
			Host: "apic-appmobile.musixmatch.com",
			authority: "apic-appmobile.musixmatch.com",
			"X-Cookie": "x-mxm-token-guid=",
			"x-mxm-app-version": "10.1.1",
			"X-User-Agent": "Musixmatch/2025120901 CFNetwork/3860.300.31 Darwin/25.2.0",
			"Accept-Language": "en-US,en;q=0.9",
			Connection: "keep-alive",
			Accept: "application/json",
		},
		allowProxy: false,
	},
] as const;

export class MusixmatchTokenService {
	public constructor(
		private readonly cosmosGet: CosmosGet,
		private readonly fetchFn: typeof fetch
	) {}

	public async refresh(proxyBaseUrl?: string): Promise<string> {
		const errors: string[] = [];
		for (const endpoint of TOKEN_ENDPOINTS) {
			try {
				const response = await requestMusixmatch<MusixmatchTokenResponse>({
					targetUrl: endpoint.url,
					proxyBaseUrl: endpoint.allowProxy ? proxyBaseUrl : undefined,
					cosmosGet: this.cosmosGet,
					cosmosHeaders: endpoint.headers,
					fetch: this.fetchFn,
				});
				const token = this.extractToken(response);
				if (token) {
					return token;
				}
				errors.push(`${endpoint.id}: ${this.errorMessage(response)}`);
			} catch (error) {
				errors.push(`${endpoint.id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		throw new Error(`Musixmatch desktop and mobile token requests failed. ${errors.join(" ")}`);
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
