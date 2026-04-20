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

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

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
  const blockRole = getGitHubBlockRole(element);
  const blockIndex = getGitHubBlockIndex(expansionRoot, element);

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `github|${page.surface}|${getGitHubArea(expansionRoot)}|${blockRole}|${blockIndex}|${normalizeText(sourceText)}`,
    renderHint: {
      anchorElement: isTitleElement ? summaryElement ?? undefined : undefined,
      expansionRoot
    }
  };
}
