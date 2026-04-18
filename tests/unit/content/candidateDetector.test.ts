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
});
