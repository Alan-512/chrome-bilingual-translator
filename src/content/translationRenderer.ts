import { classifyPage } from "./pageClassifier";
import { normalizeText } from "./core/textUtils";

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
const VIRTUAL_ROW_BASE_HEIGHT_ATTRIBUTE = "data-bilingual-translator-base-height";
const VIRTUAL_ROW_BASE_Y_ATTRIBUTE = "data-bilingual-translator-base-y";
const VIRTUAL_LIST_BASE_HEIGHT_ATTRIBUTE = "data-bilingual-translator-base-height";
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
      flex-shrink: 0;
    }

    .bilingual-translator-translation[data-bilingual-translator-state="translated"] {
      color: inherit;
      display: block;
      width: fit-content;
      max-width: 100%;
      text-decoration-line: underline;
      text-decoration-style: dashed;
      text-decoration-color: color-mix(in srgb, currentColor 64%, transparent);
      text-decoration-thickness: 2px;
      text-underline-offset: 4px;
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

    h1 .bilingual-translator-translation,
    h2 .bilingual-translator-translation,
    h3 .bilingual-translator-translation,
    h4 .bilingual-translator-translation,
    h5 .bilingual-translator-translation,
    h6 .bilingual-translator-translation {
      font-size: 0.75em;
      font-weight: normal;
      text-transform: none;
      letter-spacing: normal;
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
  if (element.getAttribute("slot") === "title") {
    return element;
  }

  if (element.matches("h1, h2, h3, h4, h5, h6")) {
    return element;
  }

  const wrappingLink = element.closest<HTMLElement>("a[href]");
  if (wrappingLink && wrappingLink !== element && wrappingLink.contains(element)) {
    return wrappingLink;
  }

  if (element.matches("a[href]") && element.querySelector("h1, h2, h3, h4, h5, h6")) {
    return element;
  }

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

  translationElement.style.textAlign = computedStyle.textAlign;

  if (isCssLength(computedStyle.width)) {
    translationElement.style.width = computedStyle.width;
  }

  if (isCssLength(computedStyle.marginLeft) || computedStyle.marginLeft === "auto") {
    translationElement.style.marginLeft = computedStyle.marginLeft;
  }

  if (isCssLength(computedStyle.marginRight) || computedStyle.marginRight === "auto") {
    translationElement.style.marginRight = computedStyle.marginRight;
  }

  if (
    computedStyle.textAlign === "center" &&
    !isCssLength(computedStyle.width) &&
    computedStyle.marginLeft !== "auto" &&
    computedStyle.marginRight !== "auto"
  ) {
    translationElement.style.marginLeft = "auto";
    translationElement.style.marginRight = "auto";
  }
}

function getOrCreateTranslationElement(
  sourceElement: HTMLElement,
  blockId: string,
  explicitAnchorElement?: HTMLElement
): HTMLElement {
  ensureTranslationStyles(sourceElement.ownerDocument);
  const anchorElement = getTranslationAnchorElement(sourceElement, explicitAnchorElement);
  
  let existing = Array.from(anchorElement.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.getAttribute(OWNED_ATTRIBUTE) === "true" &&
      child.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId
  );
  if (!existing && anchorElement.parentElement) {
    existing = Array.from(anchorElement.parentElement.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.getAttribute(OWNED_ATTRIBUTE) === "true" &&
        child.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId
    );
  }

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

  const doc = sourceElement.ownerDocument;
  const parent = anchorElement.parentElement;
  const parentStyle = parent ? parent.ownerDocument.defaultView?.getComputedStyle(parent) : null;
  const parentDisplay = parentStyle?.display ?? "";
  
  const isParentFlexOrGrid = parentDisplay === "flex" || parentDisplay === "inline-flex" || parentDisplay === "grid" || parentDisplay === "inline-grid";
  const isParentTable = parentDisplay === "table" || parentDisplay === "inline-table" || parentDisplay === "table-row" || parentDisplay === "table-row-group";
  
  const tagName = anchorElement.tagName.toLowerCase();
  const isListOrDefinition = tagName === "li" || tagName === "dt" || tagName === "dd";

  if (isParentFlexOrGrid || isParentTable || isListOrDefinition) {
    anchorElement.appendChild(translationElement);
  } else {
    anchorElement.insertAdjacentElement("afterend", translationElement);
  }

  return translationElement;
}

function relaxClippedAncestors(sourceElement: HTMLElement, expansionRoot?: HTMLElement): void {
  const doc = sourceElement.ownerDocument;
  if (classifyPage(doc).site === "google-search") {
    return;
  }

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

function parsePixelValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(-?\d+(?:\.\d+)?)px/);
  return match ? Number(match[1]) : null;
}

function parseTranslateY(transformValue: string | null | undefined, translateValue: string | null | undefined): number | null {
  // 1. Prioritize individual 'translate' property if both are present
  // CSS spec: single-value translate "X" defaults Y to "0px"
  if (translateValue && translateValue !== "none") {
    const parts = translateValue.trim().split(/\s+/);
    const yPart = parts.length >= 2 ? parts[1] : "0px";
    const match = yPart.match(/([-+]?\d+(?:\.\d+)?)(px|%|em|rem)?/);
    if (match) return Number(match[1]);
  }

  if (!transformValue || transformValue === "none") return null;

  // 2. transform: translate(x, y) supporting both space and comma separation
  const translateMatch = transformValue.match(/translate\(\s*[^,\s]+[\s,]\s*([-+]?\d+(?:\.\d+)?)(?:px)?\)/);
  if (translateMatch) return Number(translateMatch[1]);

  // 3. translate3d(x, y, z)
  const translate3dMatch = transformValue.match(/translate3d\([^,]+,\s*([-+]?\d+(?:\.\d+)?)(?:px)?,[^)]+\)/);
  if (translate3dMatch) return Number(translate3dMatch[1]);

  // 4. translateY(y)
  const translateYMatch = transformValue.match(/translateY\(([-+]?\d+(?:\.\d+)?)(?:px)?\)/);
  if (translateYMatch) return Number(translateYMatch[1]);

  // 5. 2D Matrix (ty is 6th param at index 5)
  const matrixMatch = transformValue.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([-+]?\d+(?:\.\d+)?)\)/);
  if (matrixMatch) return Number(matrixMatch[1]);

  // 6. 3D Matrix (ty is 14th param at index 13)
  const matrix3dMatch = transformValue.match(/matrix3d\((?:[^,]+,){13}\s*([-+]?\d+(?:\.\d+)?)[^)]*\)/);
  if (matrix3dMatch) return Number(matrix3dMatch[1]);

  return null;
}

function getVirtualRowBaseHeight(row: HTMLElement): number {
  const storedHeightAttribute = row.getAttribute(VIRTUAL_ROW_BASE_HEIGHT_ATTRIBUTE);
  const storedHeight = Number(storedHeightAttribute);
  if (storedHeightAttribute !== null && Number.isFinite(storedHeight) && storedHeight > 0) {
    return storedHeight;
  }

  const computedStyle = row.ownerDocument.defaultView?.getComputedStyle(row);
  const baseHeight =
    parsePixelValue(row.style.height) ?? parsePixelValue(computedStyle?.height) ?? Math.ceil(row.getBoundingClientRect().height);
  row.setAttribute(VIRTUAL_ROW_BASE_HEIGHT_ATTRIBUTE, String(baseHeight));
  return baseHeight;
}

function getVirtualRowBaseY(row: HTMLElement): number {
  const computedStyle = row.ownerDocument.defaultView?.getComputedStyle(row);
  const transform = row.style.transform || computedStyle?.transform || "";
  const translate = row.style.translate || computedStyle?.translate || "";
  
  const parsedCurrentY = parseTranslateY(transform, translate) ?? 0;
  const appliedYAttr = row.getAttribute("data-bilingual-translator-applied-y");
  const appliedY = appliedYAttr !== null ? Number(appliedYAttr) : null;

  // Invalidate cached baseline Y-coordinate if changed by the external scroller
  if (appliedY !== null && Math.abs(parsedCurrentY - appliedY) > 0.1) {
    row.removeAttribute(VIRTUAL_ROW_BASE_Y_ATTRIBUTE);
    row.removeAttribute("data-bilingual-translator-applied-y");
  }

  const storedYAttribute = row.getAttribute(VIRTUAL_ROW_BASE_Y_ATTRIBUTE);
  const storedY = Number(storedYAttribute);
  if (storedYAttribute !== null && Number.isFinite(storedY)) {
    return storedY;
  }

  row.setAttribute(VIRTUAL_ROW_BASE_Y_ATTRIBUTE, String(parsedCurrentY));
  return parsedCurrentY;
}

function getVirtualListBaseHeight(list: HTMLElement): number {
  const computedStyle = list.ownerDocument.defaultView?.getComputedStyle(list);
  const currentHeightAttr = list.style.height || computedStyle?.height || "";
  const parsedCurrentHeight = parsePixelValue(currentHeightAttr) ?? 0;

  const appliedHeightAttr = list.getAttribute("data-bilingual-translator-applied-height");
  const appliedHeight = appliedHeightAttr !== null ? Number(appliedHeightAttr) : null;

  // Invalidate cached baseline height if modified by the external scroller
  if (appliedHeight !== null && Math.abs(parsedCurrentHeight - appliedHeight) > 0.1) {
    list.removeAttribute(VIRTUAL_LIST_BASE_HEIGHT_ATTRIBUTE);
    list.removeAttribute("data-bilingual-translator-applied-height");
  }

  const storedHeightAttribute = list.getAttribute(VIRTUAL_LIST_BASE_HEIGHT_ATTRIBUTE);
  const storedHeight = Number(storedHeightAttribute);
  if (storedHeightAttribute !== null && Number.isFinite(storedHeight) && storedHeight > 0) {
    return storedHeight;
  }

  const baseHeight = parsePixelValue(list.style.height) ?? parsePixelValue(computedStyle?.height) ?? Math.ceil(list.getBoundingClientRect().height);
  list.setAttribute(VIRTUAL_LIST_BASE_HEIGHT_ATTRIBUTE, String(baseHeight));
  return baseHeight;
}

function updateTransformY(transform: string, targetY: number): string {
  if (!transform || transform === "none") {
    return `translateY(${targetY}px)`;
  }

  // 1. Replace 3D Matrix translateY component (14th parameter, index 13) first to avoid conflict with 2D matrix matching
  if (/matrix3d\(/i.test(transform)) {
    return transform.replace(/matrix3d\(([^)]+)\)/i, (match, p1) => {
      const parts = p1.split(/\s*,\s*/);
      if (parts.length === 16) {
        parts[13] = String(targetY);
        return `matrix3d(${parts.join(", ")})`;
      }
      return match;
    });
  }

  // 2. Replace 2D Matrix translateY component (6th parameter, index 5)
  if (/matrix\(/i.test(transform)) {
    return transform.replace(
      /matrix\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\)/i,
      `matrix($1, $2, $3, $4, $5, ${targetY})`
    );
  }

  // 3. Replace translateY(val)
  if (/translateY\([^)]+\)/i.test(transform)) {
    return transform.replace(/translateY\([^)]+\)/i, `translateY(${targetY}px)`);
  }

  // 4. Replace translate3d(x, y, z) preserving X and Z
  if (/translate3d\(([^,]+),\s*[^,]+,\s*([^)]+)\)/i.test(transform)) {
    return transform.replace(/translate3d\(([^,]+),\s*[^,]+,\s*([^)]+)\)/i, `translate3d($1, ${targetY}px, $2)`);
  }

  // 5. Replace translate(x, y) preserving X
  if (/translate\(([^,\s]+)[\s,]+[^)]+\)/i.test(transform)) {
    return transform.replace(/translate\(([^,\s]+)[\s,]+[^)]+\)/i, `translate($1, ${targetY}px)`);
  }

  return `${transform} translateY(${targetY}px)`.trim();
}

function updateTranslateY(translate: string, targetY: number): string {
  if (!translate || translate === "none") {
    return `0px ${targetY}px`;
  }
  const parts = translate.trim().split(/\s+/);
  const xPart = parts.length >= 1 ? parts[0] : "0px";
  const zPart = parts.length >= 3 ? parts[2] : "";
  return `${xPart} ${targetY}px ${zPart}`.trim();
}

const isVirtualizedRow = (el: HTMLElement) => {
  const style = el.style;
  const computedStyle = el.ownerDocument.defaultView?.getComputedStyle(el);
  const position = style.position || computedStyle?.position;
  if (position !== "absolute") return false;

  const transform = style.transform || computedStyle?.transform || "";
  const translate = style.translate || computedStyle?.translate || "";
  return (transform !== "" && transform !== "none") || (translate !== "" && translate !== "none");
};

function resolveVirtualizedRow(expansionRoot?: HTMLElement): HTMLElement | null {
  const row = expansionRoot && isVirtualizedRow(expansionRoot) ? expansionRoot : expansionRoot?.parentElement?.closest<HTMLElement>("li");
  if (row && isVirtualizedRow(row) && row.parentElement) {
    return row;
  }
  return null;
}

function updateVirtualizedListLayout(expansionRoot?: HTMLElement): void {
  const activeRow = resolveVirtualizedRow(expansionRoot);
  const list = activeRow?.parentElement;
  if (!activeRow || !list) {
    return;
  }

  const rows = Array.from(list.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .filter(isVirtualizedRow)
    .sort((a, b) => getVirtualRowBaseY(a) - getVirtualRowBaseY(b));

  let accumulatedExtraHeight = 0;
  rows.forEach((row) => {
    const baseY = getVirtualRowBaseY(row);
    const baseHeight = getVirtualRowBaseHeight(row);
    row.style.minHeight = `${baseHeight}px`;
    row.style.height = "auto";

    const expandedHeight = Math.max(baseHeight, Math.ceil(row.scrollHeight));
    row.style.height = `${expandedHeight}px`;

    const targetY = baseY + accumulatedExtraHeight;
    row.setAttribute("data-bilingual-translator-applied-y", String(targetY));

    // Same-Source Style Writing Barrier with Non-Y & Matrix Overwrite Preservation
    const computedStyle = row.ownerDocument.defaultView?.getComputedStyle(row);
    const translate = row.style.translate || computedStyle?.translate || "";
    if (translate !== "" && translate !== "none") {
      row.style.translate = updateTranslateY(row.style.translate || translate, targetY);
    } else {
      row.style.transform = updateTransformY(row.style.transform || computedStyle?.transform || "", targetY);
    }

    accumulatedExtraHeight += expandedHeight - baseHeight;
  });

  const listBaseHeight = getVirtualListBaseHeight(list);
  const targetListHeight = listBaseHeight + accumulatedExtraHeight;
  list.setAttribute("data-bilingual-translator-applied-height", String(targetListHeight));
  list.style.height = `${targetListHeight}px`;
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

  updateVirtualizedListLayout(input.expansionRoot);
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

  updateVirtualizedListLayout(input.expansionRoot);
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
