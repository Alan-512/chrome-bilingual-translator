// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPageController } from "../../../src/content/pageController";

function createNoopObserverCoordinator() {
  return {
    start() {},
    observeCandidates() {},
    disconnect() {}
  };
}

function mockElementRect(element: HTMLElement, top: number, bottom: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON() {}
  } as DOMRect);
}

async function settlePromises(iterations = 6) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("pageController", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    document.body.innerHTML = `
      <main>
        <h2>Build Check</h2>
        <p>Hello world from a real content paragraph.</p>
      </main>
    `;
  });

  it("activates, translates visible content once, and reports active state", async () => {
    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );
    const reportPageState = vi.fn(async () => {});

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState,
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();

    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(reportPageState).toHaveBeenNthCalledWith(1, {
      enabled: true,
      translatedBlockCount: 0,
      pendingRequestCount: 0
    });
    expect(reportPageState).toHaveBeenNthCalledWith(2, {
      enabled: true,
      translatedBlockCount: 0,
      pendingRequestCount: 2
    });
    expect(reportPageState).toHaveBeenNthCalledWith(3, {
      enabled: true,
      translatedBlockCount: 2,
      pendingRequestCount: 0
    });
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);

    await controller.activate();
    expect(requestTranslations).toHaveBeenCalledTimes(1);
    await controller.deactivate();
  });

  it("translates newly visible blocks lazily through the observer callback", async () => {
    let visibleCallback: ((elements: HTMLElement[]) => void) | undefined;
    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      isElementReadyForTranslation: (element) => element.tagName === "H2",
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          visibleCallback = callbacks.onVisible;
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    await controller.activate();

    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(1);

    const paragraph = document.querySelector("p") as HTMLElement;
    visibleCallback?.([paragraph]);

    await settlePromises();

    expect(requestTranslations).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);
    await controller.deactivate();
  });

  it("uses viewport proximity as the default initial translation gate", async () => {
    let visibleCallback: ((elements: HTMLElement[]) => void) | undefined;
    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );
    const heading = document.querySelector("h2") as HTMLElement;
    const paragraph = document.querySelector("p") as HTMLElement;
    mockElementRect(heading, 20, 44);
    mockElementRect(paragraph, 5000, 5030);

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          visibleCallback = callbacks.onVisible;
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    await controller.activate();

    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(requestTranslations.mock.calls[0]?.[0]).toHaveLength(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(1);

    visibleCallback?.([paragraph]);
    await settlePromises();

    expect(requestTranslations).toHaveBeenCalledTimes(2);
    expect(requestTranslations.mock.calls[1]?.[0]).toHaveLength(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);
    await controller.deactivate();
  });

  it("rescans new content and skips blocks that were already translated", async () => {
    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();

    const newParagraph = document.createElement("p");
    newParagraph.textContent = "A newly appended paragraph.";
    document.querySelector("main")?.appendChild(newParagraph);

    await controller.rescan();

    expect(requestTranslations).toHaveBeenCalledTimes(2);
    expect(requestTranslations.mock.calls[1]?.[0]).toHaveLength(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(3);
    await controller.deactivate();
  });

  it("translates Reddit feed card titles and preview bodies as separate listing blocks", async () => {
    window.history.replaceState({}, "", "/r/codex/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Kimi k2.6 Code Preview might be the current Open-code SOTA.</a>
          <div slot="text-body">
            <p>I might be overhyping this, but I'm genuinely blown away right now.</p>
            <p>I've been testing it on a heavy production-level task.</p>
          </div>
        </shreddit-post>
      </main>
    `;

    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();

    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(requestTranslations.mock.calls[0]?.[0]).toEqual([
      {
        blockId: expect.any(String),
        sourceText: "Kimi k2.6 Code Preview might be the current Open-code SOTA."
      },
      {
        blockId: expect.any(String),
        sourceText:
          "I might be overhyping this, but I'm genuinely blown away right now.\n\n" +
          "I've been testing it on a heavy production-level task."
      }
    ]);

    const title = document.querySelector("[slot='title']") as HTMLElement;
    const previewBody = document.querySelector("[slot='text-body']") as HTMLElement;
    const titleTranslation = title.nextElementSibling as HTMLElement;
    const bodyTranslation = previewBody.nextElementSibling as HTMLElement;
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);
    expect(titleTranslation?.dataset.bilingualTranslatorOwned).toBe("true");
    expect(bodyTranslation?.dataset.bilingualTranslatorOwned).toBe("true");
    expect(titleTranslation?.textContent).toContain("ZH:Kimi k2.6 Code Preview might be the current Open-code SOTA.");
    expect(bodyTranslation?.textContent).toContain("ZH:I might be overhyping this, but I'm genuinely blown away right now.");
    await controller.deactivate();
  });

  it("observes dynamically added content without translating it until it becomes visible", async () => {
    let mutationCallback: (() => void) | undefined;
    let visibleCallback: ((elements: HTMLElement[]) => void) | undefined;
    const observedElements: HTMLElement[] = [];
    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          visibleCallback = callbacks.onVisible;
          mutationCallback = callbacks.onMutation;
        },
        observeCandidates(candidates) {
          observedElements.push(...candidates);
        },
        disconnect() {}
      })
    });

    await controller.activate();

    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);

    const newParagraph = document.createElement("p");
    newParagraph.textContent = "A lazy paragraph added later.";
    document.querySelector("main")?.appendChild(newParagraph);

    mutationCallback?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(observedElements).toContain(newParagraph);
    expect(requestTranslations).toHaveBeenCalledTimes(1);

    visibleCallback?.([newParagraph]);
    await settlePromises();

    expect(requestTranslations).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(3);
    await controller.deactivate();
  });

  it("re-hydrates visible translations after the host rerenders the same content", async () => {
    let mutationCallback: (() => void) | undefined;
    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          mutationCallback = callbacks.onMutation;
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    await controller.activate();
    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);

    document.body.innerHTML = `
      <main>
        <h2>Build Check</h2>
        <p>Hello world from a real content paragraph.</p>
      </main>
    `;

    mutationCallback?.();
    await settlePromises();

    const translatedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(translatedBlocks).toHaveLength(2);
    expect(translatedBlocks.every((node) => node.textContent?.includes("ZH:"))).toBe(true);
    await controller.deactivate();
  });

  it("re-hydrates adapter-backed content after rerender even when the DOM tag changes", async () => {
    let mutationCallback: (() => void) | undefined;
    const requestTranslations = vi.fn(async (blocks) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    window.history.replaceState({}, "", "/github-repo");
    document.body.innerHTML = `
      <main>
        <section id="readme">
          <article class="markdown-body">
            <h1>Claude Code Game Studios</h1>
            <p>Turn a single Claude Code session into a full game development studio.</p>
          </article>
        </section>
      </main>
    `;

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          mutationCallback = callbacks.onMutation;
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    await controller.activate();
    expect(requestTranslations).toHaveBeenCalledTimes(1);

    document.body.innerHTML = `
      <main>
        <section id="readme">
          <article class="markdown-body">
            <h2>Claude Code Game Studios</h2>
            <p>Turn a single Claude Code session into a full game development studio.</p>
          </article>
        </section>
      </main>
    `;

    mutationCallback?.();
    await settlePromises();

    const translatedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(translatedBlocks).toHaveLength(2);
    expect(translatedBlocks.every((node) => node.textContent?.includes("ZH:"))).toBe(true);
    await controller.deactivate();
  });

  it("replaces stale rendered translations when virtualized content rerenders with the same adapter memory key", async () => {
    let mutationCallback: (() => void) | undefined;
    const requestTranslations = vi.fn(async (blocks: Array<{ blockId: string; sourceText: string }>) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    window.history.replaceState({}, "", "/models");
    document.body.innerHTML = `
      <main>
        <ul>
          <li style="position: absolute; height: 120px; transform: translateY(0px);">
            <article class="model-card">
              <div data-testid="model-list-item">
                <a href="/openai/gpt-4o-mini-tts-2025-12-15">
                  <span>OpenAI: GPT-4o Mini TTS</span>
                </a>
                <a href="/openai/gpt-4o-mini-tts-2025-12-15">
                  GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.
                </a>
              </div>
            </article>
          </li>
        </ul>
      </main>
    `;

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          mutationCallback = callbacks.onMutation;
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    await controller.activate();
    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);

    const modelListItem = document.querySelector("[data-testid='model-list-item']") as HTMLElement;
    modelListItem.innerHTML = `
      <a href="/openai/gpt-4o-mini-tts-2025-12-15">
        <span>OpenAI: GPT-4o Mini TTS</span>
      </a>
      <a href="/openai/gpt-4o-mini-tts-2025-12-15">
        GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.
      </a>
    `;

    mutationCallback?.();
    await settlePromises();

    const translatedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(translatedBlocks).toHaveLength(2);
    expect(translatedBlocks.map((node) => node.textContent)).toEqual([
      "ZH:GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.",
      "ZH:OpenAI: GPT-4o Mini TTS"
    ]);
    await controller.deactivate();
  });

  it("does not queue the same visible content twice while its first request is still pending", async () => {
    let mutationCallback: (() => void) | undefined;
    let resolveTranslations: ((value: Record<string, string>) => void) | undefined;
    const requestTranslations = vi.fn(
      (blocks: Array<{ blockId: string; sourceText: string }>) =>
        new Promise<Record<string, string>>((resolve) => {
          resolveTranslations = resolve;
        })
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          mutationCallback = callbacks.onMutation;
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    const activationPromise = controller.activate();
    await settlePromises();
    expect(requestTranslations).toHaveBeenCalledTimes(1);

    document.body.innerHTML = `
      <main>
        <h2>Build Check</h2>
        <p>Hello world from a real content paragraph.</p>
      </main>
    `;
    mutationCallback?.();
    await settlePromises();

    expect(requestTranslations).toHaveBeenCalledTimes(1);

    const firstBatchBlocks = requestTranslations.mock.calls[0]?.[0] as Array<{ blockId: string; sourceText: string }>;
    resolveTranslations?.(
      Object.fromEntries(firstBatchBlocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    await activationPromise;

    const translatedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(translatedBlocks).toHaveLength(2);
    expect(translatedBlocks.every((node) => node.textContent?.includes("ZH:"))).toBe(true);
    await controller.deactivate();
  });

  it("renders inline loading placeholders while translation is pending", async () => {
    let resolveTranslations: ((value: Record<string, string>) => void) | undefined;
    const requestTranslations = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveTranslations = resolve;
        })
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    const activationPromise = controller.activate();
    await settlePromises();

    const loadingBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(loadingBlocks).toHaveLength(2);
    expect(loadingBlocks[0]?.getAttribute("data-bilingual-translator-state")).toBe("loading");
    expect(loadingBlocks[0]?.textContent).toContain("Translating");
    expect(requestTranslations).toHaveBeenCalledTimes(1);

    const pendingBlocks = requestTranslations.mock.calls[0]?.[0] as Array<{ blockId: string; sourceText: string }>;
    resolveTranslations?.(
      Object.fromEntries(pendingBlocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    await activationPromise;

    const translatedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(translatedBlocks[0]?.getAttribute("data-bilingual-translator-state")).toBe("translated");
    expect(translatedBlocks[0]?.textContent).toContain("ZH:");
    await controller.deactivate();
  });

  it("starts translating newly visible blocks even while an earlier request is still pending", async () => {
    let visibleCallback: ((elements: HTMLElement[]) => void) | undefined;
    const heading = document.querySelector("h2") as HTMLElement;
    const paragraph = document.querySelector("p") as HTMLElement;
    let resolveFirstBatch: ((value: Record<string, string>) => void) | undefined;
    let resolveSecondBatch: ((value: Record<string, string>) => void) | undefined;
    let requestCount = 0;

    const requestTranslations = vi.fn((blocks: Array<{ blockId: string; sourceText: string }>) => {
      requestCount += 1;

      if (requestCount === 1) {
        return new Promise<Record<string, string>>((resolve) => {
          resolveFirstBatch = resolve;
        });
      }

      return new Promise<Record<string, string>>((resolve) => {
        resolveSecondBatch = resolve;
      });
    });

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      isElementReadyForTranslation: (element) => element === heading,
      createObserverCoordinator: () => ({
        start(_candidates, callbacks) {
          visibleCallback = callbacks.onVisible;
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    const activationPromise = controller.activate();
    await settlePromises();

    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(1);

    visibleCallback?.([paragraph]);
    await settlePromises();

    expect(requestTranslations).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);

    const firstBatchBlocks = requestTranslations.mock.calls[0]?.[0] as Array<{ blockId: string; sourceText: string }>;
    resolveFirstBatch?.(
      Object.fromEntries(firstBatchBlocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );
    const secondBatchBlocks = requestTranslations.mock.calls[1]?.[0] as Array<{ blockId: string; sourceText: string }>;
    resolveSecondBatch?.(
      Object.fromEntries(secondBatchBlocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    await activationPromise;

    const translatedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(translatedBlocks).toHaveLength(2);
    expect(translatedBlocks.every((node) => node.textContent?.includes("ZH:"))).toBe(true);
    await controller.deactivate();
  });

  it("renders completed batches before later batches finish with twenty-four blocks per batch", async () => {
    document.body.innerHTML = `
      <main>
        ${Array.from({ length: 25 }, (_, index) => `<p>Paragraph ${index + 1} with enough content to translate well.</p>`).join("")}
      </main>
    `;

    let resolveFirstBatch: ((value: Record<string, string>) => void) | undefined;
    let resolveSecondBatch: ((value: Record<string, string>) => void) | undefined;
    let batchCallCount = 0;

    const requestTranslations = vi.fn((blocks: Array<{ blockId: string; sourceText: string }>) => {
      batchCallCount += 1;

      if (batchCallCount === 1) {
        return new Promise<Record<string, string>>((resolve) => {
          resolveFirstBatch = resolve;
        });
      }

      return new Promise<Record<string, string>>((resolve) => {
        resolveSecondBatch = resolve;
      });
    });

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    const activationPromise = controller.activate();
    await settlePromises();

    let renderedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(renderedBlocks).toHaveLength(25);
    expect(renderedBlocks.every((node) => node.getAttribute("data-bilingual-translator-state") === "loading")).toBe(
      true
    );

    const firstBatchBlocks = requestTranslations.mock.calls[0]?.[0] as Array<{ blockId: string; sourceText: string }>;
    resolveFirstBatch?.(
      Object.fromEntries(firstBatchBlocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    await settlePromises();

    renderedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(renderedBlocks.filter((node) => node.getAttribute("data-bilingual-translator-state") === "translated")).toHaveLength(24);
    expect(renderedBlocks.filter((node) => node.getAttribute("data-bilingual-translator-state") === "loading")).toHaveLength(1);

    const secondBatchBlocks = requestTranslations.mock.calls[1]?.[0] as Array<{ blockId: string; sourceText: string }>;
    resolveSecondBatch?.(
      Object.fromEntries(secondBatchBlocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    await activationPromise;

    renderedBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(renderedBlocks).toHaveLength(25);
    expect(renderedBlocks.every((node) => node.textContent?.includes("ZH:"))).toBe(true);
    await controller.deactivate();
  });

  it("limits each processing cycle to three batches on very long pages", async () => {
    document.body.innerHTML = `
      <main>
        ${Array.from({ length: 90 }, (_, index) => `<p>Long page paragraph ${index + 1} with enough content to translate.</p>`).join("")}
      </main>
    `;

    const requestTranslations = vi.fn(async (blocks: Array<{ blockId: string; sourceText: string }>) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();

    const requestedBlockCount = requestTranslations.mock.calls.reduce((count, call) => count + call[0].length, 0);
    expect(requestTranslations).toHaveBeenCalledTimes(3);
    expect(requestedBlockCount).toBe(72);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(72);

    await controller.activate();

    const totalRequestedBlockCount = requestTranslations.mock.calls.reduce((count, call) => count + call[0].length, 0);
    expect(totalRequestedBlockCount).toBe(90);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(90);
    await controller.deactivate();
  });

  it("falls back to per-block retries when a batch request fails", async () => {
    const requestTranslations = vi.fn(async (blocks: Array<{ blockId: string; sourceText: string }>) => {
      if (blocks.length > 1) {
        throw new Error("Batch parse failed");
      }

      return {
        [blocks[0].blockId]: `ZH:${blocks[0].sourceText}`
      };
    });

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();

    expect(requestTranslations).toHaveBeenCalled();
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']")).every((node) => node.textContent?.includes("ZH:"))).toBe(true);
    await controller.deactivate();
  });

  it("keeps successful translations even when one block is missing from the batch response", async () => {
    const requestTranslations = vi.fn(async (blocks: Array<{ blockId: string; sourceText: string }>) => {
      return {
        [blocks[0].blockId]: `ZH:${blocks[0].sourceText}`
      };
    });

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();

    const rendered = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.textContent).toContain("ZH:");
    await controller.deactivate();
  });

  it("retries failed blocks when activate is triggered again", async () => {
    let attempt = 0;
    const requestTranslations = vi.fn(async (blocks: Array<{ blockId: string; sourceText: string }>) => {
      attempt += 1;

      if (attempt <= 3) {
        throw new Error("Temporary upstream failure");
      }

      return Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]));
    });

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();
    expect(document.querySelector("[data-bilingual-translator-owned='true']")).toBeNull();
    const callCountAfterFailure = requestTranslations.mock.calls.length;

    await controller.activate();

    const rendered = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(requestTranslations.mock.calls.length).toBeGreaterThan(callCountAfterFailure);
    expect(rendered).toHaveLength(2);
    expect(rendered.every((node) => node.textContent?.includes("ZH:"))).toBe(true);
    await controller.deactivate();
  });

  it("restarts observation when activate is triggered again after a same-tab URL navigation", async () => {
    const requestTranslations = vi.fn(async (blocks: Array<{ blockId: string; sourceText: string }>) =>
      Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`]))
    );
    const observedGroups: HTMLElement[][] = [];
    const visibleCallbacks: Array<(elements: HTMLElement[]) => void> = [];

    window.history.replaceState({}, "", "/r/vibecoding/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Homepage title</a>
          <div slot="text-body">Homepage preview body.</div>
        </shreddit-post>
      </main>
    `;

    const controller = createPageController(document, {
      requestTranslations,
      reportPageState: async () => {},
      isElementReadyForTranslation: (element) => element.getAttribute("slot") === "title",
      createObserverCoordinator: () => ({
        start(candidates, callbacks) {
          observedGroups.push(candidates);
          visibleCallbacks.push(callbacks.onVisible);
        },
        observeCandidates() {},
        disconnect() {}
      })
    });

    await controller.activate();
    expect(requestTranslations).toHaveBeenCalledTimes(1);
    expect(requestTranslations.mock.calls[0]?.[0]).toEqual([
      {
        blockId: expect.any(String),
        sourceText: "Homepage title"
      }
    ]);
    expect(observedGroups).toHaveLength(1);

    window.history.replaceState({}, "", "/r/vibecoding/comments/abc123/example-post/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Detail title</a>
          <div slot="text-body">
            <p>First comment paragraph.</p>
            <p>Second comment paragraph.</p>
          </div>
        </shreddit-post>
      </main>
    `;

    await controller.activate();
    expect(observedGroups).toHaveLength(2);
    expect(requestTranslations).toHaveBeenCalledTimes(2);
    expect(requestTranslations.mock.calls[1]?.[0]).toEqual([
      {
        blockId: expect.any(String),
        sourceText: "Detail title"
      }
    ]);

    const detailParagraphs = Array.from(document.querySelectorAll("[slot='text-body'] p")) as HTMLElement[];
    visibleCallbacks.at(-1)?.(detailParagraphs);
    await settlePromises();

    expect(requestTranslations).toHaveBeenCalledTimes(3);
    expect(requestTranslations.mock.calls[2]?.[0]).toEqual([
      {
        blockId: expect.any(String),
        sourceText: "First comment paragraph."
      },
      {
        blockId: expect.any(String),
        sourceText: "Second comment paragraph."
      }
    ]);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(3);
    expect(Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']")).every((node) => node.textContent?.includes("ZH:"))).toBe(
      true
    );
    await controller.deactivate();
  });

  it("deactivates and removes injected translations", async () => {
    const controller = createPageController(document, {
      requestTranslations: async (blocks) =>
        Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`])),
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();
    await controller.deactivate();

    expect(document.querySelector("[data-bilingual-translator-owned='true']")).toBeNull();
  });

  it("shows a visible error when translation requests fail", async () => {
    const controller = createPageController(document, {
      requestTranslations: async () => {
        throw new Error("Missing required configuration: API key");
      },
      reportPageState: async () => {},
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await controller.activate();

    const pill = document.querySelector("[data-bilingual-translator-pill='true']") as HTMLElement;
    expect(pill.dataset.state).toBe("error");
    expect(pill.textContent).toContain("Missing required configuration: API key");
    expect(document.querySelector("[data-bilingual-translator-owned='true']")).toBeNull();
  });

  it("ignores invalidated extension context errors raised while reporting page state", async () => {
    const controller = createPageController(document, {
      requestTranslations: async (blocks) =>
        Object.fromEntries(blocks.map((block) => [block.blockId, `ZH:${block.sourceText}`])),
      reportPageState: async () => {
        throw new Error("Extension context invalidated.");
      },
      createObserverCoordinator: createNoopObserverCoordinator
    });

    await expect(controller.activate()).resolves.toBeUndefined();
  });
});
