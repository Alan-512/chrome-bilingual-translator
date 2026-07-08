import type { CandidateBlock } from "../candidateTypes";
import type { PageClassification } from "../pageClassifier";
import { collectOpenRouterProductCandidateBlock } from "./openRouterProductCollector";
import { collectProductHuntProductCandidateBlock } from "./productHuntProductCollector";

type SurfaceHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function isProductSurface(page: PageClassification): boolean {
  return page.site === "openrouter" || page.site === "producthunt";
}

export function allowProductGenericFallback(page: PageClassification): boolean {
  return !isProductSurface(page);
}

export function shouldMergeProductGenericFallback(): boolean {
  return false;
}

export function collectProductSurfaceCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SurfaceHelpers
): CandidateBlock | null {
  if (page.site === "openrouter") {
    return collectOpenRouterProductCandidateBlock(element, page, helpers);
  }

  if (page.site === "producthunt") {
    return collectProductHuntProductCandidateBlock(element, page, helpers);
  }

  return null;
}

