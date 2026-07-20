import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalize, join } from "node:path";

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
    assetText.includes("invoice.") ||
    assetText.includes("pdfFieldName") ||
    assetText.includes("assetPath")
  ) {
    throw new Error("Internal template metadata appeared in compiled frontend assets.");
  }

  for (const sentinel of [
    "Sensitive Sentinel",
    "Sentinel Secret",
    "raw mock extraction",
    "raw Sentinel",
  ]) {
    if (assetText.includes(sentinel)) {
      throw new Error("Sentinel test data appeared in compiled frontend assets.");
    }
  }

  if (assetText.includes("/api/generate-pdf")) {
    throw new Error("PDF generation mutation endpoint appeared in T09 frontend assets.");
  }
}

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const sourceFiles = [];
const collectSourceFiles = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(entryPath);
    } else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) {
      sourceFiles.push(entryPath);
    }
  }
};
collectSourceFiles(sourceRoot);

const extractReferences = sourceFiles.filter((file) => {
  const text = readFileSync(file, "utf8");
  return text.includes('"/api/extract"') || text.includes("'/api/extract'");
});
if (
  extractReferences.length !== 1 ||
  !normalize(extractReferences[0]).endsWith(normalize("api/extraction-api.ts"))
) {
  throw new Error("/api/extract must appear only in the intended extraction API module.");
}

console.log("Frontend production build smoke passed.");
