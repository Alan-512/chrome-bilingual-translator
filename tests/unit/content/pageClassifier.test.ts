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
    expect(classifyPage(createLocationDocument("https://openrouter.ai/models"))).toEqual({
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
});
