import { classifyPage } from "./pageClassifier";
import { allowGenericFallbackForPage, collectSiteCandidateBlock } from "./siteAdapters";

export type CandidateBlock = {
  blockId: string;
  element: HTMLElement;
  sourceText: string;
  rehydrateKey?: string;
  renderHint?: {
    anchorElement?: HTMLElement;
    expansionRoot?: HTMLElement;
  };
};

const CONTENT_SELECTOR = [
  "p",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "[slot='title']",
  "[slot='text-body']",
  "[slot='comment']",
  "[data-post-click-location='title']",
  "[data-post-click-location='text-body']",
  ".VwiC3b",
  ".yXK7lf",
  ".MUxGbd",
  ".hgKElc",
  ".s3v9rd",
  ".related-question-pair [role='heading']",
  ".kp-wholepage [data-attrid='title']",
  ".kp-wholepage .kno-rdesc span",
  "[data-testid='model-list-item'] a[href]"
].join(", ");
const DISALLOWED_ANCESTORS = ["nav", "header", "footer", "aside", "button"];
const SOURCE_ID_ATTRIBUTE = "data-bilingual-translator-source-id";
const REDUNDANT_CONTAINER_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
let nextSourceId = 0;

function isExtensionOwned(element: Element): boolean {
  return element.closest("[data-bilingual-translator-owned='true']") !== null;
}

function isHidden(element: HTMLElement): boolean {
  if (element.hidden || element.style.display === "none" || element.getAttribute("aria-hidden") === "true") {
    return true;
  }

  return (
    element.closest<HTMLElement>("[hidden], [aria-hidden='true']") !== null ||
    element.closest<HTMLElement>("[style*='display: none']") !== null
  );
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

export function collectCandidateBlocks(root: ParentNode): CandidateBlock[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(CONTENT_SELECTOR));
  const doc = root instanceof Document ? root : root.ownerDocument;
  const page = classifyPage(doc);
  const siteCandidates: CandidateBlock[] = [];
  const genericCandidates: CandidateBlock[] = [];
  const groupedFeedCardIds = new Set<string>();
  let matchedSiteCandidate = false;

  elements.forEach((element) => {
    if (isExtensionOwned(element) || isHidden(element)) {
      return;
    }

    const groupedFeedCard = collectSiteCandidateBlock(element, page, {
      getStableBlockId
    });
    if (groupedFeedCard) {
      if (groupedFeedCardIds.has(groupedFeedCard.blockId)) {
        return;
      }

      if (looksLikeMostlyNumericText(groupedFeedCard.sourceText)) {
        return;
      }

      matchedSiteCandidate = true;
      groupedFeedCardIds.add(groupedFeedCard.blockId);
      siteCandidates.push(groupedFeedCard);
      return;
    }

    if (isInsideDisallowedAncestor(element) || isRedundantSlotContainer(element)) {
      return;
    }

    const sourceText = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!sourceText) {
      return;
    }

    if (looksLikeMostlyNumericText(sourceText)) {
      return;
    }

    genericCandidates.push({
      blockId: getStableBlockId(element),
      element,
      sourceText
    });
  });

  if (matchedSiteCandidate) {
    return siteCandidates;
  }

  if (!allowGenericFallbackForPage(page)) {
    return siteCandidates;
  }

  return genericCandidates;
}
