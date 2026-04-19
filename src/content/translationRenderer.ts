type RenderTranslationInput = {
  blockId: string;
  translationText: string;
  sourceText?: string;
  tightLayout?: boolean;
};

type RenderTranslationLoadingInput = {
  blockId: string;
  tightLayout?: boolean;
};

const OWNED_ATTRIBUTE = "data-bilingual-translator-owned";
const BLOCK_ID_ATTRIBUTE = "data-bilingual-translator-block-id";
const STATE_ATTRIBUTE = "data-bilingual-translator-state";
const STYLE_ATTRIBUTE = "data-bilingual-translator-style";
const SOURCE_ID_ATTRIBUTE = "data-bilingual-translator-source-id";
const FALLBACK_SOURCE_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6, [slot='title'], [slot='text-body']";
const EXPANDED_ATTRIBUTE = "data-bilingual-translator-expanded";

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
    }

    .bilingual-translator-translation[data-bilingual-translator-state="translated"] {
      color: inherit;
      display: inline-block;
      width: fit-content;
      max-width: 100%;
      border-bottom: 2px dashed color-mix(in srgb, currentColor 64%, transparent);
      padding-bottom: 2px;
    }

    .bilingual-translator-translation[data-bilingual-translator-state="loading"] {
      display: inline-flex;
      align-items: center;
      gap: 8px;
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

function getOrCreateTranslationElement(sourceElement: HTMLElement, blockId: string): HTMLElement {
  ensureTranslationStyles(sourceElement.ownerDocument);
  const existing = sourceElement.parentElement?.querySelector<HTMLElement>(
    `[${OWNED_ATTRIBUTE}='true'][${BLOCK_ID_ATTRIBUTE}='${blockId}']`
  );
  if (existing) {
    return existing;
  }

  const translationElement = sourceElement.ownerDocument.createElement("div");
  translationElement.setAttribute(OWNED_ATTRIBUTE, "true");
  translationElement.setAttribute(BLOCK_ID_ATTRIBUTE, blockId);
  translationElement.className = "bilingual-translator-translation";
  sourceElement.insertAdjacentElement("afterend", translationElement);
  return translationElement;
}

function relaxClippedAncestors(sourceElement: HTMLElement): void {
  let current: HTMLElement | null = sourceElement.parentElement;

  while (current) {
    const hasInlineClipping = current.style.overflow === "hidden" || current.style.maxHeight !== "";
    if (hasInlineClipping) {
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
  relaxClippedAncestors(sourceElement);
  const translationElement = getOrCreateTranslationElement(sourceElement, input.blockId);
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
  relaxClippedAncestors(liveSourceElement);
  const translationElement = getOrCreateTranslationElement(liveSourceElement, input.blockId);
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
