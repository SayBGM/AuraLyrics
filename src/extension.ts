import { ExtensionApp } from "./app/ExtensionApp";

const waitForSpicetify = (callback: () => void): void => {
	const spicetify = window.Spicetify;
	if (spicetify?.Player && spicetify.CosmosAsync && spicetify.LocalStorage && spicetify.Topbar) {
		callback();
		return;
	}
	window.setTimeout(() => waitForSpicetify(callback), 500);
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
