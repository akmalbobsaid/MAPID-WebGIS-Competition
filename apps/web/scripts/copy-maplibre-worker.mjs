import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const maplibrePackage = require.resolve("maplibre-gl/package.json");
const maplibreDist = join(dirname(maplibrePackage), "dist");
const publicWorkerDirectory = join(process.cwd(), "public", "maplibre");
const workerFiles = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(publicWorkerDirectory, { recursive: true });
await Promise.all(
  workerFiles.map((fileName) => copyFile(join(maplibreDist, fileName), join(publicWorkerDirectory, fileName))),
);

console.log("Prepared matching MapLibre worker assets.");
