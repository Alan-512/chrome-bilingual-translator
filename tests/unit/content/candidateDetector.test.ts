// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { collectCandidateBlocks } from "../../../src/content/candidateDetector";

describe("collectCandidateBlocks", () => {
  it("detects paragraphs and short content titles", () => {
    document.body.innerHTML = `
      <main>
        <h2>Build Check</h2>
        <p>Hello world from a real content paragraph.</p>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => ({ tagName: block.element.tagName, text: block.sourceText }))).toEqual([
      { tagName: "H2", text: "Build Check" },
      { tagName: "P", text: "Hello world from a real content paragraph." }
    ]);
  });

  it("skips navigation and action text", () => {
    document.body.innerHTML = `
      <nav>
        <a>News</a>
        <button>Sign in</button>
      </nav>
      <main>
        <p>Actual article paragraph with enough meaning.</p>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.sourceText).toBe("Actual article paragraph with enough meaning.");
  });

  it("skips mostly numeric or timestamp-like content", () => {
    document.body.innerHTML = `
      <main>
        <p>2026-04-18 18:33</p>
        <p>1,234 points</p>
        <p>This explanation should still be translated.</p>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual(["This explanation should still be translated."]);
  });

  it("skips extension-owned nodes", () => {
    document.body.innerHTML = `
      <main>
        <p data-bilingual-translator-owned="true">Injected translation</p>
        <p>Original user content.</p>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.sourceText).toBe("Original user content.");
  });

  it("groups Reddit shreddit feed titles and body previews into a single card block", () => {
    window.history.replaceState({}, "", "/r/vibecoding/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">A Reddit feed title that should be translated</a>
          <div slot="text-body">A feed preview paragraph that is shown on the homepage card.</div>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.element.getAttribute("slot")).toBe("text-body");
    expect(blocks[0]?.sourceText).toBe(
      "A Reddit feed title that should be translated\n\nA feed preview paragraph that is shown on the homepage card."
    );
  });

  it("groups Reddit text-body containers with semantic children into a single card block", () => {
    window.history.replaceState({}, "", "/r/vibecoding/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">A Reddit feed title that should be translated</a>
          <div slot="text-body">
            <p>First body paragraph.</p>
            <p>Second body paragraph.</p>
          </div>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.element.getAttribute("slot")).toBe("text-body");
    expect(blocks[0]?.sourceText).toBe(
      "A Reddit feed title that should be translated\n\nFirst body paragraph.\n\nSecond body paragraph."
    );
  });

  it("keeps Reddit comments pages segmented instead of grouping the whole post card", () => {
    window.history.replaceState({}, "", "/r/ChatGPT/comments/abc123/example-post/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">I found out why ChatGPT gets slower the longer you use it</a>
          <div slot="text-body">
            <p>Been frustrated with chatgpt freezing in long chats for months.</p>
            <p>Chatgpt renders every single message in your browser at once.</p>
          </div>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => ({ slot: block.element.getAttribute("slot"), text: block.sourceText }))).toEqual([
      {
        slot: "title",
        text: "I found out why ChatGPT gets slower the longer you use it"
      },
      {
        slot: null,
        text: "Been frustrated with chatgpt freezing in long chats for months."
      },
      {
        slot: null,
        text: "Chatgpt renders every single message in your browser at once."
      }
    ]);
  });

  it("limits GitHub repository home candidates to README and about content", () => {
    document.body.innerHTML = `
      <main>
        <div id="files">
          <p>Update FUNDING.yml: GitHub Sponsors + Buy Me a Coffee</p>
        </div>
        <section id="readme">
          <article class="markdown-body">
            <h1>Claude Code Game Studios</h1>
            <p>Turn a single Claude Code session into a full game development studio.</p>
          </article>
        </section>
        <aside>
          <div itemprop="about">
            <p>Turn Claude Code into a full game dev studio.</p>
          </div>
        </aside>
      </main>
    `;

    const root = {
      ownerDocument: {
        ...document,
        location: new URL("https://github.com/owner/repo")
      },
      querySelectorAll: document.querySelectorAll.bind(document)
    } as ParentNode;

    const blocks = collectCandidateBlocks(root);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Claude Code Game Studios",
      "Turn a single Claude Code session into a full game development studio.",
      "Turn Claude Code into a full game dev studio."
    ]);
  });

  it("limits OpenRouter candidates to model card content", () => {
    document.body.innerHTML = `
      <main>
        <p>Models</p>
        <aside>
          <p>Input Modalities</p>
          <p>Text</p>
        </aside>
        <section>
          <article class="model-card">
            <h2>OpenAI: GPT-4o Mini TTS</h2>
            <p>GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.</p>
          </article>
          <article class="model-card">
            <h2>Google: Gemini Embedding 2 Preview</h2>
            <p>Gemini Embedding 2 Preview is Google's first multimodal embedding model.</p>
          </article>
        </section>
      </main>
    `;

    const root = {
      ownerDocument: {
        ...document,
        location: new URL("https://openrouter.ai/models")
      },
      querySelectorAll: document.querySelectorAll.bind(document)
    } as ParentNode;

    const blocks = collectCandidateBlocks(root);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "OpenAI: GPT-4o Mini TTS",
      "GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.",
      "Google: Gemini Embedding 2 Preview",
      "Gemini Embedding 2 Preview is Google's first multimodal embedding model."
    ]);
  });

  it("limits Product Hunt candidates to the main product content area", () => {
    document.body.innerHTML = `
      <main>
        <section>
          <p>Launching Today</p>
        </section>
        <article data-producthunt-main>
          <h1>Build Check (for Outsiders)</h1>
          <p>Is your app idea actually worth building?</p>
          <p>A free quiz for outsiders and vibe coders.</p>
        </article>
        <aside>
          <p>Company Info</p>
          <p>Forum</p>
        </aside>
      </main>
    `;

    const root = {
      ownerDocument: {
        ...document,
        location: new URL("https://www.producthunt.com/products/build-check")
      },
      querySelectorAll: document.querySelectorAll.bind(document)
    } as ParentNode;

    const blocks = collectCandidateBlocks(root);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Build Check (for Outsiders)",
      "Is your app idea actually worth building?",
      "A free quiz for outsiders and vibe coders."
    ]);
  });
});
