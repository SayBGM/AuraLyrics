import type { TrackIdentity } from "../lyrics/types";

declare global {
	interface Window {
		Spicetify?: SpicetifyGlobal;
		documentPictureInPicture?: {
			requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
		};
	}

	const Spicetify: SpicetifyGlobal;
}

export type SpicetifyGlobal = {
	Player: {
		data?: {
			item?: {
				uri: string;
				metadata?: Record<string, string>;
			};
		};
		getProgress(): number;
		getDuration(): number;
		isPlaying?(): boolean;
		back?(): void;
		pause?(): void;
		play?(): void;
		togglePlay?(): void;
		next?(): void;
		addEventListener(event: "songchange" | "onplaypause" | string, listener: () => void): void;
		removeEventListener?(event: string, listener: () => void): void;
	};
	CosmosAsync?: {
		get<T = unknown>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T>;
	};
	LocalStorage?: {
		get(key: string): string | null;
		set(key: string, value: string): void;
	};
	Topbar?: {
		Button: new (
			label: string,
			icon: string,
			onClick: () => void
		) => {
			element: HTMLElement;
			active?: boolean;
			deregister?: () => void;
		};
	};
	PopupModal?: {
		display(options: { title: string; content: HTMLElement }): void;
		hide?: () => void;
	};
	SVGIcons?: Record<string, string>;
	URI?: {
		isTrack(uri: string): boolean;
		isLocalTrack(uri: string): boolean;
	};
	Config?: {
		version?: string;
	};
	showNotification?: (message: string, isError?: boolean, timeout?: number) => void;
};

export const isTrackIdentity = (track: TrackIdentity | undefined): track is TrackIdentity => track !== undefined;
