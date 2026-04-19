type CandidateBlock = {
  blockId: string;
  element: HTMLElement;
  sourceText: string;
};

const CONTENT_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6, [slot='title'], [slot='text-body']";
const DISALLOWED_ANCESTORS = ["nav", "header", "footer", "aside", "button"];
const SOURCE_ID_ATTRIBUTE = "data-bilingual-translator-source-id";
const REDUNDANT_CONTAINER_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
const REDDIT_FEED_CARD_SELECTOR = "shreddit-post";
let nextSourceId = 0;

function isExtensionOwned(element: Element): boolean {
  return element.closest("[data-bilingual-translator-owned='true']") !== null;
}

function isHidden(element: HTMLElement): boolean {
  return element.hidden || element.style.display === "none" || element.getAttribute("aria-hidden") === "true";
}

function isInsideDisallowedAncestor(element: Element): boolean {
  return DISALLOWED_ANCESTORS.some((selector) => element.closest(selector) !== null);
}

function isRedundantSlotContainer(element: HTMLElement): boolean {
  if (element.getAttribute("slot") !== "text-body") {
    return false;
  }

  return element.querySelector(REDUNDANT_CONTAINER_SELECTOR) !== null;
}

function looksLikeMostlyNumericText(text: string): boolean {
  const stripped = text.replace(/\s+/g, "");
  return /^[\d.,:+\-/%年月日点分秒]+(?:points?)?$/i.test(stripped);
}

function getStableBlockId(element: HTMLElement): string {
  const existingId = element.getAttribute(SOURCE_ID_ATTRIBUTE);
  if (existingId) {
    return existingId;
  }

  const nextId = `candidate-${nextSourceId}`;
  nextSourceId += 1;
  element.setAttribute(SOURCE_ID_ATTRIBUTE, nextId);
  return nextId;
}

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

function getGroupedRedditFeedCandidate(element: HTMLElement): CandidateBlock | null {
  const feedCard = element.closest<HTMLElement>(REDDIT_FEED_CARD_SELECTOR);
  if (!feedCard) {
    return null;
  }

  const titleElement = feedCard.querySelector<HTMLElement>("[slot='title']");
  const bodyElement = feedCard.querySelector<HTMLElement>("[slot='text-body']");
  const sourceParts = [getNormalizedText(titleElement), getNormalizedGroupedText(bodyElement)].filter(Boolean);
  const anchorElement = bodyElement ?? titleElement;

  if (!anchorElement || sourceParts.length === 0) {
    return null;
  }

  return {
    blockId: getStableBlockId(anchorElement),
    element: anchorElement,
    sourceText: sourceParts.join("\n\n")
  };
}

export function collectCandidateBlocks(root: ParentNode): CandidateBlock[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(CONTENT_SELECTOR));
  const candidates: CandidateBlock[] = [];
  const groupedFeedCardIds = new Set<string>();

  elements.forEach((element) => {
    if (isExtensionOwned(element) || isHidden(element) || isInsideDisallowedAncestor(element) || isRedundantSlotContainer(element)) {
      return;
    }

    const groupedFeedCard = getGroupedRedditFeedCandidate(element);
    if (groupedFeedCard) {
      if (groupedFeedCardIds.has(groupedFeedCard.blockId)) {
        return;
      }

      if (looksLikeMostlyNumericText(groupedFeedCard.sourceText)) {
        return;
      }

      groupedFeedCardIds.add(groupedFeedCard.blockId);
      candidates.push(groupedFeedCard);
      return;
    }

    const sourceText = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!sourceText) {
      return;
    }

    if (looksLikeMostlyNumericText(sourceText)) {
      return;
    }

    candidates.push({
      blockId: getStableBlockId(element),
      element,
      sourceText
    });
  });

  return candidates;
}
