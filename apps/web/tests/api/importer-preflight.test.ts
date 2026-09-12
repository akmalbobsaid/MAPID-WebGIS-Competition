import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(process.cwd(), "..", "..");

describe("PHASE-05 importer preflight", () => {
  it("validates the approved P0 bundle without opening a database connection", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/database/import-p0.mjs", "--validate-only", "--analysis-version", "p0-central-v1"],
      { cwd: repositoryRoot },
    );

    expect(JSON.parse(stdout)).toEqual({
      analysis_version: "p0-central-v1",
      validated: {
        transit_points: 9,
        culinary_poi: 355,
        stop_merchant_access: 3195,
        stop_isochrones: 18,
      },
    });
  });
});
