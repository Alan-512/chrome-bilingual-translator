import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const OPENROUTER_ALLOWED_ROOT_SELECTOR = [
  ".model-card",
  "[data-testid='model-card']",
  "[data-or-route='model-card']"
].join(", ");

type OpenRouterAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function collectOpenRouterCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: OpenRouterAdapterHelpers
): CandidateBlock | null {
  if (page.site !== "openrouter") {
    return null;
  }

  const allowedRoot = element.closest<HTMLElement>(OPENROUTER_ALLOWED_ROOT_SELECTOR);
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
