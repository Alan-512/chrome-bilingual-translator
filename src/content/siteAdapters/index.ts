import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";
import { collectGitHubCandidateBlock } from "./githubCandidateAdapter";
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

  if (page.site === "github") {
    return collectGitHubCandidateBlock(element, page, helpers);
  }

  return null;
}
