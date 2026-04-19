import { classifyPage } from "./pageClassifier";
import { collectRedditCandidateBlock } from "./siteAdapters/redditCandidateAdapter";

export type CandidateBlock = {
  blockId: string;
  element: HTMLElement;
  sourceText: string;
};

const CONTENT_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6, [slot='title'], [slot='text-body']";
const DISALLOWED_ANCESTORS = ["nav", "header", "footer", "aside", "button"];
const SOURCE_ID_ATTRIBUTE = "data-bilingual-translator-source-id";
const REDUNDANT_CONTAINER_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
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

export function collectCandidateBlocks(root: ParentNode): CandidateBlock[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(CONTENT_SELECTOR));
  const candidates: CandidateBlock[] = [];
  const groupedFeedCardIds = new Set<string>();
  const doc = root instanceof Document ? root : root.ownerDocument;
  const page = classifyPage(doc);

  elements.forEach((element) => {
    if (isExtensionOwned(element) || isHidden(element) || isInsideDisallowedAncestor(element) || isRedundantSlotContainer(element)) {
      return;
    }

    const groupedFeedCard =
      page.site === "reddit"
        ? collectRedditCandidateBlock(element, page, {
            getStableBlockId
          })
        : null;
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
