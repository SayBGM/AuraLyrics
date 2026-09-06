import { ExtensionApp } from "./app/ExtensionApp";

const WAIT_FOR_SPICETIFY_MAX_ATTEMPTS = 60;
const WAIT_FOR_SPICETIFY_INTERVAL_MS = 500;

const waitForSpicetify = (callback: () => void, attempt = 0): void => {
	const spicetify = window.Spicetify;
	if (spicetify?.Player && spicetify.CosmosAsync && spicetify.LocalStorage && spicetify.Topbar) {
		callback();
		return;
	}
	if (attempt + 1 >= WAIT_FOR_SPICETIFY_MAX_ATTEMPTS) {
		console.warn("AuraLyrics: Spicetify APIs did not become available within 30s; giving up.");
		return;
	}
	window.setTimeout(() => waitForSpicetify(callback, attempt + 1), WAIT_FOR_SPICETIFY_INTERVAL_MS);
};

waitForSpicetify(() => {
	const spicetify = window.Spicetify;
	if (!spicetify) {
		return;
	}
	const app = new ExtensionApp(spicetify);
	app.start();
	window.addEventListener("beforeunload", () => app.destroy(), { once: true });
});
