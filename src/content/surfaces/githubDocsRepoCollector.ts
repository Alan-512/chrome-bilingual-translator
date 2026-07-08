import type { CandidateBlock } from "../candidateTypes";
import { normalizeText } from "../core/textUtils";
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

function getGitHubArea(expansionRoot: HTMLElement) {
  if (expansionRoot.matches("#readme")) {
    return "readme";
  }

  if (expansionRoot.matches("[itemprop='about'], [data-testid='repository-about']")) {
    return "about";
  }

  return "content";
}

function getGitHubBlockRole(element: HTMLElement) {
  return /^H[1-6]$/.test(element.tagName) ? "title" : "body";
}

function getGitHubBlockIndex(expansionRoot: HTMLElement, element: HTMLElement) {
  const selector = /^H[1-6]$/.test(element.tagName) ? "h1, h2, h3, h4, h5, h6" : "p, li, blockquote";
  const peers = Array.from(expansionRoot.querySelectorAll<HTMLElement>(selector));
  const index = peers.indexOf(element);
  return index >= 0 ? index : 0;
}

export function collectGitHubDocsRepoCandidateBlock(
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

  const sourceText = normalizeText(element.textContent);
  if (!sourceText) {
    return null;
  }

  const blockRole = getGitHubBlockRole(element);
  const blockIndex = getGitHubBlockIndex(expansionRoot, element);

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `github|${page.surface}|${getGitHubArea(expansionRoot)}|${blockRole}|${blockIndex}|${normalizeText(sourceText)}`,
    renderHint: {
      anchorElement: undefined,
      expansionRoot
    }
  };
}
