import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const REDDIT_FEED_CARD_SELECTOR = "shreddit-post";
const REDUNDANT_CONTAINER_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";

type RedditAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

function getNormalizedText(element: HTMLElement | null): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function getNormalizedGroupedText(element: HTMLElement | null): string {
  if (!element) {
    return "";
  }

  const semanticChildren = Array.from(element.querySelectorAll<HTMLElement>(REDUNDANT_CONTAINER_SELECTOR))
    .map((child) => getNormalizedText(child))
    .filter(Boolean);

  if (semanticChildren.length > 0) {
    return semanticChildren.join("\n\n");
  }

  return getNormalizedText(element);
}

export function collectRedditCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: RedditAdapterHelpers
): CandidateBlock | null {
  const feedCard = element.closest<HTMLElement>(REDDIT_FEED_CARD_SELECTOR);
  if (!feedCard) {
    return null;
  }

  const titleElement = feedCard.querySelector<HTMLElement>("[slot='title']");
  const bodyElement = feedCard.querySelector<HTMLElement>("[slot='text-body']");

  if (page.surface === "listing") {
    const sourceParts = [getNormalizedText(titleElement), getNormalizedGroupedText(bodyElement)].filter(Boolean);
    const anchorElement = bodyElement ?? titleElement;

    if (!anchorElement || sourceParts.length === 0) {
      return null;
    }

    return {
      blockId: helpers.getStableBlockId(anchorElement),
      element: anchorElement,
      sourceText: sourceParts.join("\n\n"),
      renderHint: {
        anchorElement,
        expansionRoot: feedCard
      }
    };
  }

  if (page.surface !== "detail") {
    return null;
  }

  const sourceText = getNormalizedText(element);
  if (!sourceText) {
    return null;
  }

  if (element === titleElement) {
    return {
      blockId: helpers.getStableBlockId(element),
      element,
      sourceText,
      renderHint: {
        anchorElement: bodyElement?.querySelector<HTMLElement>("p, li, blockquote") ?? undefined,
        expansionRoot: feedCard
      }
    };
  }

  if (bodyElement && element !== bodyElement && bodyElement.contains(element)) {
    return {
      blockId: helpers.getStableBlockId(element),
      element,
      sourceText,
      renderHint: {
        expansionRoot: feedCard
      }
    };
  }

  return null;
}
