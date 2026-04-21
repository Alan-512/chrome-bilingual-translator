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
    expect(styleTag?.textContent).toContain("text-decoration-line: underline");
    expect(styleTag?.textContent).toContain("text-decoration-style: dashed");
    expect(styleTag?.textContent).not.toContain("border-bottom: 2px dashed");
    expect(styleTag?.textContent).toContain("unicode-bidi: plaintext");
    expect(styleTag?.textContent).toContain("writing-mode: horizontal-tb");
  });

  it("forces a stable left-to-right translation container in pages with conflicting text direction", () => {
    document.body.innerHTML = `<main dir="rtl"><p id="source">Hello world.</p></main>`;
    const source = document.getElementById("source") as HTMLParagraphElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "这是中文译文"
    });

    const translation = source.nextElementSibling as HTMLElement;
    expect(translation.getAttribute("lang")).toBe("zh-CN");
    expect(translation.getAttribute("dir")).toBe("ltr");
    expect(translation.style.direction).toBe("ltr");
    expect(translation.style.unicodeBidi).toBe("plaintext");
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

  it("supports an explicit anchor element for site-specific rendering strategies", () => {
    document.body.innerHTML = `
      <main>
        <article id="card">
          <h2 id="title">OpenAI: GPT-4o Mini TTS</h2>
          <p id="summary">Cost-efficient text-to-speech model.</p>
        </article>
      </main>
    `;
    const title = document.getElementById("title") as HTMLHeadingElement;
    const summary = document.getElementById("summary") as HTMLParagraphElement;

    renderTranslationBelow(title, {
      blockId: "alpha",
      translationText: "OpenAI：GPT-4o Mini TTS",
      anchorElement: summary
    });

    expect(title.nextElementSibling?.getAttribute("data-bilingual-translator-owned")).not.toBe("true");
    expect(summary.nextElementSibling?.getAttribute("data-bilingual-translator-owned")).toBe("true");
    expect((summary.nextElementSibling as HTMLElement).textContent).toBe("OpenAI：GPT-4o Mini TTS");
  });

  it("keeps explicit slot title anchors directly under the title element", () => {
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a id="title" slot="title">How to not look like vibe coded app</a>
          <div id="body" slot="text-body">Preview body</div>
        </shreddit-post>
      </main>
    `;
    const title = document.getElementById("title") as HTMLAnchorElement;

    renderTranslationBelow(title, {
      blockId: "alpha",
      translationText: "如何避免应用看起来有种 AI 生成感",
      anchorElement: title
    });

    expect(title.nextElementSibling?.getAttribute("data-bilingual-translator-owned")).toBe("true");
    expect((title.nextElementSibling as HTMLElement).textContent).toBe("如何避免应用看起来有种 AI 生成感");
  });

  it("normalizes explicit inline anchors to the nearest semantic block on search-result layouts", () => {
    document.body.innerHTML = `
      <main>
        <article id="result">
          <div id="meta-row">
            <span id="site-name">Chrome Web Store</span>
            <span id="inline-anchor">翻译此页</span>
          </div>
          <h3 id="title">SteamDB - Chrome Web Store</h3>
          <p id="snippet">Adds SteamDB links and new features on the Steam store and community.</p>
        </article>
      </main>
    `;
    const title = document.getElementById("title") as HTMLHeadingElement;
    const inlineAnchor = document.getElementById("inline-anchor") as HTMLSpanElement;
    const metaRow = document.getElementById("meta-row") as HTMLDivElement;

    renderTranslationBelow(title, {
      blockId: "alpha",
      translationText: "SteamDB - Chrome 网上应用店",
      anchorElement: inlineAnchor
    });

    expect(metaRow.querySelector("[data-bilingual-translator-owned='true']")).toBeNull();
    expect(metaRow.nextElementSibling?.getAttribute("data-bilingual-translator-owned")).toBe("true");
    expect((metaRow.nextElementSibling as HTMLElement).textContent).toBe("SteamDB - Chrome 网上应用店");
  });

  it("places heading translations outside wrapping search result links", () => {
    document.body.innerHTML = `
      <main>
        <article id="result">
          <a id="title-link" href="/result">
            <h3 id="title">Build with Google Antigravity, our new agentic platform</h3>
          </a>
          <p id="snippet">The agentic development platform that lets agents autonomously plan.</p>
        </article>
      </main>
    `;
    const title = document.getElementById("title") as HTMLHeadingElement;
    const titleLink = document.getElementById("title-link") as HTMLAnchorElement;

    renderTranslationBelow(title, {
      blockId: "alpha",
      translationText: "使用 Google Antigravity 构建我们的新智能体平台"
    });

    expect(titleLink.querySelector("[data-bilingual-translator-owned='true']")).toBeNull();
    expect(titleLink.nextElementSibling?.getAttribute("data-bilingual-translator-owned")).toBe("true");
    expect((titleLink.nextElementSibling as HTMLElement).textContent).toBe(
      "使用 Google Antigravity 构建我们的新智能体平台"
    );
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

  it("aligns translation blocks with centered source paragraphs", () => {
    document.body.innerHTML = `
      <main>
        <p id="source" style="width: 640px; margin-left: 220px; margin-right: 220px;">
          Our models are evolving at a rapid clip.
        </p>
      </main>
    `;
    const source = document.getElementById("source") as HTMLParagraphElement;

    renderTranslationBelow(source, {
      blockId: "alpha",
      translationText: "我们的模型正在快速演进。"
    });

    const translation = source.nextElementSibling as HTMLElement;
    expect(translation.style.width).toBe("640px");
    expect(translation.style.marginLeft).toBe("220px");
    expect(translation.style.marginRight).toBe("220px");
  });
});
