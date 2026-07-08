import type { CandidateBlock } from "../candidateTypes";
import type { PageClassification } from "../pageClassifier";
import { collectGitHubDocsRepoCandidateBlock } from "./githubDocsRepoCollector";

type SurfaceHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function isDocsRepoSurface(page: PageClassification): boolean {
  return page.site === "github";
}

export function allowDocsRepoGenericFallback(): boolean {
  return true;
}

export function shouldMergeDocsRepoGenericFallback(): boolean {
  return false;
}

export function collectDocsRepoSurfaceCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SurfaceHelpers
): CandidateBlock | null {
  if (!isDocsRepoSurface(page)) {
    return null;
  }

  return collectGitHubDocsRepoCandidateBlock(element, page, helpers);
}

