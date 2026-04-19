// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  removeRenderedTranslations,
  renderTranslationBelow,
  renderTranslationLoadingBelow
} from "../../../src/content/translationRenderer";

describe("renderTranslationBelow", () => {
  it("inserts a translation block below the source without mutating source text", () => {
    document.body.innerHTML = `<main><p id="source">Hello world.</p></main>`;
    const source = document.getElementById("source") as HTMLParagraphElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "你好，世界。"
    });

    const translation = source.nextElementSibling as HTMLElement;
    expect(source.textContent).toBe("Hello world.");
    expect(translation.dataset.bilingualTranslatorOwned).toBe("true");
    expect(translation.textContent).toBe("你好，世界。");
  });

  it("removes all extension-owned translations cleanly", () => {
    document.body.innerHTML = `<main><p id="source">Hello world.</p></main>`;
    const source = document.getElementById("source") as HTMLParagraphElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "你好，世界。"
    });

    removeRenderedTranslations(document);

    expect(document.querySelector("[data-bilingual-translator-owned='true']")).toBeNull();
    expect(source.textContent).toBe("Hello world.");
  });

  it("renders a loading placeholder and reuses it for the final translation", () => {
    document.body.innerHTML = `<main><h1 id="source">No more generic UI</h1></main>`;
    const source = document.getElementById("source") as HTMLHeadingElement;

    const loading = renderTranslationLoadingBelow(source, {
      blockId: "alpha"
    });

    expect(loading.dataset.bilingualTranslatorOwned).toBe("true");
    expect(loading.dataset.bilingualTranslatorState).toBe("loading");
    expect(loading.textContent).toContain("Translating");

    const translated = renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "不再通用的 UI"
    });

    expect(translated).toBe(loading);
    expect(translated.dataset.bilingualTranslatorState).toBe("translated");
    expect(translated.textContent).toBe("不再通用的 UI");
    expect(document.querySelectorAll("[data-bilingual-translator-owned='true']")).toHaveLength(1);
  });

  it("injects styles that inherit the source text color", () => {
    document.body.innerHTML = `<main><p id="source" style="color: rgb(12, 34, 56)">Hello world.</p></main>`;
    const source = document.getElementById("source") as HTMLParagraphElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "你好，世界。"
    });

    const styleTag = document.head.querySelector("[data-bilingual-translator-style='true']");
    expect(styleTag?.textContent).toContain("color: inherit");
    expect(styleTag?.textContent).toContain("border-top-color: currentColor");
  });
});
