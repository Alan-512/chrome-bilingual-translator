// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { classifyPage } from "../../../src/content/pageClassifier";

function createLocationDocument(url: string): Document {
  return {
    location: new URL(url)
  } as Document;
}

describe("classifyPage", () => {
  it("classifies Reddit listing pages", () => {
    expect(classifyPage(createLocationDocument("https://www.reddit.com/r/vibecoding/"))).toEqual({
      site: "reddit",
      surface: "listing"
    });
  });

  it("classifies Reddit comments detail pages", () => {
    expect(classifyPage(createLocationDocument("https://www.reddit.com/r/ChatGPT/comments/abc123/example-post/"))).toEqual({
      site: "reddit",
      surface: "detail"
    });
  });

  it("falls back to generic pages for non-Reddit sites", () => {
    expect(classifyPage(createLocationDocument("https://example.com/docs"))).toEqual({
      site: "generic",
      surface: "generic"
    });
  });

  it("classifies GitHub repository home pages", () => {
    expect(classifyPage(createLocationDocument("https://github.com/owner/repo"))).toEqual({
      site: "github",
      surface: "repo-home"
    });
  });

  it("classifies GitHub repository subpages", () => {
    expect(classifyPage(createLocationDocument("https://github.com/owner/repo/tree/main/src"))).toEqual({
      site: "github",
      surface: "repo-subpage"
    });
  });

  it("classifies OpenRouter model listing pages", () => {
    expect(classifyPage(createLocationDocument("https://openrouter.ai/models"))).toEqual({
      site: "openrouter",
      surface: "listing"
    });
  });

  it("classifies Product Hunt product detail pages", () => {
    expect(classifyPage(createLocationDocument("https://www.producthunt.com/products/build-check"))).toEqual({
      site: "producthunt",
      surface: "detail"
    });
  });

  it("classifies GitHub-like pages from README/about DOM signatures even on localhost", () => {
    window.history.replaceState({}, "", "/github-repo");
    document.body.innerHTML = `
      <main>
        <section id="readme">
          <article class="markdown-body">
            <h1>Claude Code Game Studios</h1>
          </article>
        </section>
      </main>
    `;

    expect(classifyPage(document)).toEqual({
      site: "github",
      surface: "repo-home"
    });
  });

  it("classifies OpenRouter-like pages from model card DOM signatures even on localhost", () => {
    window.history.replaceState({}, "", "/openrouter-models");
    document.body.innerHTML = `
      <main>
        <article class="model-card">
          <h2>OpenAI: GPT-4o Mini TTS</h2>
        </article>
      </main>
    `;

    expect(classifyPage(document)).toEqual({
      site: "openrouter",
      surface: "listing"
    });
  });

  it("classifies Product Hunt-like pages from main content DOM signatures even on localhost", () => {
    window.history.replaceState({}, "", "/producthunt-detail");
    document.body.innerHTML = `
      <main>
        <article data-producthunt-main>
          <h1>Build Check (for Outsiders)</h1>
        </article>
      </main>
    `;

    expect(classifyPage(document)).toEqual({
      site: "producthunt",
      surface: "detail"
    });
  });
});
