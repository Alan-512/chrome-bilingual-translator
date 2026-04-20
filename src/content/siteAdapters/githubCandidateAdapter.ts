import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const GITHUB_ALLOWED_ROOT_SELECTOR = [
  "#readme",
  ".markdown-body",
  "[itemprop='about']",
  "[data-testid='repository-about']"
].join(", ");

const GITHUB_EXPANSION_ROOT_SELECTOR = [
  "#readme",
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

  const expansionRoot = element.closest<HTMLElement>(GITHUB_EXPANSION_ROOT_SELECTOR) ?? allowedRoot;

  const sourceText = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!sourceText) {
    return null;
  }

  const summaryElement = expansionRoot.querySelector<HTMLElement>("p, li, blockquote");
  const isTitleElement = /^H[1-6]$/.test(element.tagName);

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    renderHint: {
      anchorElement: isTitleElement ? summaryElement ?? undefined : undefined,
      expansionRoot
    }
  };
}
