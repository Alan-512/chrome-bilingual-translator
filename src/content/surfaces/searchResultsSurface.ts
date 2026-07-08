import type { CandidateBlock } from "../candidateTypes";
import type { PageClassification } from "../pageClassifier";
import { collectGoogleSearchResultsCandidateBlock } from "./googleSearchResultsCollector";

type SurfaceHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function isSearchResultsSurface(page: PageClassification): boolean {
  return page.site === "google-search";
}

export function allowSearchResultsGenericFallback(page: PageClassification): boolean {
  return !isSearchResultsSurface(page);
}

export function shouldMergeSearchResultsGenericFallback(): boolean {
  return false;
}

export function collectSearchResultsSurfaceCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SurfaceHelpers
): CandidateBlock | null {
  if (!isSearchResultsSurface(page)) {
    return null;
  }

  return collectGoogleSearchResultsCandidateBlock(element, page, helpers);
}

