import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const GOOGLE_RESULT_ROOT_SELECTOR = ".MjjYud, .g, [data-snc]";
const GOOGLE_SNIPPET_SELECTOR = ".VwiC3b, .yXK7lf, .MUxGbd, .hgKElc, .s3v9rd";

type GoogleSearchAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getResultIndex(resultRoot: HTMLElement) {
  const parent = resultRoot.parentElement;
  if (!parent) {
    return 0;
  }

  const siblings = Array.from(parent.querySelectorAll<HTMLElement>(GOOGLE_RESULT_ROOT_SELECTOR));
  const index = siblings.indexOf(resultRoot);
  return index >= 0 ? index : 0;
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

  const resultIndex = getResultIndex(resultRoot);
  const isTitleElement = element.tagName === "H3";
  const isSnippetElement = element.matches(GOOGLE_SNIPPET_SELECTOR);
  const nestedSnippetParent = isSnippetElement ? element.parentElement?.closest<HTMLElement>(GOOGLE_SNIPPET_SELECTOR) : null;

  if (!isTitleElement && !isSnippetElement) {
    return null;
  }

  if (isSnippetElement && nestedSnippetParent && resultRoot.contains(nestedSnippetParent)) {
    return null;
  }

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `google-search|${page.surface}|${isTitleElement ? "title" : "snippet"}|${resultIndex}|${normalizeText(sourceText)}`,
    renderHint: {
      expansionRoot: resultRoot
    }
  };
}
