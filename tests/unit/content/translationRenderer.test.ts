// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { removeRenderedTranslations, renderTranslationBelow } from "../../../src/content/translationRenderer";

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
});
