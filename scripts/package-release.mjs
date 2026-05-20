import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const releaseDir = "release";
const assets = ["dist/aura-lyrics.js", "install/install.sh", "install/install.ps1"];

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

const checksumLines = [];
for (const asset of assets) {
	const output = join(releaseDir, basename(asset));
	await copyFile(asset, output);
	const bytes = await readFile(output);
	const hash = createHash("sha256").update(bytes).digest("hex");
	checksumLines.push(`${hash}  ${basename(asset)}`);
}

await writeFile(join(releaseDir, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);
