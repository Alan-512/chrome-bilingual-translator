import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("manifest", () => {
  it("defines a stable extension key so unpacked builds keep the same extension id", async () => {
    const manifestPath = path.resolve("manifest.json");
    const manifestSource = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestSource) as { key?: string };

    expect(typeof manifest.key).toBe("string");
    expect(manifest.key?.length).toBeGreaterThan(100);
  });
});
