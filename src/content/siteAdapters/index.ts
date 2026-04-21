import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";
import { collectGoogleSearchCandidateBlock } from "./googleSearchCandidateAdapter";
import { collectGitHubCandidateBlock } from "./githubCandidateAdapter";
import { collectOpenRouterCandidateBlock } from "./openRouterCandidateAdapter";
import { collectProductHuntCandidateBlock } from "./productHuntCandidateAdapter";
import { collectRedditCandidateBlock } from "./redditCandidateAdapter";

type SiteAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

type SiteAdapter = {
  genericFallbackMode: (page: PageClassification) => "never" | "when-empty" | "merge";
  collectCandidateBlock: (
    element: HTMLElement,
    page: PageClassification,
    helpers: SiteAdapterHelpers
  ) => CandidateBlock | null;
};

const REDDIT_ADAPTER: SiteAdapter = {
  genericFallbackMode: (page) => (page.surface === "detail" ? "merge" : "when-empty"),
  collectCandidateBlock: collectRedditCandidateBlock
};

const GITHUB_ADAPTER: SiteAdapter = {
  genericFallbackMode: () => "when-empty",
  collectCandidateBlock: collectGitHubCandidateBlock
};

const GOOGLE_SEARCH_ADAPTER: SiteAdapter = {
  genericFallbackMode: () => "never",
  collectCandidateBlock: collectGoogleSearchCandidateBlock
};

const OPENROUTER_ADAPTER: SiteAdapter = {
  genericFallbackMode: () => "never",
  collectCandidateBlock: collectOpenRouterCandidateBlock
};

const PRODUCT_HUNT_ADAPTER: SiteAdapter = {
  genericFallbackMode: () => "never",
  collectCandidateBlock: collectProductHuntCandidateBlock
};

function getSiteAdapter(page: PageClassification): SiteAdapter | null {
  if (page.site === "reddit") {
    return REDDIT_ADAPTER;
  }

  if (page.site === "github") {
    return GITHUB_ADAPTER;
  }

  if (page.site === "google-search") {
    return GOOGLE_SEARCH_ADAPTER;
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
  return (getSiteAdapter(page)?.genericFallbackMode(page) ?? "when-empty") !== "never";
}

export function shouldMergeGenericFallbackForPage(page: PageClassification): boolean {
  return (getSiteAdapter(page)?.genericFallbackMode(page) ?? "when-empty") === "merge";
}

export function collectSiteCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SiteAdapterHelpers
): CandidateBlock | null {
  return getSiteAdapter(page)?.collectCandidateBlock(element, page, helpers) ?? null;
}
