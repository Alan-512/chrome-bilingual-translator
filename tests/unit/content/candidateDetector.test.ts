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

  it("includes media captions as translatable content while still skipping footer action chrome", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <p>Primary post body that explains the prototype changes.</p>
          <blockquote>A quoted follow-up explaining why the layout improved.</blockquote>
          <figure>
            <img src="/mock-card.png" alt="Prototype card" />
            <figcaption>The attached comparison card highlights spacing fixes and hierarchy improvements.</figcaption>
          </figure>
          <footer>
            <button>Like</button>
            <button>Share</button>
          </footer>
        </article>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Primary post body that explains the prototype changes.",
      "A quoted follow-up explaining why the layout improved.",
      "The attached comparison card highlights spacing fixes and hierarchy improvements."
    ]);
  });

  it("groups specification tables into one translatable block instead of translating each cell separately", () => {
    document.body.innerHTML = `
      <main>
        <table>
          <tbody>
            <tr><th>Battery life</th><td>Up to 30 hours</td></tr>
            <tr><th>Weight</th><td>245 g</td></tr>
          </tbody>
        </table>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual(["Battery life: Up to 30 hours\n\nWeight: 245 g"]);
  });

  it("groups description lists into one translatable block with key-value pairs preserved", () => {
    document.body.innerHTML = `
      <main>
        <dl>
          <dt>Display</dt>
          <dd>6.7-inch OLED panel</dd>
          <dt>Charging</dt>
          <dd>65W wired fast charging</dd>
        </dl>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Display: 6.7-inch OLED panel\n\nCharging: 65W wired fast charging"
    ]);
  });

  it("groups aria table key-value grids into one translatable block", () => {
    document.body.innerHTML = `
      <main>
        <section role="table">
          <div role="row">
            <span role="rowheader">Material</span>
            <span role="cell">Aluminum</span>
          </div>
          <div role="row">
            <span role="rowheader">Warranty</span>
            <span role="cell">2 years</span>
          </div>
        </section>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual(["Material: Aluminum\n\nWarranty: 2 years"]);
  });

  it("collects the main post plus both layers of quote cards as independent translatable blocks", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <p>Primary feed post introducing the launch.</p>
          <div class="quote-stack">
            <blockquote id="outer-quote">
              <p>Outer quote explaining the first repost context.</p>
              <p>Outer quote closing note after the nested card.</p>
            </blockquote>
            <div class="nested-quote-slot">
              <blockquote id="inner-quote">
                <p>Inner quote that should remain a standalone translated card.</p>
              </blockquote>
            </div>
          </div>
        </article>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks[0]?.sourceText).toBe("Primary feed post introducing the launch.");
    expect(
      blocks.some(
        (block) =>
          block.element.id === "outer-quote" &&
          block.sourceText === "Outer quote explaining the first repost context. Outer quote closing note after the nested card."
      )
    ).toBe(true);
    expect(
      blocks.some(
        (block) =>
          block.element.id === "inner-quote" &&
          block.sourceText === "Inner quote that should remain a standalone translated card."
      )
    ).toBe(true);
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

  it("keeps Reddit shreddit feed titles and body previews as separate listing blocks", () => {
    window.history.replaceState({}, "", "/r/vibecoding/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a href="/r/vibecoding/comments/abc123/example-post/" data-post-click-location="title">
            <h3>A Reddit feed title that should be translated</h3>
          </a>
          <div data-post-click-location="text-body">
            <p>A feed preview paragraph that is shown on the homepage card.</p>
          </div>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);
    const feedCard = document.querySelector("shreddit-post") as HTMLElement;
    const feedTitle = feedCard.querySelector("[data-post-click-location='title']") as HTMLElement;
    const feedBody = feedCard.querySelector("[data-post-click-location='text-body']") as HTMLElement;

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.element).toBe(feedTitle);
    expect(blocks[0]?.sourceText).toBe("A Reddit feed title that should be translated");
    expect(blocks[0]?.rehydrateKey).toBe("reddit|listing|card-title|A Reddit feed title that should be translated");
    expect(blocks[0]?.renderHint?.anchorElement).toBe(feedTitle);
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(feedCard);

    expect(blocks[1]?.element).toBe(feedBody);
    expect(blocks[1]?.sourceText).toBe("A feed preview paragraph that is shown on the homepage card.");
    expect(blocks[1]?.rehydrateKey).toBe("reddit|listing|card-body|A feed preview paragraph that is shown on the homepage card.");
    expect(blocks[1]?.renderHint?.anchorElement).toBe(feedBody);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(feedCard);
  });

  it("keeps Reddit listing title separate while grouping semantic body children into one body block", () => {
    window.history.replaceState({}, "", "/r/vibecoding/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a href="/r/vibecoding/comments/abc123/example-post/" data-post-click-location="title">
            <h3>A Reddit feed title that should be translated</h3>
          </a>
          <div data-post-click-location="text-body">
            <p>First body paragraph.</p>
            <p>Second body paragraph.</p>
          </div>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);
    const feedTitle = document.querySelector("[data-post-click-location='title']") as HTMLElement;
    const feedBody = document.querySelector("[data-post-click-location='text-body']") as HTMLElement;

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.element).toBe(feedTitle);
    expect(blocks[0]?.sourceText).toBe("A Reddit feed title that should be translated");
    expect(blocks[1]?.element.getAttribute("data-post-click-location")).toBe("text-body");
    expect(blocks[1]?.sourceText).toBe("First body paragraph.\n\nSecond body paragraph.");
    expect(blocks[1]?.rehydrateKey).toBe("reddit|listing|card-body|First body paragraph.|Second body paragraph.");
    expect(blocks[1]?.renderHint?.anchorElement).toBe(feedBody);
  });

  it("handles Reddit image, link-preview, and title-only listing cards without forcing a shared body shape", () => {
    window.history.replaceState({}, "", "/r/vibecoding/");
    document.body.innerHTML = `
      <main>
        <shreddit-post id="image-post">
          <a href="/r/vibecoding/comments/def456/image-post/" data-post-click-location="title">
            <h3>RATE LIMIT RESET</h3>
          </a>
          <figure><img src="/mock-image.png" alt="Screenshot" /></figure>
        </shreddit-post>
        <shreddit-post id="link-post">
          <a href="/r/vibecoding/comments/ghi789/link-post/" data-post-click-location="title">
            <h3>OpenClaw is Linux for agents.</h3>
          </a>
          <div class="md feed-card-text-preview">
            <p>We built the Mac. Same Opus 4.7, cloud-native, managed infrastructure.</p>
          </div>
        </shreddit-post>
        <shreddit-post id="title-only-post">
          <a href="/r/vibecoding/comments/jkl012/title-only/" data-post-click-location="title">
            <h3>Need a better way to review AI-generated UI quickly</h3>
          </a>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "RATE LIMIT RESET",
      "OpenClaw is Linux for agents.",
      "We built the Mac. Same Opus 4.7, cloud-native, managed infrastructure.",
      "Need a better way to review AI-generated UI quickly"
    ]);
    expect(blocks[0]?.rehydrateKey).toBe("reddit|listing|card-title|RATE LIMIT RESET");
    expect(blocks[1]?.rehydrateKey).toBe("reddit|listing|card-title|OpenClaw is Linux for agents.");
    expect(blocks[2]?.rehydrateKey).toBe(
      "reddit|listing|card-body|We built the Mac. Same Opus 4.7, cloud-native, managed infrastructure."
    );
    expect(blocks[3]?.rehydrateKey).toBe("reddit|listing|card-title|Need a better way to review AI-generated UI quickly");
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
        <shreddit-comment thingid="t1_alpha">
          <div class="md" slot="comment">
            <p>Rate limit reset as a compensation for the bug... or a new model drop....</p>
          </div>
        </shreddit-comment>
        <shreddit-comment thingid="t1_beta">
          <div class="md" slot="comment">
            <p>Codex with the resets I am loving it regardless what it is.</p>
          </div>
        </shreddit-comment>
        <shreddit-comment thingid="t1_gamma" aria-expanded="false">
          <div hidden aria-hidden="true">
            <div class="md" slot="comment">
              <p>This collapsed comment should stay untranslated until it is expanded.</p>
            </div>
          </div>
        </shreddit-comment>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);
    const postCard = document.querySelector("shreddit-post") as HTMLElement;
    const titleAnchor = postCard.querySelector("[slot='title']") as HTMLElement;

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
      },
      {
        slot: "comment",
        text: "Rate limit reset as a compensation for the bug... or a new model drop...."
      },
      {
        slot: "comment",
        text: "Codex with the resets I am loving it regardless what it is."
      }
    ]);
    expect(blocks[0]?.renderHint?.anchorElement).toBe(titleAnchor);
    expect(blocks[0]?.rehydrateKey).toBe(
      "reddit|detail|post-title|I found out why ChatGPT gets slower the longer you use it"
    );
    expect(blocks[1]?.rehydrateKey).toBe(
      "reddit|detail|post-body|0|Been frustrated with chatgpt freezing in long chats for months."
    );
    expect(blocks[2]?.rehydrateKey).toBe(
      "reddit|detail|post-body|1|Chatgpt renders every single message in your browser at once."
    );
    expect(blocks[3]?.rehydrateKey).toBe(
      "reddit|detail|comment|t1_alpha|Rate limit reset as a compensation for the bug... or a new model drop...."
    );
    expect(blocks[4]?.rehydrateKey).toBe(
      "reddit|detail|comment|t1_beta|Codex with the resets I am loving it regardless what it is."
    );
    expect(blocks.some((block) => block.sourceText.includes("collapsed comment"))).toBe(false);
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(postCard);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(postCard);
    expect(blocks[3]?.renderHint?.anchorElement).toBe(
      document.querySelector<HTMLElement>("shreddit-comment[thingid='t1_alpha'] p")
    );
    expect(blocks[4]?.renderHint?.anchorElement).toBe(
      document.querySelector<HTMLElement>("shreddit-comment[thingid='t1_beta'] p")
    );
  });

  it("ignores wrapped Reddit detail body containers and keeps only the direct semantic body blocks", () => {
    window.history.replaceState({}, "", "/r/ChatGPT/comments/abc123/example-post/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Wrapped title</a>
          <div data-post-click-location="text-body">
            <div slot="text-body">
              <p>First wrapped paragraph.</p>
              <p>Second wrapped paragraph.</p>
            </div>
          </div>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Wrapped title",
      "First wrapped paragraph.",
      "Second wrapped paragraph."
    ]);
  });

  it("does not merge generic fallback content on Reddit detail pages", () => {
    window.history.replaceState({}, "", "/r/ChatGPT/comments/abc123/example-post/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Detail title</a>
          <div slot="text-body">
            <p>Original post paragraph.</p>
          </div>
        </shreddit-post>
        <section>
          <p>Nested reply that lives outside the main shreddit-post container.</p>
        </section>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual(["Detail title", "Original post paragraph."]);
  });

  it("does not merge generic fallback candidates that still live inside the Reddit main post container", () => {
    window.history.replaceState({}, "", "/r/ChatGPT/comments/abc123/example-post/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Detail title</a>
          <div class="outer-copy">
            <div slot="text-body">
              <p>Original post paragraph.</p>
            </div>
          </div>
        </shreddit-post>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual(["Detail title", "Original post paragraph."]);
  });

  it("ignores repeated Reddit detail fallback blocks outside the main post container", () => {
    window.history.replaceState({}, "", "/r/ChatGPT/comments/abc123/example-post/");
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Detail title</a>
          <div slot="text-body">
            <p>Original post paragraph.</p>
            <p>Second post paragraph.</p>
          </div>
        </shreddit-post>
        <section class="duplicate-summary">
          <p>Detail title</p>
          <p>Original post paragraph.</p>
          <p>Second post paragraph.</p>
        </section>
        <section>
          <p>Nested reply that lives outside the main shreddit-post container.</p>
        </section>
      </main>
    `;

    const blocks = collectCandidateBlocks(document);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Detail title",
      "Original post paragraph.",
      "Second post paragraph."
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

  it("limits OpenRouter candidates to the virtualized model list item structure", () => {
    document.body.innerHTML = `
      <main>
        <aside>
          <p>Input Modalities</p>
          <p>Text</p>
        </aside>
        <ul>
          <li style="height: 180px; transform: translateY(0px);">
            <div>
              <div data-testid="model-list-item">
                <div>
                  <a href="/openai">OpenAI</a>
                  <a href="/openai/gpt-4o-mini-tts-2025-12-15">
                    <span class="hidden md:block">OpenAI: GPT-4o Mini TTS</span>
                    <span class="md:hidden">GPT-4o Mini TTS</span>
                  </a>
                  <span>516K tokens</span>
                </div>
                <a href="/openai/gpt-4o-mini-tts-2025-12-15">
                  GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model.
                </a>
              </div>
            </div>
          </li>
        </ul>
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
    const modelListItem = document.querySelector("[data-testid='model-list-item']") as HTMLElement;
    const virtualRow = modelListItem.closest("li") as HTMLElement;

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "OpenAI: GPT-4o Mini TTS",
      "GPT-4o Mini TTS is OpenAI's cost-efficient text-to-speech model."
    ]);
    expect(blocks[0]?.renderHint?.anchorElement).toBe(modelListItem);
    expect(blocks[1]?.renderHint?.anchorElement).toBe(modelListItem);
    expect(blocks[0]?.renderHint?.expansionRoot).toBe(virtualRow);
    expect(blocks[1]?.renderHint?.expansionRoot).toBe(virtualRow);
  });

  it("does not fall back to generic detection when an OpenRouter models page uses unknown card markup", () => {
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

    expect(blocks).toEqual([]);
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
          <div class="yuRUbf">
            <a href="/result">
              <h3>SteamDB - Chrome Web Store</h3>
            </a>
          </div>
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
    const firstTitleWrapper = firstResult.querySelector(".yuRUbf") as HTMLElement;

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
    expect(blocks[0]?.renderHint?.anchorElement).toBe(firstTitleWrapper);
    expect(blocks[1]?.renderHint?.anchorElement).toBeUndefined();
  });

  it("extracts Google video, knowledge panel, and people-also-ask result text", () => {
    document.body.innerHTML = `
      <main>
        <div class="MjjYud">
          <div class="P94G9b">
            <a href="/video">
              <h3>Google Antigravity Tutorial for Beginners</h3>
            </a>
            <div class="VwiC3b">A beginner video walkthrough for building your first app.</div>
          </div>
        </div>
        <div class="related-question-pair">
          <div role="heading">What is Google Antigravity?</div>
        </div>
        <div class="kp-wholepage">
          <div data-attrid="title">Google Antigravity</div>
          <div class="kno-rdesc">
            <span>Google Antigravity is an agentic development platform.</span>
          </div>
        </div>
      </main>
    `;

    const root = {
      ownerDocument: {
        ...document,
        location: new URL("https://www.google.com/search?q=antigravity")
      },
      querySelectorAll: document.querySelectorAll.bind(document)
    } as ParentNode;

    const blocks = collectCandidateBlocks(root);

    expect(blocks.map((block) => block.sourceText)).toEqual([
      "Google Antigravity Tutorial for Beginners",
      "A beginner video walkthrough for building your first app.",
      "What is Google Antigravity?",
      "Google Antigravity",
      "Google Antigravity is an agentic development platform."
    ]);
    expect(blocks.map((block) => block.rehydrateKey)).toEqual([
      "google-search|listing|title|0|Google Antigravity Tutorial for Beginners",
      "google-search|listing|snippet|0|A beginner video walkthrough for building your first app.",
      "google-search|listing|question|0|What is Google Antigravity?",
      "google-search|listing|knowledge-title|0|Google Antigravity",
      "google-search|listing|knowledge-description|0|Google Antigravity is an agentic development platform."
    ]);
  });
});
