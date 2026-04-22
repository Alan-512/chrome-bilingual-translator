import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const GOOGLE_RESULT_ROOT_SELECTOR = ".MjjYud, .g, [data-snc], .related-question-pair, .kp-wholepage, [data-shopping-result]";
const GOOGLE_SNIPPET_SELECTOR =
  ".VwiC3b, .yXK7lf, .MUxGbd, .hgKElc, .s3v9rd, [data-shopping-result] [data-shopping-description], [data-shopping-result] [data-shopping-price]";
const GOOGLE_QUESTION_SELECTOR = ".related-question-pair [role='heading']";
const GOOGLE_KNOWLEDGE_TITLE_SELECTOR = ".kp-wholepage [data-attrid='title']";
const GOOGLE_KNOWLEDGE_DESCRIPTION_SELECTOR = ".kp-wholepage .kno-rdesc span";
const GOOGLE_SHOPPING_TITLE_SELECTOR = "[data-shopping-result] [role='heading'], [data-shopping-result] h3";

type GoogleSearchAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getResultIndex(resultRoot: HTMLElement, selector = GOOGLE_RESULT_ROOT_SELECTOR) {
  const parent = resultRoot.parentElement;
  if (!parent) {
    return 0;
  }

  const siblings = Array.from(parent.querySelectorAll<HTMLElement>(selector));
  const index = siblings.indexOf(resultRoot);
  return index >= 0 ? index : 0;
}

function getBlockKind(element: HTMLElement) {
  if (element.tagName === "H3") {
    return "title";
  }

  if (element.matches(GOOGLE_SNIPPET_SELECTOR)) {
    return "snippet";
  }

  if (element.matches(GOOGLE_QUESTION_SELECTOR)) {
    return "question";
  }

  if (element.matches(GOOGLE_KNOWLEDGE_TITLE_SELECTOR)) {
    return "knowledge-title";
  }

  if (element.matches(GOOGLE_KNOWLEDGE_DESCRIPTION_SELECTOR)) {
    return "knowledge-description";
  }

  if (element.matches(GOOGLE_SHOPPING_TITLE_SELECTOR)) {
    return "shopping-title";
  }

  if (element.matches("[data-shopping-result] [data-shopping-description]")) {
    return "shopping-description";
  }

  if (element.matches("[data-shopping-result] [data-shopping-price]")) {
    return "shopping-price";
  }

  return null;
}

function getKindIndex(resultRoot: HTMLElement, blockKind: string) {
  if (blockKind === "question") {
    return getResultIndex(resultRoot, ".related-question-pair");
  }

  if (blockKind === "knowledge-title" || blockKind === "knowledge-description") {
    return getResultIndex(resultRoot, ".kp-wholepage");
  }

  if (blockKind.startsWith("shopping-")) {
    return getResultIndex(resultRoot, "[data-shopping-result]");
  }

  return getResultIndex(resultRoot, ".MjjYud, .g, [data-snc]");
}

export function collectGoogleSearchCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: GoogleSearchAdapterHelpers
): CandidateBlock | null {
  if (page.site !== "google-search") {
    return null;
  }

  const resultRoot = element.closest<HTMLElement>(GOOGLE_RESULT_ROOT_SELECTOR);
  if (!resultRoot) {
    return null;
  }

  const sourceText = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!sourceText) {
    return null;
  }

  const blockKind = getBlockKind(element);
  const isTitleElement = blockKind === "title";
  const isSnippetElement = blockKind === "snippet";
  const nestedSnippetParent = isSnippetElement ? element.parentElement?.closest<HTMLElement>(GOOGLE_SNIPPET_SELECTOR) : null;
  const titleAnchorElement = isTitleElement ? element : undefined;

  if (!blockKind) {
    return null;
  }

  if (isSnippetElement && nestedSnippetParent && resultRoot.contains(nestedSnippetParent)) {
    return null;
  }

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `google-search|${page.surface}|${blockKind}|${getKindIndex(resultRoot, blockKind)}|${normalizeText(sourceText)}`,
    renderHint: {
      anchorElement: titleAnchorElement,
      expansionRoot: resultRoot
    }
  };
}
