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
    const feedCard = document.querySelector("shreddit-post") as HTMLElement;
    const feedBody = feedCard.querySelector("[slot='text-body']") as HTMLElement;

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.element.getAttribute("slot")).toBe("text-body");
    expect(blocks[0]?.sourceText).toBe(
      "A Reddit feed title that should be translated\n\nA feed preview paragraph that is shown on the homepage card."
    );
    expect(blocks[0]?.rehydrateKey).toBe(
      "reddit|listing|card|A Reddit feed title that should be translated|A feed preview paragraph that is shown on the homepage card."
    );
    expect(blocks[0]?.renderHint?.anchorElement).toBe(feedBody);
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(feedCard);
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
    const postCard = document.querySelector("shreddit-post") as HTMLElement;
    const firstParagraph = postCard.querySelector("p") as HTMLParagraphElement;

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
    expect(blocks[0]?.renderHint?.anchorElement).toBe(firstParagraph);
    expect(blocks[0]?.rehydrateKey).toBe(
      "reddit|detail|post-title|I found out why ChatGPT gets slower the longer you use it"
    );
    expect(blocks[1]?.rehydrateKey).toBe(
      "reddit|detail|post-body|0|Been frustrated with chatgpt freezing in long chats for months."
    );
    expect(blocks[2]?.rehydrateKey).toBe(
      "reddit|detail|post-body|1|Chatgpt renders every single message in your browser at once."
    );
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(postCard);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(postCard);
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
    const readme = document.querySelector("#readme") as HTMLElement;
    const firstReadmeParagraph = readme.querySelector("p") as HTMLParagraphElement;
    const about = document.querySelector("[itemprop='about']") as HTMLElement;

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Claude Code Game Studios",
      "Turn a single Claude Code session into a full game development studio.",
      "Turn Claude Code into a full game dev studio."
    ]);
    expect(blocks[0]?.rehydrateKey).toBe("github|repo-home|readme|title|0|Claude Code Game Studios");
    expect(blocks[1]?.rehydrateKey).toBe(
      "github|repo-home|readme|body|0|Turn a single Claude Code session into a full game development studio."
    );
    expect(blocks[2]?.rehydrateKey).toBe("github|repo-home|about|body|0|Turn Claude Code into a full game dev studio.");
    expect(blocks[0]?.renderHint?.anchorElement).toBe(firstReadmeParagraph);
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(readme);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(readme);
    expect(blocks[2]?.renderHint?.expansionRoot).toBe(about);
  });

  it("falls back to generic detection when a GitHub page has no adapter-specific candidates", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h2>Fincept-Corporation / FinceptTerminal</h2>
          <p>FinceptTerminal is a modern finance application offering advanced market analytics.</p>
        </article>
      </main>
    `;
    const root = {
      ownerDocument: {
        ...document,
        location: new URL("https://github.com/trending")
      },
      querySelectorAll: document.querySelectorAll.bind(document)
    } as ParentNode;

    const blocks = collectCandidateBlocks(root);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Fincept-Corporation / FinceptTerminal",
      "FinceptTerminal is a modern finance application offering advanced market analytics."
    ]);
    expect(blocks.every((block) => block.renderHint == null)).toBe(true);
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
    const firstModelCard = document.querySelector(".model-card") as HTMLElement;
    const firstModelSummary = firstModelCard.querySelector("p") as HTMLParagraphElement;

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "OpenAI: GPT-4o Mini TTS",
      "GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.",
      "Google: Gemini Embedding 2 Preview",
      "Gemini Embedding 2 Preview is Google's first multimodal embedding model."
    ]);
    expect(blocks[0]?.rehydrateKey).toBe("openrouter|listing|OpenAI: GPT-4o Mini TTS");
    expect(blocks[1]?.rehydrateKey).toBe("openrouter|listing|GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.");
    expect(blocks[0]?.renderHint?.anchorElement).toBe(firstModelSummary);
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(firstModelCard);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(firstModelCard);
  });

  it("falls back to generic detection when an OpenRouter models page uses unknown card markup", () => {
    document.body.innerHTML = `
      <main>
        <aside>
          <p>Input Modalities</p>
        </aside>
        <section>
          <article>
            <h2>OpenAI: GPT-4o Mini TTS</h2>
            <p>GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.</p>
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
      "GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model."
    ]);
    expect(blocks.every((block) => block.renderHint == null)).toBe(true);
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
    const productMain = document.querySelector("[data-producthunt-main]") as HTMLElement;
    const firstSummaryParagraph = productMain.querySelector("p") as HTMLParagraphElement;

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Build Check (for Outsiders)",
      "Is your app idea actually worth building?",
      "A free quiz for outsiders and vibe coders."
    ]);
    expect(blocks[0]?.rehydrateKey).toBe("producthunt|detail|main|Build Check (for Outsiders)");
    expect(blocks[1]?.rehydrateKey).toBe("producthunt|detail|main|Is your app idea actually worth building?");
    expect(blocks[0]?.renderHint?.anchorElement).toBe(firstSummaryParagraph);
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(productMain);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(productMain);
  });

  it("limits Google search result candidates to titles and snippets", () => {
    document.body.innerHTML = `
      <main>
        <div class="MjjYud">
          <div class="VuuXrf">Chrome Web Store</div>
          <p>steamdb - chrome web store</p>
          <h3>SteamDB - Chrome Web Store</h3>
          <div class="VwiC3b">Adds SteamDB links and new features on the Steam store and community.</div>
        </div>
        <div class="MjjYud">
          <div class="VuuXrf">steamdb.com</div>
          <p>steam dashboard - steam news tools analytics</p>
          <h3>Steam DashBoard — News, Tools & Analytics for Steam</h3>
          <div class="yXK7lf">
            <span class="MUxGbd">Steam DashBoard is a comprehensive platform for everything Steam-related.</span>
          </div>
        </div>
      </main>
    `;

    const root = {
      ownerDocument: {
        ...document,
        location: new URL("https://www.google.com/search?q=steamdb")
      },
      querySelectorAll: document.querySelectorAll.bind(document)
    } as ParentNode;

    const blocks = collectCandidateBlocks(root);
    const firstResult = document.querySelector(".MjjYud") as HTMLElement;
    const firstSnippet = firstResult.querySelector(".VwiC3b") as HTMLElement;

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "SteamDB - Chrome Web Store",
      "Adds SteamDB links and new features on the Steam store and community.",
      "Steam DashBoard — News, Tools & Analytics for Steam",
      "Steam DashBoard is a comprehensive platform for everything Steam-related."
    ]);
    expect(blocks[0]?.rehydrateKey).toBe("google-search|listing|title|0|SteamDB - Chrome Web Store");
    expect(blocks[1]?.rehydrateKey).toBe(
      "google-search|listing|snippet|0|Adds SteamDB links and new features on the Steam store and community."
    );
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(firstResult);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(firstResult);
    expect(blocks[0]?.renderHint?.anchorElement).toBeUndefined();
    expect(blocks[1]?.renderHint?.anchorElement).toBeUndefined();
  });
});
