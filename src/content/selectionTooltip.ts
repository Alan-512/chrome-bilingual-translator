export interface SelectionContext {
  selectionText: string;
  contextText: string;
  rect: DOMRect;
}

function findSelectionRecursively(node: Node): { sel: Selection; range: Range; rect: DOMRect } | null {
  if (node instanceof Element) {
    if (node.shadowRoot) {
      const shadowSel = (node.shadowRoot as any).getSelection?.();
      if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim()) {
        const range = shadowSel.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          let parentEl: Element | null = null;
          if (range.startContainer instanceof Element) {
            parentEl = range.startContainer;
          } else if (range.startContainer.parentNode instanceof Element) {
            parentEl = range.startContainer.parentNode;
          }
          if (parentEl) {
            rect = parentEl.getBoundingClientRect();
          }
        }
        if (rect) {
          return { sel: shadowSel, range, rect };
        }
      }
      const res = findSelectionRecursively(node.shadowRoot);
      if (res) return res;
    }
    
    // Check standard children
    for (let i = 0; i < node.childNodes.length; i++) {
      const res = findSelectionRecursively(node.childNodes[i]);
      if (res) return res;
    }
  } else if (node instanceof ShadowRoot) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const res = findSelectionRecursively(node.childNodes[i]);
      if (res) return res;
    }
  }
  return null;
}

function findDeepSelection(): { sel: Selection; range: Range; rect: DOMRect } | null {
  // 1. Try to find selection via standard window.getSelection and trace into shadow DOMs
  let sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
    let currentSel = sel;
    // Walk down into nested shadow DOMs
    while (true) {
      let nestedHost: Element | null = null;
      const nodes = [currentSel.anchorNode, currentSel.focusNode];
      for (const node of nodes) {
        if (!node) continue;
        if (node instanceof Element && node.shadowRoot) {
          nestedHost = node;
          break;
        }
        if (node.parentNode && node.parentNode instanceof Element && node.parentNode.shadowRoot) {
          nestedHost = node.parentNode;
          break;
        }
      }

      if (!nestedHost && currentSel.rangeCount > 0) {
        const range = currentSel.getRangeAt(0);
        if (range.startContainer instanceof Element && range.startContainer.shadowRoot) {
          nestedHost = range.startContainer;
        } else if (range.endContainer instanceof Element && range.endContainer.shadowRoot) {
          nestedHost = range.endContainer;
        }
      }

      if (nestedHost && nestedHost.shadowRoot) {
        const shadowSel = (nestedHost.shadowRoot as any).getSelection?.();
        if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim()) {
          currentSel = shadowSel;
          continue;
        }
      }
      break;
    }

    if (currentSel && currentSel.rangeCount > 0 && currentSel.toString().trim()) {
      const range = currentSel.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        let parentEl: Element | null = null;
        if (range.startContainer instanceof Element) {
          parentEl = range.startContainer;
        } else if (range.startContainer.parentNode instanceof Element) {
          parentEl = range.startContainer.parentNode;
        }
        if (parentEl) {
          rect = parentEl.getBoundingClientRect();
        }
      }
      if (rect) {
        return { sel: currentSel, range, rect };
      }
    }
  }

  // 2. Fallback to recursive DOM traversal starting from document.body
  if (document.body) {
    const result = findSelectionRecursively(document.body);
    if (result) {
      return result;
    }
  }

  return null;
}

export function getSelectionAndContext(): SelectionContext | null {
  // 1. Traverse active elements recursively to find nested inputs or shadow roots
  let activeEl: Element | null = document.activeElement;
  while (activeEl && activeEl.shadowRoot && activeEl.shadowRoot.activeElement) {
    activeEl = activeEl.shadowRoot.activeElement;
  }

  let selectionText = "";
  let contextText = "";
  let rect: DOMRect | null = null;

  // 2. Check if the active element is an input or textarea
  if (
    activeEl &&
    (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)
  ) {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    if (start !== null && end !== null && start !== end) {
      selectionText = activeEl.value.substring(start, end);
      contextText = activeEl.value; // surround context is the full text inside form field
      rect = activeEl.getBoundingClientRect();
    }
  }

  // 3. Fallback to recursive shadow-piercing selection
  if (!selectionText) {
    const deepSelInfo = findDeepSelection();
    if (deepSelInfo) {
      const { sel, range, rect: gotRect } = deepSelInfo;
      selectionText = sel.toString();
      rect = gotRect;

      // Find nearest block ancestor for context
      let node: Node | null = range.startContainer;
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node = node.parentNode;
      }
      if (node && node instanceof Element) {
        const blockEl =
          node.closest("p, div, article, section, li, h1, h2, h3, h4, h5, h6, td, blockquote") || node;
        contextText = blockEl.textContent || "";
      }
    }
  }

  if (!selectionText.trim() || !rect) {
    return null;
  }

  const finalSelectionText = selectionText.trim();
  let finalContextText = contextText.trim() || finalSelectionText;

  const maxContextChars = 1000;
  if (finalContextText.length > maxContextChars) {
    const selIndex = finalContextText.indexOf(finalSelectionText);
    if (selIndex !== -1) {
      const start = Math.max(0, selIndex - Math.floor((maxContextChars - finalSelectionText.length) / 2));
      const end = Math.min(finalContextText.length, start + maxContextChars);
      finalContextText = finalContextText.substring(start, end);
    } else {
      finalContextText = finalContextText.substring(0, maxContextChars);
    }
  }

  return {
    selectionText: finalSelectionText,
    contextText: finalContextText,
    rect
  };
}

class SelectionTooltipManager {
  private static instance: SelectionTooltipManager | null = null;
  private container: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private card: HTMLDivElement | null = null;
  private activeAbsRect: { left: number; top: number; width: number; height: number } | null = null;

  private constructor() {
    this.setupDismissListeners();
  }

  public static getInstance(): SelectionTooltipManager {
    if (!SelectionTooltipManager.instance) {
      SelectionTooltipManager.instance = new SelectionTooltipManager();
    }
    return SelectionTooltipManager.instance;
  }

  public showLoading(rect: DOMRect, action: "translate" | "explain", sourceText: string) {
    this.activeAbsRect = {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height
    };

    this.ensureContainer();

    if (!this.card) return;

    const actionLabel = action === "translate" ? "AI 翻译中" : "AI 解释中";

    this.card.innerHTML = `
      <div class="tooltip-header">
        <div class="tooltip-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 2s linear infinite;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a10 10 0 0 1 10 10"></path>
          </svg>
          ${actionLabel}
        </div>
        <button class="tooltip-close" id="btn-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="source-text">${this.escapeHtml(sourceText)}</div>
      <div class="tooltip-loading">
        <div class="spinner"></div>
        <span>正在分析内容...</span>
      </div>
    `;

    this.shadowRoot?.querySelector("#btn-close")?.addEventListener("click", () => this.destroy());

    this.positionCard(this.activeAbsRect);
    this.card.style.opacity = "1";
    this.card.style.transform = "translateY(0)";
  }

  public renderResult(action: "translate" | "explain", sourceText: string, text: string) {
    if (!this.card) return;

    const actionLabel = action === "translate" ? "AI 翻译" : "AI 解释";
    const renderedBody = this.parseMarkdown(text);

    this.card.innerHTML = `
      <div class="tooltip-header">
        <div class="tooltip-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #a6e3a1;">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          ${actionLabel}
        </div>
        <button class="tooltip-close" id="btn-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="source-text">${this.escapeHtml(sourceText)}</div>
      <div class="tooltip-body">${renderedBody}</div>
    `;

    this.shadowRoot?.querySelector("#btn-close")?.addEventListener("click", () => this.destroy());
    if (this.activeAbsRect) {
      this.positionCard(this.activeAbsRect);
    }
  }

  public renderError(action: "translate" | "explain", sourceText: string, error: string) {
    if (!this.card) return;

    const actionLabel = action === "translate" ? "AI 翻译" : "AI 解释";

    this.card.innerHTML = `
      <div class="tooltip-header">
        <div class="tooltip-title" style="color: #f38ba8;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          ${actionLabel} 失败
        </div>
        <button class="tooltip-close" id="btn-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="source-text">${this.escapeHtml(sourceText)}</div>
      <div class="tooltip-body error-msg">${this.escapeHtml(error)}</div>
    `;

    this.shadowRoot?.querySelector("#btn-close")?.addEventListener("click", () => this.destroy());
    if (this.activeAbsRect) {
      this.positionCard(this.activeAbsRect);
    }
  }

  public destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.shadowRoot = null;
      this.card = null;
      this.activeAbsRect = null;
    }
  }

  private ensureContainer() {
    if (this.container) return;

    this.container = document.createElement("div");
    this.container.id = "bilingual-selection-tooltip-root";
    this.container.setAttribute("data-bilingual-translator-owned", "true");
    this.container.style.position = "absolute";
    this.container.style.zIndex = "2147483647";

    this.shadowRoot = this.container.attachShadow({ mode: "closed" });

    // CSS styling inside Shadow Root
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }
      .tooltip-card {
        box-sizing: border-box;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #cdd6f4;
        background: rgba(30, 30, 46, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 16px;
        width: 340px;
        max-height: 400px;
        overflow-y: auto;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
        position: absolute;
        left: 0;
        top: 0;
        z-index: 2147483647;
        font-size: 14px;
        line-height: 1.5;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: auto;
      }
      .tooltip-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .tooltip-title {
        font-weight: 600;
        color: #a6e3a1;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tooltip-close {
        background: none;
        border: none;
        color: #a6adc8;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background-color 0.15s;
      }
      .tooltip-close:hover {
        color: #f38ba8;
        background-color: rgba(255, 255, 255, 0.08);
      }
      .tooltip-body {
        word-break: break-word;
      }
      .tooltip-body h1, .tooltip-body h2, .tooltip-body h3 {
        margin-top: 12px;
        margin-bottom: 8px;
        color: #a6e3a1;
        font-weight: 600;
      }
      .tooltip-body h1 { font-size: 1.3em; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 4px; }
      .tooltip-body h2 { font-size: 1.2em; }
      .tooltip-body h3 { font-size: 1.1em; }
      .tooltip-body p {
        margin: 0 0 8px 0;
      }
      .tooltip-body p:last-child {
        margin-bottom: 0;
      }
      .tooltip-body ul, .tooltip-body ol {
        margin: 0 0 8px 0;
        padding-left: 20px;
      }
      .tooltip-body li {
        margin-bottom: 4px;
      }
      .tooltip-body li:last-child {
        margin-bottom: 0;
      }
      .tooltip-body strong {
        color: #f9e2af;
        font-weight: 600;
      }
      .tooltip-body em {
        color: #b4befe;
        font-style: italic;
      }
      .tooltip-body code {
        font-family: Consolas, "Andale Mono", monospace;
        background-color: rgba(255, 255, 255, 0.1);
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 0.9em;
        color: #f5c2e7;
      }
      .tooltip-body blockquote {
        margin: 8px 0;
        padding-left: 12px;
        border-left: 4px solid #89b4fa;
        color: #a6adc8;
        font-style: italic;
      }
      .tooltip-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px 0;
        gap: 12px;
        color: #bac2de;
      }
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-top-color: #a6e3a1;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .error-msg {
        color: #f38ba8;
      }
      .source-text {
        font-style: italic;
        color: #bac2de;
        border-left: 3px dashed #fab387;
        padding-left: 8px;
        margin-bottom: 12px;
        font-size: 13px;
        max-height: 80px;
        overflow-y: auto;
      }
    `;
    this.shadowRoot.appendChild(style);

    this.card = document.createElement("div");
    this.card.className = "tooltip-card";
    this.shadowRoot.appendChild(this.card);

    document.body.appendChild(this.container);
  }

  private positionCard(absRect: { left: number; top: number; width: number; height: number }) {
    if (!this.container || !this.card) return;

    const cardWidth = 340;
    const cardHeight = this.card.offsetHeight || 180;
    const padding = 12;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Convert absolute selection rect to current viewport-relative rect to handle boundary checks
    const viewportLeft = absRect.left - scrollX;
    const viewportTop = absRect.top - scrollY;

    // Horizontal positioning: align to selection center, clamp within viewport
    let left = viewportLeft + absRect.width / 2 - cardWidth / 2;
    if (left < padding) {
      left = padding;
    } else if (left + cardWidth > viewportWidth - padding) {
      left = viewportWidth - cardWidth - padding;
    }

    // Convert back to document-relative coordinate
    const absoluteLeft = left + scrollX;

    // Vertical positioning: try placing ABOVE the selection. If no space, place BELOW the selection.
    let top = viewportTop - cardHeight - padding;
    if (top < padding) {
      // Not enough space above, place below
      top = viewportTop + absRect.height + padding;
    }

    // Clamp vertical position relative to viewport
    if (top + cardHeight > viewportHeight - padding) {
      top = viewportHeight - cardHeight - padding;
    }
    if (top < padding) {
      top = padding;
    }

    // Convert back to document-relative coordinate
    const absoluteTop = top + scrollY;

    this.container.style.left = `${absoluteLeft}px`;
    this.container.style.top = `${absoluteTop}px`;
  }

  private setupDismissListeners() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.destroy();
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (!this.container) return;
      const target = e.target as HTMLElement;
      if (!target) return;

      // 1. Do not dismiss if click is inside the container
      if (this.container.contains(target)) {
        return;
      }

      // 2. Check if click is on the main document scrollbars
      if (
        e.clientX >= document.documentElement.clientWidth ||
        e.clientY >= document.documentElement.clientHeight
      ) {
        return;
      }

      // 3. Check if click is on a scrollable container's scrollbar
      const rect = target.getBoundingClientRect();
      const isVerticalScrollbar =
        target.scrollHeight > target.clientHeight &&
        e.clientX >= rect.left + target.clientWidth &&
        e.clientX <= rect.right;
      const isHorizontalScrollbar =
        target.scrollWidth > target.clientWidth &&
        e.clientY >= rect.top + target.clientHeight &&
        e.clientY <= rect.bottom;

      if (isVerticalScrollbar || isHorizontalScrollbar) {
        return;
      }

      // Otherwise, dismiss
      this.destroy();
    });
  }

  private parseMarkdown(text: string): string {
    let html = this.escapeHtml(text).replace(/\r\n/g, "\n");

    // Parse bold: **text** -> <strong>text</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Parse italic: *text* -> <em>text</em>
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
    html = html.replace(/_(.*?)_/g, "<em>$1</em>");

    // Parse inline code: `code` -> <code>code</code>
    html = html.replace(/`(.*?)`/g, "<code>$1</code>");

    // Parse blockquotes: &gt; text -> <blockquote>text</blockquote>
    html = html.replace(/^\s*&gt;\s+(.+)$/gm, "<blockquote>$1</blockquote>");

    // Parse headers: ### header -> <h3>header</h3>
    html = html.replace(/^\s*###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^\s*##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^\s*#\s+(.+)$/gm, "<h1>$1</h1>");

    // Split by newline and parse line by line to handle lists properly
    const lines = html.split("\n");
    const processedLines: string[] = [];
    let inUl = false;
    let inOl = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (inUl) {
          processedLines.push("</ul>");
          inUl = false;
        }
        if (inOl) {
          processedLines.push("</ol>");
          inOl = false;
        }
        continue;
      }

      // Check if it's a header or blockquote already wrapped in tags
      if (/^<(h1|h2|h3|blockquote)/i.test(line)) {
        if (inUl) { processedLines.push("</ul>"); inUl = false; }
        if (inOl) { processedLines.push("</ol>"); inOl = false; }
        processedLines.push(line);
        continue;
      }

      // Unordered list item: starts with - or * followed by space
      const ulMatch = line.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (inOl) { processedLines.push("</ol>"); inOl = false; }
        if (!inUl) {
          processedLines.push("<ul>");
          inUl = true;
        }
        processedLines.push(`<li>${ulMatch[1]}</li>`);
        continue;
      }

      // Ordered list item: starts with digits followed by . and space
      const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (olMatch) {
        if (inUl) { processedLines.push("</ul>"); inUl = false; }
        if (!inOl) {
          processedLines.push("<ol>");
          inOl = true;
        }
        processedLines.push(`<li>${olMatch[2]}</li>`);
        continue;
      }

      // Regular line
      if (inUl) { processedLines.push("</ul>"); inUl = false; }
      if (inOl) { processedLines.push("</ol>"); inOl = false; }
      
      processedLines.push(`<p>${line}</p>`);
    }

    if (inUl) processedLines.push("</ul>");
    if (inOl) processedLines.push("</ol>");

    let finalHtml = processedLines.join("\n");
    // Clean up empty paragraphs
    finalHtml = finalHtml.replace(/<p><\/p>/g, "");
    return finalHtml;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

export { SelectionTooltipManager };
