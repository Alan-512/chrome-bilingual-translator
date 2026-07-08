import type { CandidateBlock } from "../candidateTypes";
import type { PageClassification } from "../pageClassifier";
import {
  X_ACTION_CHROME_SELECTOR,
  X_PERMALINK_SELECTOR,
  X_POST_ROOT_SELECTOR,
  X_TWEET_TEXT_SELECTOR
} from "../siteProfiles/xProfile";
import { normalizeText, normalizeTextForKey } from "../core/textUtils";
import { collectRedditSocialFeedCandidateBlock } from "./redditSocialFeedCollector";

type SurfaceHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export function isSocialFeedSurface(page: PageClassification): boolean {
  return page.site === "x" || page.site === "reddit";
}

export function allowSocialFeedGenericFallback(page: PageClassification): boolean {
  if (page.site === "x") {
    return false;
  }

  if (page.site === "reddit") {
    return page.surface !== "detail";
  }

  return true;
}

export function shouldMergeSocialFeedGenericFallback(): boolean {
  return false;
}

export function getSocialFeedContentSelector(page: PageClassification): string {
  return page.site === "x" ? X_TWEET_TEXT_SELECTOR : "";
}

function getXStatusId(postRoot: HTMLElement): string | null {
  const statusLink = Array.from(postRoot.querySelectorAll<HTMLAnchorElement>(X_PERMALINK_SELECTOR))
    .map((link) => link.getAttribute("href") ?? "")
    .find((href) => /\/status\/\d+/.test(href));
  const match = statusLink?.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

function getPostRootIndex(postRoot: HTMLElement): number {
  const parent = postRoot.parentElement;
  if (!parent) {
    return 0;
  }

  const peers = Array.from(parent.querySelectorAll<HTMLElement>(X_POST_ROOT_SELECTOR));
  const index = peers.indexOf(postRoot);
  return index >= 0 ? index : 0;
}

function getTweetTextIndex(postRoot: HTMLElement, element: HTMLElement): number {
  const textBlocks = Array.from(postRoot.querySelectorAll<HTMLElement>(X_TWEET_TEXT_SELECTOR));
  const index = textBlocks.indexOf(element);
  return index >= 0 ? index : 0;
}

export function collectSocialFeedSurfaceCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: SurfaceHelpers
): CandidateBlock | null {
  if (page.site === "reddit") {
    return collectRedditSocialFeedCandidateBlock(element, page, helpers);
  }

  if (page.site !== "x") {
    return null;
  }

  if (!element.matches(X_TWEET_TEXT_SELECTOR)) {
    return null;
  }

  if (element.closest(X_ACTION_CHROME_SELECTOR)) {
    return null;
  }

  const postRoot = element.closest<HTMLElement>(X_POST_ROOT_SELECTOR);
  if (!postRoot) {
    return null;
  }

  const sourceText = normalizeText(element.textContent);
  if (!sourceText) {
    return null;
  }

  const statusId = getXStatusId(postRoot) ?? `row-${getPostRootIndex(postRoot)}`;
  const bodyIndex = getTweetTextIndex(postRoot, element);

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `social-feed|x|${page.surface}|${statusId}|body|${bodyIndex}|${normalizeTextForKey(sourceText)}`,
    renderHint: {
      anchorElement: element,
      expansionRoot: postRoot,
      skipVirtualizedLayoutAdjustment: true,
      preserveExistingRenderedCopies: true,
      renderAsSourceInline: true
    }
  };
}

