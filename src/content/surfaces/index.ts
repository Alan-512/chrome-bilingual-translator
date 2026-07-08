import type { CandidateBlock } from "../candidateTypes";
import type { PageClassification } from "../pageClassifier";
import {
  allowDocsRepoGenericFallback,
  collectDocsRepoSurfaceCandidateBlock,
  isDocsRepoSurface,
  shouldMergeDocsRepoGenericFallback
} from "./docsRepoSurface";
import { GENERIC_CONTENT_SELECTOR } from "./genericSurface";
import type { GenericSurfaceElementAnalysis, GenericSurfaceState } from "./genericSurface";
import {
  allowSocialFeedGenericFallback,
  collectSocialFeedSurfaceCandidateBlock,
  getSocialFeedContentSelector,
  isSocialFeedSurface,
  shouldMergeSocialFeedGenericFallback
} from "./socialFeedSurface";
import {
  allowProductGenericFallback,
  collectProductSurfaceCandidateBlock,
  isProductSurface,
  shouldMergeProductGenericFallback
} from "./productSurface";
import {
  allowSearchResultsGenericFallback,
  collectSearchResultsSurfaceCandidateBlock,
  isSearchResultsSurface,
  shouldMergeSearchResultsGenericFallback
} from "./searchResultsSurface";

type SurfaceHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export type { GenericSurfaceElementAnalysis, GenericSurfaceState };

export {
  analyzeGenericSurfaceElement,
  createGenericSurfaceState,
  filterGenericSurfaceCandidates,
  filterMergedGenericFallbackCandidates,
  rememberGenericStructuredRootCandidate
} from "./genericSurface";

export function allowGenericFallbackForPage(page: PageClassification): boolean {
  if (isSocialFeedSurface(page)) {
    return allowSocialFeedGenericFallback(page);
  }

  if (isSearchResultsSurface(page)) {
    return allowSearchResultsGenericFallback(page);
  }

  if (isDocsRepoSurface(page)) {
    return allowDocsRepoGenericFallback();
  }

  if (isProductSurface(page)) {
    return allowProductGenericFallback(page);
  }

  return true;
}

export function shouldMergeGenericFallbackForPage(page: PageClassification): boolean {
  if (isSocialFeedSurface(page)) {
    return shouldMergeSocialFeedGenericFallback();
  }

  if (isSearchResultsSurface(page)) {
    return shouldMergeSearchResultsGenericFallback();
  }

  if (isDocsRepoSurface(page)) {
    return shouldMergeDocsRepoGenericFallback();
  }

  if (isProductSurface(page)) {
    return shouldMergeProductGenericFallback();
  }

  return false;
}

export function getCandidateContentSelector(page: PageClassification): string {
  return [GENERIC_CONTENT_SELECTOR, getSocialFeedContentSelector(page)].filter(Boolean).join(", ");
}

export function collectSurfaceCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SurfaceHelpers
): CandidateBlock | null {
  const socialFeedCandidate = collectSocialFeedSurfaceCandidateBlock(element, page, helpers);
  if (socialFeedCandidate) {
    return socialFeedCandidate;
  }

  const searchResultsCandidate = collectSearchResultsSurfaceCandidateBlock(element, page, helpers);
  if (searchResultsCandidate) {
    return searchResultsCandidate;
  }

  const docsRepoCandidate = collectDocsRepoSurfaceCandidateBlock(element, page, helpers);
  if (docsRepoCandidate) {
    return docsRepoCandidate;
  }

  const productCandidate = collectProductSurfaceCandidateBlock(element, page, helpers);
  if (productCandidate) {
    return productCandidate;
  }

  return null;
}

