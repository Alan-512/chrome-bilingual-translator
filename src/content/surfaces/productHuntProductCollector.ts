import type { CandidateBlock } from "../candidateTypes";
import { normalizeText } from "../core/textUtils";
import type { PageClassification } from "../pageClassifier";

const PRODUCT_HUNT_ALLOWED_ROOT_SELECTOR = [
  "[data-producthunt-main]",
  "[data-test='product-main']",
  "[data-sentry-component='ProductPage']"
].join(", ");

type ProductHuntAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function collectProductHuntProductCandidateBlock(
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

  const sourceText = normalizeText(element.textContent);
  if (!sourceText) {
    return null;
  }

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `producthunt|${page.surface}|main|${normalizeText(sourceText)}`,
    renderHint: {
      anchorElement: undefined,
      expansionRoot: allowedRoot
    }
  };
}
