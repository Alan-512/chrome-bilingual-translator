// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { classifyPage } from "../../../src/content/pageClassifier";

describe("classifyPage", () => {
  it("classifies Reddit listing pages", () => {
    window.history.replaceState({}, "", "/r/vibecoding/");

    expect(classifyPage(document)).toEqual({
      site: "reddit",
      surface: "listing"
    });
  });

  it("classifies Reddit comments detail pages", () => {
    window.history.replaceState({}, "", "/r/ChatGPT/comments/abc123/example-post/");

    expect(classifyPage(document)).toEqual({
      site: "reddit",
      surface: "detail"
    });
  });

  it("falls back to generic pages for non-Reddit sites", () => {
    window.history.replaceState({}, "", "/models");

    expect(classifyPage(document)).toEqual({
      site: "generic",
      surface: "generic"
    });
  });
});
