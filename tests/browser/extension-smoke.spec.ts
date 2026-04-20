import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

test.setTimeout(60_000);

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
  const fixtureRoutes = new Map<string, string>([
    ["/article", "article.html"],
    ["/article-layouts", "article-layouts.html"],
    ["/search?q=antigravity", "google-serp.html"],
    ["/r/vibecoding/", "reddit-listing.html"],
    ["/r/ChatGPT/comments/abc123/example-post/", "reddit-detail.html"],
    ["/owner/repo", "github-repo.html"],
    ["/models", "openrouter-models.html"],
    ["/products/build-check", "producthunt-detail.html"]
  ]);
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url && fixtureRoutes.has(request.url)) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        fs.readFileSync(path.join(projectRoot, "tests/browser/fixtures", fixtureRoutes.get(request.url) ?? ""), "utf8")
      );
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
        port: address.port,
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

async function launchExtensionContext(userDataDir: string) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: resolveExistingChromiumExecutable(),
    headless: false,
    args: [
      `--disable-extensions-except=${projectRoot}`,
      `--load-extension=${projectRoot}`
    ]
  });

  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent("serviceworker");
  }

  return { context, background };
}

async function configureMockTranslator(background: Awaited<ReturnType<typeof launchExtensionContext>>["background"], apiBaseUrl: string) {
  await background.evaluate(
    async ({ baseUrl }) => {
      await chrome.storage.local.set({
        extensionConfig: {
          apiBaseUrl: baseUrl,
          apiOrigin: "",
          apiKey: "test-key",
          model: "test-model",
          translateTitles: true,
          translateShortContentBlocks: true,
          targetLanguage: "zh-CN"
        }
      });
    },
    { baseUrl: apiBaseUrl }
  );
}

async function injectAndActivate(background: Awaited<ReturnType<typeof launchExtensionContext>>["background"], tabId: number) {
  await background.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      files: ["dist/content.js"]
    });
    await chrome.tabs.sendMessage(targetTabId, { type: "page/activate", tabId: targetTabId });
  }, tabId);
}

function buildFixtureUrl(port: number, pathname: string) {
  return `http://127.0.0.1:${port}${pathname}`;
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
  const { context, background } = await launchExtensionContext(userDataDir);

  try {
    await configureMockTranslator(background, `${mockServer.origin}/v1/chat/completions`);

    const articlePage = await context.newPage();
    await articlePage.goto(`${mockServer.origin}/article`);
    const [tab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));

    await injectAndActivate(background, tab.id);

    await expect(articlePage.locator("[data-bilingual-translator-owned='true']").first()).toContainText("中文翻译");
    await expect(articlePage.locator("[data-bilingual-translator-pill='true']")).toContainText("Translated");
    expect(mockServer.requests.length).toBeGreaterThan(0);
  } finally {
    await context.close();
    await mockServer.close();
  }
});

test("handles Google search result titles, snippets, videos, questions, and knowledge panels", async () => {
  const mockServer = await startMockTranslationServer();
  const userDataDir = test.info().outputPath("google-serp-user-data");
  const { context, background } = await launchExtensionContext(userDataDir);

  try {
    await configureMockTranslator(background, `${mockServer.origin}/v1/chat/completions`);

    const page = await context.newPage();
    await page.goto(buildFixtureUrl(mockServer.port, "/search?q=antigravity"));
    await page.bringToFront();
    const [tab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));

    await injectAndActivate(background, tab.id);

    await expect(page.locator(".yuRUbf + [data-bilingual-translator-owned='true']").first()).toContainText("中文翻译");
    await expect(page.locator(".VwiC3b + [data-bilingual-translator-owned='true']").first()).toContainText("中文翻译");

    await page.locator(".related-question-pair").scrollIntoViewIfNeeded();
    await expect(page.locator(".related-question-pair [data-bilingual-translator-owned='true']").first()).toContainText(
      "中文翻译"
    );

    await page.locator(".kp-wholepage").scrollIntoViewIfNeeded();
    await expect(page.locator(".kp-wholepage [data-bilingual-translator-owned='true']").first()).toContainText("中文翻译");
  } finally {
    await context.close();
    await mockServer.close();
  }
});

test("keeps generic article translations aligned with centered reading columns", async () => {
  const mockServer = await startMockTranslationServer();
  const userDataDir = test.info().outputPath("article-layouts-user-data");
  const { context, background } = await launchExtensionContext(userDataDir);

  try {
    await configureMockTranslator(background, `${mockServer.origin}/v1/chat/completions`);

    const page = await context.newPage();
    await page.goto(buildFixtureUrl(mockServer.port, "/article-layouts"));
    await page.bringToFront();
    const [tab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));

    await injectAndActivate(background, tab.id);

    const mediumParagraph = page.locator("#medium-paragraph");
    const mediumTranslation = page.locator("#medium-paragraph + [data-bilingual-translator-owned='true']");
    await expect(mediumTranslation).toContainText("中文翻译");
    await expect(mediumTranslation).toHaveCSS("width", await mediumParagraph.evaluate((node) => getComputedStyle(node).width));
    await expect(mediumTranslation).toHaveCSS(
      "margin-left",
      await mediumParagraph.evaluate((node) => getComputedStyle(node).marginLeft)
    );
  } finally {
    await context.close();
    await mockServer.close();
  }
});

test("renders Reddit listing translations below the feed preview instead of inside the card title flow", async () => {
  const mockServer = await startMockTranslationServer();
  const userDataDir = test.info().outputPath("reddit-listing-user-data");
  const { context, background } = await launchExtensionContext(userDataDir);

  try {
    await configureMockTranslator(background, `${mockServer.origin}/v1/chat/completions`);

    const page = await context.newPage();
    await page.goto(buildFixtureUrl(mockServer.port, "/r/vibecoding/"));
    await page.bringToFront();
    const [tab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));

    await injectAndActivate(background, tab.id);

    await expect(page.locator("shreddit-post [slot='text-body'] + [data-bilingual-translator-owned='true']").first()).toContainText(
      "中文翻译"
    );
  } finally {
    await context.close();
    await mockServer.close();
  }
});

test("keeps Reddit detail translations segmented and anchors the title translation below the first paragraph", async () => {
  const mockServer = await startMockTranslationServer();
  const userDataDir = test.info().outputPath("reddit-detail-user-data");
  const { context, background } = await launchExtensionContext(userDataDir);

  try {
    await configureMockTranslator(background, `${mockServer.origin}/v1/chat/completions`);

    const page = await context.newPage();
    await page.goto(buildFixtureUrl(mockServer.port, "/r/ChatGPT/comments/abc123/example-post/"));
    await page.bringToFront();
    const [tab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));

    await injectAndActivate(background, tab.id);

    await expect(page.locator("[slot='title'] + [data-bilingual-translator-owned='true']")).toHaveCount(0);
    await expect(page.locator("p + [data-bilingual-translator-owned='true']").first()).toContainText("中文翻译");
  } finally {
    await context.close();
    await mockServer.close();
  }
});

test("expands GitHub README and OpenRouter model cards when translations are inserted", async () => {
  const mockServer = await startMockTranslationServer();
  const userDataDir = test.info().outputPath("github-openrouter-user-data");
  const { context, background } = await launchExtensionContext(userDataDir);

  try {
    await configureMockTranslator(background, `${mockServer.origin}/v1/chat/completions`);

    const githubPage = await context.newPage();
    await githubPage.goto(buildFixtureUrl(mockServer.port, "/owner/repo"));
    await githubPage.bringToFront();
    const [githubTab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));
    await injectAndActivate(background, githubTab.id);

    await expect(githubPage.locator("#readme")).toHaveAttribute("data-bilingual-translator-expanded", "true");

    const openRouterPage = await context.newPage();
    await openRouterPage.goto(buildFixtureUrl(mockServer.port, "/models"));
    await openRouterPage.bringToFront();
    const tabs = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));
    const openRouterTab = tabs.at(-1);
    if (!openRouterTab?.id) {
      throw new Error("OpenRouter tab did not resolve to a numeric id.");
    }
    await injectAndActivate(background, openRouterTab.id);

    const firstRow = openRouterPage.locator(".virtual-row").first();
    const secondRow = openRouterPage.locator(".virtual-row").nth(1);
    await expect(firstRow).toHaveAttribute("data-bilingual-translator-expanded", "true");
    await expect(openRouterPage.locator(".virtual-row [data-bilingual-translator-owned='true']").first()).toContainText(
      "中文翻译"
    );

    const firstBox = await firstRow.boundingBox();
    const secondBox = await secondRow.boundingBox();
    if (!firstBox || !secondBox) {
      throw new Error("OpenRouter virtual rows did not produce layout boxes.");
    }
    expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height - 1);
  } finally {
    await context.close();
    await mockServer.close();
  }
});

test("anchors Product Hunt title translations below the first summary paragraph", async () => {
  const mockServer = await startMockTranslationServer();
  const userDataDir = test.info().outputPath("producthunt-user-data");
  const { context, background } = await launchExtensionContext(userDataDir);

  try {
    await configureMockTranslator(background, `${mockServer.origin}/v1/chat/completions`);

    const page = await context.newPage();
    await page.goto(buildFixtureUrl(mockServer.port, "/products/build-check"));
    await page.bringToFront();
    const [tab] = await background.evaluate(async () => chrome.tabs.query({ active: true, currentWindow: true }));

    await injectAndActivate(background, tab.id);

    await expect(page.locator("[data-producthunt-main] p + [data-bilingual-translator-owned='true']").first()).toContainText(
      "中文翻译"
    );
  } finally {
    await context.close();
    await mockServer.close();
  }
});
