import { rm } from "node:fs/promises";

const generatedPaths = [
  "apps/frontend/dist",
  "apps/frontend/coverage",
  "apps/backend/dist",
  "apps/backend/coverage",
  "packages/schemas/dist",
  "packages/schemas/coverage",
];

await Promise.all(generatedPaths.map((path) => rm(path, { recursive: true, force: true })));
