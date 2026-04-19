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

describe("pageController", () => {
  beforeEach(() => {
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

    await Promise.resolve();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();

    expect(requestTranslations).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(3);
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
    await Promise.resolve();
    await Promise.resolve();

    const loadingBlocks = Array.from(document.querySelectorAll("[data-bilingual-translator-owned='true']"));
    expect(loadingBlocks).toHaveLength(2);
    expect(loadingBlocks[0]?.getAttribute("data-bilingual-translator-state")).toBe("loading");
    expect(loadingBlocks[0]?.textContent).toContain("Translating");

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
