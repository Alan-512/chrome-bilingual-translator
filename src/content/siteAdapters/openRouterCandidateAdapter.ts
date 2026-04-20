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

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

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

  const summaryElement = allowedRoot.querySelector<HTMLElement>("p, li, blockquote");
  const isTitleElement = /^H[1-6]$/.test(element.tagName);

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `openrouter|${page.surface}|${normalizeText(sourceText)}`,
    renderHint: {
      anchorElement: isTitleElement ? summaryElement ?? undefined : undefined,
      expansionRoot: allowedRoot
    }
  };
}
