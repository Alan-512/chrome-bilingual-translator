import fs from "node:fs";
import http from "node:http";
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

function startMockTranslationServer() {
  const requests: unknown[] = [];
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/article") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(fs.readFileSync(path.join(projectRoot, "tests/browser/fixtures/article.html"), "utf8"));
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404);
      response.end();
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as {
        messages?: Array<{ role: string; content: string }>;
      };
      requests.push(payload);
      const userMessage = payload.messages?.find((message) => message.role === "user");
      const userPayload = JSON.parse(userMessage?.content ?? "{}") as {
        blocks?: Array<{ blockId: string; sourceText: string }>;
      };
      const translatedBlocks = Object.fromEntries(
        (userPayload.blocks ?? []).map((block) => [block.blockId, `中文翻译：${block.sourceText}`])
      );

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(translatedBlocks)
              }
            }
          ]
        })
      );
    });
  });

  return new Promise<{
    origin: string;
    requests: unknown[];
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Mock server did not expose a TCP address.");
      }

      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          })
      });
    });
  });
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

test("translates a visible webpage block through the extension background flow", async () => {
  const mockServer = await startMockTranslationServer();
  const userDataDir = test.info().outputPath("translate-user-data");
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

    await background.evaluate(
      async ({ apiBaseUrl }) => {
        await chrome.storage.local.set({
          extensionConfig: {
            apiBaseUrl,
            apiOrigin: "",
            apiKey: "test-key",
            model: "test-model",
            translateTitles: true,
            translateShortContentBlocks: true,
            targetLanguage: "zh-CN"
          }
        });
      },
      { apiBaseUrl: `${mockServer.origin}/v1/chat/completions` }
    );

    const articlePage = await context.newPage();
    await articlePage.goto(`${mockServer.origin}/article`);
    const [tab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));

    await background.evaluate(async (tabId) => {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/content.js"]
      });
      await chrome.tabs.sendMessage(tabId, { type: "page/activate", tabId });
    }, tab.id);

    await expect(articlePage.locator("[data-bilingual-translator-owned='true']").first()).toContainText("中文翻译");
    await expect(articlePage.locator("[data-bilingual-translator-pill='true']")).toContainText("Translated");
    expect(mockServer.requests.length).toBeGreaterThan(0);
  } finally {
    await context.close();
    await mockServer.close();
  }
});
