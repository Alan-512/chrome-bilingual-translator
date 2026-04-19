import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";
import { collectRedditCandidateBlock } from "./redditCandidateAdapter";

type SiteAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function collectSiteCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SiteAdapterHelpers
): CandidateBlock | null {
  if (page.site === "reddit") {
    return collectRedditCandidateBlock(element, page, helpers);
  }

  return null;
}
