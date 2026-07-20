import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const distPath = fileURLToPath(new URL("../dist/", import.meta.url));
const indexPath = join(distPath, "index.html");
const assetsPath = join(distPath, "assets");

if (!existsSync(indexPath)) {
  throw new Error("dist/index.html was not found. Run the frontend build first.");
}

if (!existsSync(assetsPath)) {
  throw new Error("dist/assets was not found. Run the frontend build first.");
}

const assets = readdirSync(assetsPath);
const hasJavaScript = assets.some((asset) => asset.endsWith(".js"));
const hasCss = assets.some((asset) => asset.endsWith(".css"));

if (!hasJavaScript || !hasCss) {
  throw new Error("Expected compiled JavaScript and CSS assets in dist/assets.");
}

const indexHtml = readFileSync(indexPath, "utf8");
for (const asset of assets) {
  if (
    (asset.endsWith(".js") || asset.endsWith(".css")) &&
    !indexHtml.includes(`/assets/${asset}`)
  ) {
    throw new Error(`dist/index.html does not reference ${asset}.`);
  }
}

for (const asset of assets) {
  if (asset.endsWith(".map")) {
    throw new Error("Public source maps were emitted unexpectedly.");
  }

  const assetText = readFileSync(join(assetsPath, asset), "utf8");
  if (
    assetText.includes("templates/") ||
    assetText.includes("job.") ||
    assetText.includes("invoice.")
  ) {
    throw new Error("Internal template metadata appeared in compiled frontend assets.");
  }
}

console.log("Frontend production build smoke passed.");
