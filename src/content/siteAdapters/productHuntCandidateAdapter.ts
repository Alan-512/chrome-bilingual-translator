import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const PRODUCT_HUNT_ALLOWED_ROOT_SELECTOR = [
  "[data-producthunt-main]",
  "main article",
  "[data-test='product-main']",
  "[data-sentry-component='ProductPage']"
].join(", ");

type ProductHuntAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function collectProductHuntCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: ProductHuntAdapterHelpers
): CandidateBlock | null {
  if (page.site !== "producthunt") {
    return null;
  }

  const allowedRoot = element.closest<HTMLElement>(PRODUCT_HUNT_ALLOWED_ROOT_SELECTOR);
  if (!allowedRoot) {
    return null;
  }

  const sourceText = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!sourceText) {
    return null;
  }

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText
  };
}
