// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { getSelectionAndContext } from "../../../src/content/selectionTooltip";

describe("getSelectionAndContext", () => {
  it("extracts and truncates selection context from input elements when context is long", () => {
    // 1. Create a textarea element
    const textarea = document.createElement("textarea");
    
    // Create a very long text: 600 'a's, then 'selected-text', then 600 'b's.
    // Total length: 1200 + 13 = 1213 characters.
    const prefix = "a".repeat(600);
    const selected = "selected-text";
    const suffix = "b".repeat(600);
    
    textarea.value = prefix + selected + suffix;
    textarea.selectionStart = 600;
    textarea.selectionEnd = 613;
    
    // Mock getBoundingClientRect
    textarea.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 10,
      top: 10,
      width: 100,
      height: 50,
      right: 110,
      bottom: 60
    } as DOMRect);

    document.body.appendChild(textarea);
    textarea.focus();

    try {
      const result = getSelectionAndContext();
      
      expect(result).not.toBeNull();
      expect(result?.selectionText).toBe("selected-text");
      
      // Since maxContextChars is 1000, and 'selected-text' length is 13,
      // the centered window will take (1000 - 13) / 2 = 493 characters of prefix and suffix.
      expect(result?.contextText.length).toBe(1000);
      expect(result?.contextText).toContain("selected-text");
      
      // Check that it starts with a subset of 'a's and ends with a subset of 'b's
      expect(result?.contextText.startsWith("a")).toBe(true);
      expect(result?.contextText.endsWith("b")).toBe(true);
    } finally {
      document.body.removeChild(textarea);
    }
  });

  it("handles short context without truncation", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "short text with selected word";
    textarea.selectionStart = 16;
    textarea.selectionEnd = 24;
    
    textarea.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 10,
      top: 10,
      width: 100,
      height: 50,
      right: 110,
      bottom: 60
    } as DOMRect);

    document.body.appendChild(textarea);
    textarea.focus();

    try {
      const result = getSelectionAndContext();
      expect(result).not.toBeNull();
      expect(result?.selectionText).toBe("selected");
      expect(result?.contextText).toBe("short text with selected word");
    } finally {
      document.body.removeChild(textarea);
    }
  });
});
