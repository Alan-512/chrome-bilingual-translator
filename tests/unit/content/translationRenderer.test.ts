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
    expect(styleTag?.textContent).toContain("border-bottom: 2px dashed");
  });

  it("re-attaches the translated result when the source node was replaced during rendering", () => {
    document.body.innerHTML = `
      <main>
        <div id="card">
          <a id="source" slot="title">A Reddit feed title that should be translated</a>
        </div>
      </main>
    `;
    const source = document.getElementById("source") as HTMLElement;

    renderTranslationLoadingBelow(source, {
      blockId: "alpha"
    });

    document.getElementById("card")!.innerHTML =
      `<a id="replacement" slot="title">A Reddit feed title that should be translated</a>`;
    const replacement = document.getElementById("replacement") as HTMLElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "一条应该被翻译的 Reddit 首页标题",
      sourceText: "A Reddit feed title that should be translated"
    });

    const translation = replacement.nextElementSibling as HTMLElement;
    expect(translation.dataset.bilingualTranslatorOwned).toBe("true");
    expect(translation.textContent).toBe("一条应该被翻译的 Reddit 首页标题");
  });

  it("anchors inline slot titles below their containing heading instead of injecting into the title row", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h2 id="heading">
            <a id="source" slot="title">Claude Code Game Studios</a>
            <span id="badge">Public template</span>
          </h2>
        </article>
      </main>
    `;
    const source = document.getElementById("source") as HTMLElement;
    const heading = document.getElementById("heading") as HTMLHeadingElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "Claude Code 游戏工作室"
    });

    expect(heading.querySelector("[data-bilingual-translator-owned='true']")).toBeNull();
    expect(heading.nextElementSibling?.getAttribute("data-bilingual-translator-owned")).toBe("true");
    expect((heading.nextElementSibling as HTMLElement).textContent).toBe("Claude Code 游戏工作室");
  });

  it("relaxes clipped card containers so the translated text can fully expand", () => {
    document.body.innerHTML = `
      <main>
        <article id="card" style="overflow: hidden; max-height: 80px;">
          <p id="source">A long Reddit card excerpt that should expand once translated.</p>
        </article>
      </main>
    `;
    const source = document.getElementById("source") as HTMLParagraphElement;
    const card = document.getElementById("card") as HTMLElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "一段较长的 Reddit 卡片译文，应该在插入后完整展示，而不是被父容器裁掉。"
    });

    expect(card.getAttribute("data-bilingual-translator-expanded")).toBe("true");
    expect(card.style.overflow).toBe("visible");
    expect(card.style.maxHeight).toBe("none");
  });

  it("relaxes card containers that are clipped via CSS rules instead of inline styles", () => {
    document.head.innerHTML = `
      <style>
        .clipped-card {
          overflow: hidden;
          max-height: 80px;
        }
      </style>
    `;
    document.body.innerHTML = `
      <main>
        <article id="card" class="clipped-card">
          <h3 id="source">OpenRouter model card title</h3>
        </article>
      </main>
    `;
    const source = document.getElementById("source") as HTMLHeadingElement;
    const card = document.getElementById("card") as HTMLElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "OpenRouter 模型卡片标题"
    });

    expect(card.getAttribute("data-bilingual-translator-expanded")).toBe("true");
    expect(card.style.overflow).toBe("visible");
    expect(card.style.maxHeight).toBe("none");
  });
});
