import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("esbuild config", () => {
  it("derives the project root from the config file instead of a machine-specific path", async () => {
    const configPath = path.resolve("esbuild.config.mjs");
    const configSource = await readFile(configPath, "utf8");

    expect(configSource).not.toContain("/mnt/d/project/chrome-bilingual-translator");
    expect(configSource).toContain("import.meta.url");
  });
});
