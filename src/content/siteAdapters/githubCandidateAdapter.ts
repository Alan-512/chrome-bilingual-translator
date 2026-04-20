import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const GITHUB_ALLOWED_ROOT_SELECTOR = [
  "#readme",
  ".markdown-body",
  "[itemprop='about']",
  "[data-testid='repository-about']"
].join(", ");

type GitHubAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function collectGitHubCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: GitHubAdapterHelpers
): CandidateBlock | null {
  if (page.site !== "github") {
    return null;
  }

  const allowedRoot = element.closest<HTMLElement>(GITHUB_ALLOWED_ROOT_SELECTOR);
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
