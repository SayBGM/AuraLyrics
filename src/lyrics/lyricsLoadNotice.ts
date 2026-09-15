import type { UiLanguage } from "../settings/SettingsStore";
import { providerDisplayName } from "../shared/providerDisplayNames";
import type { LyricsLoadDiagnostics, ProviderAttemptStatus } from "./types";

export type LyricsLoadFailureReason = "error" | "instrumental" | "no-lyrics" | "restricted" | "unsupported-local";

export type LyricsLoadNotice = {
	title: string;
	detail: string;
	tryAgainLabel?: string;
	diagnosticsLabel: string;
	diagnostics?: string[];
	tone: "neutral" | "danger";
};

/**
 * Converts provider outcomes into a short, user-facing explanation for the track metadata scene.
 * Provider messages are useful when debugging, but are bounded and normalized before they reach the
 * DOM so a verbose upstream response cannot take over the small PiP window.
 */
export const lyricsLoadNoticeFor = (
	reason: LyricsLoadFailureReason,
	language: UiLanguage,
	message?: string,
	diagnostics?: LyricsLoadDiagnostics
): LyricsLoadNotice => {
	const localized = noticeCopy(language, reason);
	const detail = reason === "error" && message?.trim() ? truncateDiagnostic(message) : localized.detail;
	return {
		title: localized.title,
		detail,
		tryAgainLabel: localized.tryAgainLabel,
		diagnosticsLabel: localized.diagnosticsLabel,
		diagnostics: diagnostics ? diagnosticsFor(diagnostics, language) : undefined,
		tone: reason === "error" ? "danger" : "neutral",
	};
};

type NoticeCopy = Omit<LyricsLoadNotice, "diagnostics">;

const noticeCopy = (language: UiLanguage, reason: LyricsLoadFailureReason): NoticeCopy => {
	if (language === "ko") {
		if (reason === "error") {
			return {
				title: "가사를 불러오지 못했습니다",
				detail: "가사 제공자 요청에 실패했습니다.",
				tryAgainLabel: "현재 곡 다시 요청",
				diagnosticsLabel: "요청 진단 정보",
				tone: "danger",
			};
		}
		if (reason === "no-lyrics") {
			return {
				title: "가사를 찾지 못했습니다",
				detail: "사용하도록 설정된 가사 제공자에서 이 곡의 가사를 찾지 못했습니다.",
				tryAgainLabel: "현재 곡 다시 요청",
				diagnosticsLabel: "제공자 조회 결과",
				tone: "neutral",
			};
		}
		if (reason === "restricted") {
			return {
				title: "가사를 표시할 수 없습니다",
				detail: "Musixmatch에서 이 가사의 제공이 제한되어 있습니다.",
				diagnosticsLabel: "제공자 조회 결과",
				tone: "neutral",
			};
		}
		if (reason === "instrumental") {
			return {
				title: "연주곡입니다",
				detail: "가사 없는 연주곡입니다.",
				diagnosticsLabel: "제공자 조회 결과",
				tone: "neutral",
			};
		}
		return {
			title: "로컬 파일은 지원하지 않습니다",
			detail: "Spotify 로컬 파일의 가사는 AuraLyrics에서 불러올 수 없습니다.",
			diagnosticsLabel: "요청 진단 정보",
			tone: "neutral",
		};
	}

	if (language === "ja") {
		if (reason === "error") {
			return {
				title: "歌詞を読み込めませんでした",
				detail: "歌詞プロバイダーへのリクエストに失敗しました。",
				tryAgainLabel: "この曲を再試行",
				diagnosticsLabel: "リクエストの診断情報",
				tone: "danger",
			};
		}
		if (reason === "no-lyrics") {
			return {
				title: "歌詞が見つかりません",
				detail: "有効な歌詞プロバイダーでこの曲の歌詞が見つかりませんでした。",
				tryAgainLabel: "この曲を再試行",
				diagnosticsLabel: "プロバイダーの結果",
				tone: "neutral",
			};
		}
		if (reason === "restricted") {
			return {
				title: "歌詞を表示できません",
				detail: "Musixmatch でこの歌詞の提供が制限されています。",
				diagnosticsLabel: "プロバイダーの結果",
				tone: "neutral",
			};
		}
		if (reason === "instrumental") {
			return {
				title: "インストゥルメンタルです",
				detail: "歌詞のないインストゥルメンタルです。",
				diagnosticsLabel: "プロバイダーの結果",
				tone: "neutral",
			};
		}
		return {
			title: "ローカルファイルは未対応です",
			detail: "Spotify のローカルファイルの歌詞は AuraLyrics で読み込めません。",
			diagnosticsLabel: "リクエストの診断情報",
			tone: "neutral",
		};
	}

	if (reason === "error") {
		return {
			title: "Unable to load lyrics",
			detail: "The lyrics provider request failed.",
			tryAgainLabel: "Retry this track",
			diagnosticsLabel: "Request diagnostics",
			tone: "danger",
		};
	}
	if (reason === "no-lyrics") {
		return {
			title: "No lyrics found",
			detail: "None of the enabled lyrics providers returned lyrics for this track.",
			tryAgainLabel: "Retry this track",
			diagnosticsLabel: "Provider results",
			tone: "neutral",
		};
	}
	if (reason === "restricted") {
		return {
			title: "Lyrics are unavailable",
			detail: "Musixmatch has restricted this lyric.",
			diagnosticsLabel: "Provider results",
			tone: "neutral",
		};
	}
	if (reason === "instrumental") {
		return {
			title: "Instrumental track",
			detail: "This is an instrumental track with no lyrics.",
			diagnosticsLabel: "Provider results",
			tone: "neutral",
		};
	}
	return {
		title: "Local files are not supported",
		detail: "Lyrics for Spotify local files cannot be loaded by AuraLyrics.",
		diagnosticsLabel: "Request diagnostics",
		tone: "neutral",
	};
};

const diagnosticsFor = (diagnostics: LyricsLoadDiagnostics, language: UiLanguage): string[] => {
	const attempts = diagnostics.attempts.flatMap((attempt) => {
		const status = attemptStatusLabel(attempt.status, language);
		const message = attempt.message ? ` · ${truncateDiagnostic(attempt.message)}` : "";
		const requests = (attempt.requests ?? []).slice(0, 20).map((request) => {
			const code = request.status === undefined ? "" : ` [${request.status}]`;
			return truncateDiagnostic(`${request.stage}${code}: ${request.outcome} · ${Math.max(0, Math.round(request.durationMs))} ms`);
		});
		return [`${providerDisplayName(attempt.provider)}: ${status}${message}`, ...requests];
	});
	if (attempts.length > 0) {
		return attempts;
	}
	return [cacheStatusLabel(diagnostics.cache.status, language)];
};

const attemptStatusLabel = (status: ProviderAttemptStatus, language: UiLanguage): string => {
	const labels: Record<UiLanguage, Partial<Record<ProviderAttemptStatus, string>>> = {
		en: {
			success: "success",
			"no-lyrics": "no lyrics",
			instrumental: "instrumental",
			restricted: "restricted",
			"temporarily-unavailable": "temporarily unavailable",
			cooldown: "cooldown",
			error: "error",
		},
		ko: {
			success: "성공",
			"no-lyrics": "가사 없음",
			instrumental: "연주곡",
			restricted: "제한됨",
			"temporarily-unavailable": "일시적으로 사용할 수 없음",
			cooldown: "잠시 대기 중",
			error: "오류",
		},
		ja: {
			success: "成功",
			"no-lyrics": "歌詞なし",
			instrumental: "インストゥルメンタル",
			restricted: "制限あり",
			"temporarily-unavailable": "一時利用不可",
			cooldown: "クールダウン中",
			error: "エラー",
		},
	};
	return labels[language][status] ?? status;
};

const cacheStatusLabel = (status: LyricsLoadDiagnostics["cache"]["status"], language: UiLanguage): string => {
	if (language === "ko") return `캐시: ${status}`;
	if (language === "ja") return `キャッシュ: ${status}`;
	return `Cache: ${status}`;
};

const truncateDiagnostic = (value: string, maxLength = 180): string => {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, maxLength - 1)}…`;
};
