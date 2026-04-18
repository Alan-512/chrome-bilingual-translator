import fs from "node:fs";
import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

const projectRoot = "/mnt/d/project/chrome-bilingual-translator";
const playwrightCacheRoot = "/home/seed/.cache/ms-playwright";

function resolveExistingChromiumExecutable(): string {
  const candidates = fs
    .readdirSync(playwrightCacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => path.join(playwrightCacheRoot, entry.name, "chrome-linux64", "chrome"))
    .filter((candidatePath) => fs.existsSync(candidatePath))
    .sort()
    .reverse();

  if (candidates.length === 0) {
    throw new Error("No local Playwright Chromium executable was found.");
  }

  return candidates[0];
}

test("loads the unpacked extension options page from emitted assets", async () => {
  const userDataDir = test.info().outputPath("user-data");
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: resolveExistingChromiumExecutable(),
    headless: false,
    args: [
      `--disable-extensions-except=${projectRoot}`,
      `--load-extension=${projectRoot}`
    ]
  });

  try {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }

    const extensionId = background.url().split("/")[2];
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/dist/options.html`);

    await expect(optionsPage.locator("h1")).toHaveText("Options");
    await expect(optionsPage.locator("[name='apiBaseUrl']")).toBeVisible();
    await expect(optionsPage.locator("[name='translateTitles']")).toBeChecked();
    await expect(optionsPage.locator("[name='translateShortContentBlocks']")).toBeChecked();
  } finally {
    await context.close();
  }
});
