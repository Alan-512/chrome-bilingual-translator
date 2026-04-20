import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";
import { collectGitHubCandidateBlock } from "./githubCandidateAdapter";
import { collectOpenRouterCandidateBlock } from "./openRouterCandidateAdapter";
import { collectRedditCandidateBlock } from "./redditCandidateAdapter";

type SiteAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

type SiteAdapter = {
  allowGenericFallback: (page: PageClassification) => boolean;
  collectCandidateBlock: (
    element: HTMLElement,
    page: PageClassification,
    helpers: SiteAdapterHelpers
  ) => CandidateBlock | null;
};

const REDDIT_ADAPTER: SiteAdapter = {
  allowGenericFallback: (page) => page.surface === "detail",
  collectCandidateBlock: collectRedditCandidateBlock
};

const GITHUB_ADAPTER: SiteAdapter = {
  allowGenericFallback: () => false,
  collectCandidateBlock: collectGitHubCandidateBlock
};

const OPENROUTER_ADAPTER: SiteAdapter = {
  allowGenericFallback: () => false,
  collectCandidateBlock: collectOpenRouterCandidateBlock
};

const PRODUCT_HUNT_ADAPTER: SiteAdapter = {
  allowGenericFallback: () => true,
  collectCandidateBlock: () => null
};

function getSiteAdapter(page: PageClassification): SiteAdapter | null {
  if (page.site === "reddit") {
    return REDDIT_ADAPTER;
  }

  if (page.site === "github") {
    return GITHUB_ADAPTER;
  }

  if (page.site === "openrouter") {
    return OPENROUTER_ADAPTER;
  }

  if (page.site === "producthunt") {
    return PRODUCT_HUNT_ADAPTER;
  }

  return null;
}

export function allowGenericFallbackForPage(page: PageClassification): boolean {
  return getSiteAdapter(page)?.allowGenericFallback(page) ?? true;
}

export function collectSiteCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SiteAdapterHelpers
): CandidateBlock | null {
  return getSiteAdapter(page)?.collectCandidateBlock(element, page, helpers) ?? null;
}
