type RenderTranslationInput = {
  blockId: string;
  translationText: string;
  sourceText?: string;
  tightLayout?: boolean;
  anchorElement?: HTMLElement;
  expansionRoot?: HTMLElement;
};

type RenderTranslationLoadingInput = {
  blockId: string;
  tightLayout?: boolean;
  anchorElement?: HTMLElement;
  expansionRoot?: HTMLElement;
};

const OWNED_ATTRIBUTE = "data-bilingual-translator-owned";
const BLOCK_ID_ATTRIBUTE = "data-bilingual-translator-block-id";
const STATE_ATTRIBUTE = "data-bilingual-translator-state";
const STYLE_ATTRIBUTE = "data-bilingual-translator-style";
const SOURCE_ID_ATTRIBUTE = "data-bilingual-translator-source-id";
const FALLBACK_SOURCE_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6, [slot='title'], [slot='text-body']";
const EXPANDED_ATTRIBUTE = "data-bilingual-translator-expanded";
const SEMANTIC_BLOCK_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
const TRANSLATION_LANGUAGE = "zh-CN";
const INLINE_TAG_NAMES = new Set([
  "a",
  "abbr",
  "b",
  "cite",
  "code",
  "em",
  "i",
  "label",
  "small",
  "span",
  "strong",
  "sub",
  "sup"
]);
const BLOCKISH_TAG_NAMES = new Set([
  "article",
  "aside",
  "blockquote",
  "div",
  "figcaption",
  "figure",
  "footer",
  "header",
  "li",
  "main",
  "nav",
  "p",
  "section"
]);

function ensureTranslationStyles(doc: Document): void {
  if (doc.head?.querySelector(`[${STYLE_ATTRIBUTE}='true']`)) {
    return;
  }

  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "true");
  style.textContent = `
    .bilingual-translator-translation {
      margin-top: 8px;
      color: inherit;
      font-size: 0.9em;
      line-height: 1.45;
      unicode-bidi: plaintext;
      writing-mode: horizontal-tb;
      text-orientation: mixed;
      text-align: start;
    }

    .bilingual-translator-translation[data-bilingual-translator-state="translated"] {
      color: inherit;
      display: block;
      width: fit-content;
      max-width: 100%;
      border-bottom: 2px dashed color-mix(in srgb, currentColor 64%, transparent);
      padding-bottom: 2px;
    }

    .bilingual-translator-translation[data-bilingual-translator-state="loading"] {
      display: flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      max-width: 100%;
      color: inherit;
      opacity: 0.82;
    }

    .bilingual-translator-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid color-mix(in srgb, currentColor 28%, transparent);
      border-top-color: currentColor;
      border-radius: 999px;
      animation: bilingual-translator-spin 0.85s linear infinite;
      flex: none;
    }

    @keyframes bilingual-translator-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

  doc.head?.appendChild(style);
}

function getComputedDisplay(element: HTMLElement): string {
  return element.ownerDocument.defaultView?.getComputedStyle(element).display ?? "";
}

function isInlineLikeElement(element: HTMLElement): boolean {
  const elementDisplay = getComputedDisplay(element);
  return (
    element.matches("[slot='title']") ||
    INLINE_TAG_NAMES.has(element.tagName.toLowerCase()) ||
    elementDisplay.startsWith("inline") ||
    elementDisplay === "contents" ||
    elementDisplay === ""
  );
}

function findNearestBlockContainer(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;

  while (current) {
    const display = getComputedDisplay(current);
    const isBlockishDisplay =
      display === "block" ||
      display === "flex" ||
      display === "grid" ||
      display === "flow-root" ||
      display === "list-item" ||
      display === "table";

    if (isBlockishDisplay || BLOCKISH_TAG_NAMES.has(current.tagName.toLowerCase())) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function resolveSourceTranslationAnchor(element: HTMLElement): HTMLElement {
  const wrappingLink = element.closest<HTMLElement>("a[href]");
  if (wrappingLink && wrappingLink !== element && wrappingLink.contains(element)) {
    return wrappingLink;
  }

  if (!isInlineLikeElement(element)) {
    return element;
  }

  return element.closest<HTMLElement>(SEMANTIC_BLOCK_SELECTOR) ?? element;
}

function resolveExplicitTranslationAnchor(element: HTMLElement): HTMLElement {
  if (!isInlineLikeElement(element)) {
    return element;
  }

  return element.closest<HTMLElement>(SEMANTIC_BLOCK_SELECTOR) ?? findNearestBlockContainer(element) ?? element;
}

function getTranslationAnchorElement(sourceElement: HTMLElement, explicitAnchorElement?: HTMLElement): HTMLElement {
  if (explicitAnchorElement) {
    return resolveExplicitTranslationAnchor(explicitAnchorElement);
  }

  return resolveSourceTranslationAnchor(sourceElement);
}

function isCssLength(value: string): boolean {
  return /^-?\d+(?:\.\d+)?px$/.test(value);
}

function applyHorizontalLayoutFromAnchor(translationElement: HTMLElement, anchorElement: HTMLElement): void {
  const computedStyle = anchorElement.ownerDocument.defaultView?.getComputedStyle(anchorElement);
  if (!computedStyle) {
    return;
  }

  if (isCssLength(computedStyle.width)) {
    translationElement.style.width = computedStyle.width;
  }

  if (isCssLength(computedStyle.marginLeft)) {
    translationElement.style.marginLeft = computedStyle.marginLeft;
  }

  if (isCssLength(computedStyle.marginRight)) {
    translationElement.style.marginRight = computedStyle.marginRight;
  }
}

function getOrCreateTranslationElement(
  sourceElement: HTMLElement,
  blockId: string,
  explicitAnchorElement?: HTMLElement
): HTMLElement {
  ensureTranslationStyles(sourceElement.ownerDocument);
  const anchorElement = getTranslationAnchorElement(sourceElement, explicitAnchorElement);
  const existing = anchorElement.parentElement?.querySelector<HTMLElement>(
    `[${OWNED_ATTRIBUTE}='true'][${BLOCK_ID_ATTRIBUTE}='${blockId}']`
  );
  if (existing) {
    applyHorizontalLayoutFromAnchor(existing, anchorElement);
    return existing;
  }

  const translationElement = sourceElement.ownerDocument.createElement("div");
  translationElement.setAttribute(OWNED_ATTRIBUTE, "true");
  translationElement.setAttribute(BLOCK_ID_ATTRIBUTE, blockId);
  translationElement.setAttribute("lang", TRANSLATION_LANGUAGE);
  translationElement.setAttribute("dir", "ltr");
  translationElement.className = "bilingual-translator-translation";
  translationElement.style.direction = "ltr";
  translationElement.style.unicodeBidi = "plaintext";
  applyHorizontalLayoutFromAnchor(translationElement, anchorElement);
  anchorElement.insertAdjacentElement("afterend", translationElement);
  return translationElement;
}

function relaxClippedAncestors(sourceElement: HTMLElement, expansionRoot?: HTMLElement): void {
  if (expansionRoot) {
    expansionRoot.setAttribute(EXPANDED_ATTRIBUTE, "true");
    expansionRoot.style.overflow = "visible";
    expansionRoot.style.maxHeight = "none";
    return;
  }

  let current: HTMLElement | null = sourceElement.parentElement;

  while (current) {
    const computedStyle = current.ownerDocument.defaultView?.getComputedStyle(current);
    const computedOverflow = computedStyle?.overflow ?? "";
    const computedOverflowY = computedStyle?.overflowY ?? "";
    const computedMaxHeight = computedStyle?.maxHeight ?? "";
    const hasClippedOverflow =
      computedOverflow === "hidden" ||
      computedOverflow === "clip" ||
      computedOverflowY === "hidden" ||
      computedOverflowY === "clip";
    const hasMaxHeightConstraint = computedMaxHeight !== "" && computedMaxHeight !== "none";
    const hasInlineClipping = current.style.overflow === "hidden" || current.style.maxHeight !== "";

    if (hasInlineClipping || hasClippedOverflow || hasMaxHeightConstraint) {
      current.setAttribute(EXPANDED_ATTRIBUTE, "true");
      current.style.overflow = "visible";
      current.style.maxHeight = "none";
      return;
    }

    current = current.parentElement;
  }
}

function normalizeText(text: string | null | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

function resolveLiveSourceElement(
  sourceElement: HTMLElement,
  blockId: string,
  sourceText?: string
): HTMLElement {
  if (sourceElement.isConnected) {
    return sourceElement;
  }

  const doc = sourceElement.ownerDocument;
  const bySourceId = doc.querySelector<HTMLElement>(`[${SOURCE_ID_ATTRIBUTE}='${blockId}']`);
  if (bySourceId) {
    return bySourceId;
  }

  const normalizedSourceText = normalizeText(sourceText);
  if (!normalizedSourceText) {
    return sourceElement;
  }

  const sourceSlot = sourceElement.getAttribute("slot");
  const sourceTagName = sourceElement.tagName;
  const exactMatch = Array.from(doc.querySelectorAll<HTMLElement>(FALLBACK_SOURCE_SELECTOR)).find((element) => {
    if (element.getAttribute(OWNED_ATTRIBUTE) === "true") {
      return false;
    }

    if (element.tagName !== sourceTagName) {
      return false;
    }

    if ((element.getAttribute("slot") ?? null) !== sourceSlot) {
      return false;
    }

    return normalizeText(element.textContent) === normalizedSourceText;
  });

  return exactMatch ?? sourceElement;
}

export function renderTranslationLoadingBelow(
  sourceElement: HTMLElement,
  input: RenderTranslationLoadingInput
): HTMLElement {
  relaxClippedAncestors(sourceElement, input.expansionRoot);
  const translationElement = getOrCreateTranslationElement(sourceElement, input.blockId, input.anchorElement);
  translationElement.setAttribute(STATE_ATTRIBUTE, "loading");
  translationElement.replaceChildren();

  const spinner = sourceElement.ownerDocument.createElement("span");
  spinner.className = "bilingual-translator-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const label = sourceElement.ownerDocument.createElement("span");
  label.textContent = "Translating...";

  translationElement.append(spinner, label);

  if (input.tightLayout) {
    translationElement.dataset.bilingualTranslatorLayout = "tight";
  } else {
    delete translationElement.dataset.bilingualTranslatorLayout;
  }

  return translationElement;
}

export function renderTranslationBelow(sourceElement: HTMLElement, input: RenderTranslationInput): HTMLElement {
  const liveSourceElement = resolveLiveSourceElement(sourceElement, input.blockId, input.sourceText);
  relaxClippedAncestors(liveSourceElement, input.expansionRoot);
  const translationElement = getOrCreateTranslationElement(liveSourceElement, input.blockId, input.anchorElement);
  translationElement.setAttribute(STATE_ATTRIBUTE, "translated");
  translationElement.textContent = input.translationText;

  if (input.tightLayout) {
    translationElement.dataset.bilingualTranslatorLayout = "tight";
  } else {
    delete translationElement.dataset.bilingualTranslatorLayout;
  }

  return translationElement;
}

export function removeRenderedTranslations(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(`[${OWNED_ATTRIBUTE}='true']`).forEach((element) => {
    element.remove();
  });
}

export function removeRenderedTranslationBlock(root: ParentNode, blockId: string): void {
  root
    .querySelectorAll<HTMLElement>(`[${OWNED_ATTRIBUTE}='true'][${BLOCK_ID_ATTRIBUTE}='${blockId}']`)
    .forEach((element) => {
      element.remove();
    });
}
