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

function normalizePart(part: string) {
  return part.replace(/\s+/g, " ").trim();
}

function buildRedditRehydrateKey(page: PageClassification, parts: string[]) {
  return ["reddit", page.surface, ...parts.map(normalizePart).filter(Boolean)].join("|");
}

function getBodyBlockIndex(bodyElement: HTMLElement, element: HTMLElement) {
  const bodyBlocks = Array.from(bodyElement.querySelectorAll<HTMLElement>("p, li, blockquote"));
  const blockIndex = bodyBlocks.indexOf(element);
  return blockIndex >= 0 ? blockIndex : 0;
}

function getListingTitleContainer(feedCard: HTMLElement): HTMLElement | null {
  return feedCard.querySelector<HTMLElement>("[slot='title'], [data-post-click-location='title']");
}

function getListingTitleTextElement(feedCard: HTMLElement): HTMLElement | null {
  const titleContainer = getListingTitleContainer(feedCard);
  return titleContainer?.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6") ?? titleContainer;
}

function getListingBodyContainer(feedCard: HTMLElement): HTMLElement | null {
  return feedCard.querySelector<HTMLElement>("[slot='text-body'], [data-post-click-location='text-body'], .md.feed-card-text-preview");
}

function getCommentBody(element: HTMLElement): {
  commentRoot: HTMLElement;
  commentBody: HTMLElement;
} | null {
  const commentRoot = element.closest<HTMLElement>("shreddit-comment");
  if (!commentRoot) {
    return null;
  }

  const commentBody = commentRoot.querySelector<HTMLElement>("[slot='comment'], .md[slot='comment']");
  if (!commentBody) {
    return null;
  }

  return {
    commentRoot,
    commentBody
  };
}

function getCommentAnchorElement(commentBody: HTMLElement): HTMLElement {
  const semanticBlocks = Array.from(commentBody.querySelectorAll<HTMLElement>("p, li, blockquote"));
  return semanticBlocks.at(-1) ?? commentBody;
}

export function collectRedditCandidateBlock(
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
