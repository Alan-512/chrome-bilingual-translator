// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { ensureStatusPill, updateStatusPill } from "../../../src/content/statusPill";

describe("status pill", () => {
  it("creates the pill once and updates translated counts", () => {
    const pill = ensureStatusPill(document);
    updateStatusPill(pill, {
      state: "translated",
      translatedBlockCount: 12
    });

    expect(document.querySelectorAll("[data-bilingual-translator-pill='true']")).toHaveLength(1);
    expect(pill.textContent).toContain("12");
  });

  it("shows a failed summary when errors happen", () => {
    const pill = ensureStatusPill(document);
    updateStatusPill(pill, {
      state: "error",
      translatedBlockCount: 3,
      failedBlockCount: 2,
      errorMessage: "Missing required configuration: API key"
    });

    expect(pill.dataset.state).toBe("error");
    expect(pill.textContent).toContain("2");
    expect(pill.textContent).toContain("Missing required configuration: API key");
  });
});
