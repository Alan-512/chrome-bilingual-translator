import type { CandidateBlock } from "../candidateTypes";
import { normalizeText } from "../core/textUtils";
import type { PageClassification } from "../pageClassifier";
import {
  REDDIT_COMMENT_ANCHOR_SELECTOR,
  REDDIT_COMMENT_BODY_SELECTOR,
  REDDIT_COMMENT_ROOT_SELECTOR,
  REDDIT_FEED_CARD_SELECTOR,
  REDDIT_LISTING_BODY_CONTAINER_SELECTOR,
  REDDIT_LISTING_TITLE_CONTAINER_SELECTOR,
  REDDIT_LISTING_TITLE_TEXT_SELECTOR,
  REDDIT_SEMANTIC_BLOCK_SELECTOR
} from "../siteProfiles/redditProfile";

type RedditAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

function getNormalizedText(element: HTMLElement | null): string {
  return normalizeText(element?.textContent);
}

function getNormalizedGroupedText(element: HTMLElement | null): string {
  if (!element) {
    return "";
  }

  const semanticChildren = Array.from(element.querySelectorAll<HTMLElement>(REDDIT_SEMANTIC_BLOCK_SELECTOR))
    .map((child) => getNormalizedText(child))
    .filter(Boolean);

  if (semanticChildren.length > 0) {
    return semanticChildren.join("\n\n");
  }

  return getNormalizedText(element);
}

function normalizePart(part: string) {
  return normalizeText(part);
}

function buildRedditRehydrateKey(page: PageClassification, parts: string[]) {
  return ["reddit", page.surface, ...parts.map(normalizePart).filter(Boolean)].join("|");
}

function getBodyBlockIndex(bodyElement: HTMLElement, element: HTMLElement) {
  const bodyBlocks = getDetailBodyBlocks(bodyElement);
  const blockIndex = bodyBlocks.indexOf(element);
  return blockIndex >= 0 ? blockIndex : 0;
}

function getDetailBodyBlocks(bodyElement: HTMLElement): HTMLElement[] {
  const semanticBlocks = Array.from(bodyElement.querySelectorAll<HTMLElement>(REDDIT_SEMANTIC_BLOCK_SELECTOR));

  return semanticBlocks.filter((block) => {
    const semanticAncestor = block.parentElement?.closest<HTMLElement>(REDDIT_SEMANTIC_BLOCK_SELECTOR);
    return semanticAncestor == null || !bodyElement.contains(semanticAncestor);
  });
}

function getListingTitleContainer(feedCard: HTMLElement): HTMLElement | null {
  return feedCard.querySelector<HTMLElement>(REDDIT_LISTING_TITLE_CONTAINER_SELECTOR);
}

function getListingTitleTextElement(feedCard: HTMLElement): HTMLElement | null {
  const titleContainer = getListingTitleContainer(feedCard);
  return titleContainer?.querySelector<HTMLElement>(REDDIT_LISTING_TITLE_TEXT_SELECTOR) ?? titleContainer;
}

function getListingBodyContainer(feedCard: HTMLElement): HTMLElement | null {
  return feedCard.querySelector<HTMLElement>(REDDIT_LISTING_BODY_CONTAINER_SELECTOR);
}

function getCommentBody(element: HTMLElement): {
  commentRoot: HTMLElement;
  commentBody: HTMLElement;
} | null {
  const commentRoot = element.closest<HTMLElement>(REDDIT_COMMENT_ROOT_SELECTOR);
  if (!commentRoot) {
    return null;
  }

  const commentBody = commentRoot.querySelector<HTMLElement>(REDDIT_COMMENT_BODY_SELECTOR);
  if (!commentBody) {
    return null;
  }

  return {
    commentRoot,
    commentBody
  };
}

function getCommentAnchorElement(commentBody: HTMLElement): HTMLElement {
  const semanticBlocks = Array.from(commentBody.querySelectorAll<HTMLElement>(REDDIT_COMMENT_ANCHOR_SELECTOR));
  return semanticBlocks.at(-1) ?? commentBody;
}

export function collectRedditSocialFeedCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: RedditAdapterHelpers
): CandidateBlock | null {
  const feedCard = element.closest<HTMLElement>(REDDIT_FEED_CARD_SELECTOR);
  if (!feedCard) {
    const comment = getCommentBody(element);
    if (!comment || page.surface !== "detail") {
      return null;
    }

    if (element !== comment.commentBody && !comment.commentBody.contains(element)) {
      return null;
    }

    const sourceText = getNormalizedGroupedText(comment.commentBody);
    if (!sourceText) {
      return null;
    }

    const commentThingId = comment.commentRoot.getAttribute("thingid") ?? sourceText;

    return {
      blockId: helpers.getStableBlockId(comment.commentBody),
      element: comment.commentBody,
      sourceText,
      rehydrateKey: buildRedditRehydrateKey(page, ["comment", commentThingId, sourceText]),
      renderHint: {
        anchorElement: getCommentAnchorElement(comment.commentBody),
        expansionRoot: comment.commentRoot
      }
    };
  }

  const titleElement = getListingTitleContainer(feedCard);
  const titleTextElement = getListingTitleTextElement(feedCard);
  const bodyElement = getListingBodyContainer(feedCard);

  if (page.surface === "listing") {
    if (titleElement && (element === titleElement || titleElement.contains(element))) {
      const sourceText = getNormalizedText(titleTextElement);
      if (!sourceText) {
        return null;
      }

      return {
        blockId: helpers.getStableBlockId(titleElement),
        element: titleElement,
        sourceText,
        rehydrateKey: buildRedditRehydrateKey(page, ["card-title", sourceText]),
        renderHint: {
          anchorElement: titleElement,
          expansionRoot: feedCard
        }
      };
    }

    if (bodyElement && (element === bodyElement || bodyElement.contains(element))) {
      const sourceText = getNormalizedGroupedText(bodyElement);
      if (!sourceText) {
        return null;
      }

      return {
        blockId: helpers.getStableBlockId(bodyElement),
        element: bodyElement,
        sourceText,
        rehydrateKey: buildRedditRehydrateKey(page, ["card-body", ...sourceText.split("\n\n")]),
        renderHint: {
          anchorElement: bodyElement,
          expansionRoot: feedCard
        }
      };
    }

    return null;
  }

  if (page.surface !== "detail") {
    return null;
  }

  const sourceText = getNormalizedText(element);
  if (!sourceText) {
    return null;
  }

  if (titleElement && (element === titleElement || titleElement.contains(element))) {
    const sourceText = getNormalizedText(titleTextElement);
    if (!sourceText) {
      return null;
    }

    return {
      blockId: helpers.getStableBlockId(titleElement),
      element: titleElement,
      sourceText,
      rehydrateKey: buildRedditRehydrateKey(page, ["post-title", sourceText]),
      renderHint: {
        anchorElement: titleElement,
        expansionRoot: feedCard
      }
    };
  }

  if (bodyElement) {
    const detailBodyBlocks = getDetailBodyBlocks(bodyElement);

    if (detailBodyBlocks.length === 0 && element === bodyElement) {
      return {
        blockId: helpers.getStableBlockId(bodyElement),
        element: bodyElement,
        sourceText: getNormalizedText(bodyElement),
        rehydrateKey: buildRedditRehydrateKey(page, ["post-body", "0", getNormalizedText(bodyElement)]),
        renderHint: {
          expansionRoot: feedCard
        }
      };
    }

    if (!detailBodyBlocks.includes(element)) {
      return null;
    }

    return {
      blockId: helpers.getStableBlockId(element),
      element,
      sourceText,
      rehydrateKey: buildRedditRehydrateKey(page, [
        "post-body",
        String(getBodyBlockIndex(bodyElement, element)),
        sourceText
      ]),
      renderHint: {
        expansionRoot: feedCard
      }
    };
  }

  return null;
}
