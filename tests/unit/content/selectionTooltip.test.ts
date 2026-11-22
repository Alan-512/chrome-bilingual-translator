// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { getSelectionAndContext, SelectionTooltipManager } from "../../../src/content/selectionTooltip";

describe("getSelectionAndContext", () => {
  it("includes only rendered images within the selected text range for explanation", () => {
    const passage = document.createElement("p");
    passage.innerHTML = "A blue line <img id='in-range'> represents the metric. <img id='outside'>";
    document.body.appendChild(passage);
    const [selectedImage, outsideImage] = passage.querySelectorAll("img");
    const rect = new DOMRect(10, 10, 100, 40);
    selectedImage!.getBoundingClientRect = () => rect;
    outsideImage!.getBoundingClientRect = () => rect;

    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(passage.firstChild!, 0);
    range.setEndAfter(selectedImage!.nextSibling!);
    Object.defineProperty(range, "getBoundingClientRect", { value: () => rect });
    selection.addRange(range);

    try {
      expect(getSelectionAndContext(true)).toMatchObject({
        selectionText: "A blue line  represents the metric.",
        images: [selectedImage]
      });
      expect(getSelectionAndContext()?.images).toEqual([]);
    } finally {
      selection.removeAllRanges();
      passage.remove();
    }
  });

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

describe("SelectionTooltipManager", () => {
  it("keeps the active drag handle and its position when the explanation arrives", () => {
    const tooltip = SelectionTooltipManager.getInstance();
    const attachShadow = vi.spyOn(HTMLElement.prototype, "attachShadow");

    try {
      tooltip.showLoading(new DOMRect(210, 220, 60, 20), "explain", "图片");
      const root = attachShadow.mock.results[0]!.value as ShadowRoot;
      const host = root.host as HTMLElement;
      const handle = root.querySelector<HTMLElement>(".tooltip-title")!;
      const startLeft = Number.parseFloat(host.style.left);
      const startTop = Number.parseFloat(host.style.top);
      host.getBoundingClientRect = () => new DOMRect(startLeft, startTop);
      handle.setPointerCapture = vi.fn();

      const pointer = (type: string, dx: number, dy: number) => {
        handle.dispatchEvent(Object.assign(new MouseEvent(type, {
          clientX: startLeft + 10 + dx,
          clientY: startTop + 10 + dy
        }), { pointerId: 1, isPrimary: true }));
      };

      pointer("pointerdown", 0, 0);
      pointer("pointermove", 80, 40);
      tooltip.renderResult("explain", "图片", "图表说明");

      expect(root.querySelector(".tooltip-title")).toBe(handle);
      expect(host.style.position).toBe("fixed");
      expect(host.style.left).toBe(`${startLeft + 80}px`);
      expect(host.style.top).toBe(`${startTop + 40}px`);
      pointer("pointermove", 100, 50);
      expect(host.style.left).toBe(`${startLeft + 100}px`);
      expect(host.style.top).toBe(`${startTop + 50}px`);
    } finally {
      tooltip.destroy();
      attachShadow.mockRestore();
    }
  });
});
