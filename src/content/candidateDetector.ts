import { classifyPage } from "./pageClassifier";
import { allowGenericFallbackForPage, collectSiteCandidateBlock, shouldMergeGenericFallbackForPage } from "./siteAdapters";

export type CandidateBlock = {
  blockId: string;
  element: HTMLElement;
  sourceText: string;
  rehydrateKey?: string;
  renderHint?: {
    anchorElement?: HTMLElement;
    expansionRoot?: HTMLElement;
    skipLoadingPlaceholder?: boolean;
  };
};

const CONTENT_SELECTOR = [
  "p",
  "li",
  "blockquote",
  "table",
  "dl",
  "[role='table']",
  "[role='grid']",
  "figcaption",
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
const REDUNDANT_CONTAINER_SELECTOR = "p, li, blockquote, figcaption, h1, h2, h3, h4, h5, h6";
const STRUCTURED_ROOT_SELECTOR = "blockquote, table, dl, [role='table'], [role='grid']";
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

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function containsEquivalentText(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);

  if (!normalizedHaystack || !normalizedNeedle) {
    return false;
  }

  return normalizedHaystack.includes(normalizedNeedle);
}

function collectTableText(tableRoot: HTMLElement): string {
  const rows = Array.from(
    tableRoot.querySelectorAll<HTMLElement>(
      ":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr, :scope [role='row']"
    )
  );

  const normalizedRows = rows
    .map((row) => {
      const cells = Array.from(
        row.querySelectorAll<HTMLElement>(":scope > th, :scope > td, :scope > [role='rowheader'], :scope > [role='cell']")
      )
        .map((cell) => normalizeText(cell.textContent ?? ""))
        .filter(Boolean);

      if (cells.length === 2) {
        return `${cells[0]}: ${cells[1]}`;
      }

      return cells.join(" | ");
    })
    .filter(Boolean);

  return normalizedRows.join("\n\n");
}

function collectDescriptionListText(listRoot: HTMLElement): string {
  const directChildren = Array.from(listRoot.children) as HTMLElement[];
  const parts: string[] = [];
  let pendingTerm = "";

  directChildren.forEach((child) => {
    const text = normalizeText(child.textContent ?? "");
    if (!text) {
      return;
    }

    if (child.tagName === "DT") {
      pendingTerm = text;
      return;
    }

    if (child.tagName === "DD") {
      parts.push(pendingTerm ? `${pendingTerm}: ${text}` : text);
      pendingTerm = "";
    }
  });

  if (parts.length > 0) {
    return parts.join("\n\n");
  }

  return normalizeText(listRoot.textContent ?? "");
}

function collectNestedBlockquoteText(blockquoteRoot: HTMLElement): string {
  let sourceText = normalizeText(blockquoteRoot.textContent ?? "");
  const nestedStructuredRoots = Array.from(blockquoteRoot.querySelectorAll<HTMLElement>(STRUCTURED_ROOT_SELECTOR)).filter(
    (nestedRoot) => nestedRoot !== blockquoteRoot
  );

  nestedStructuredRoots.forEach((nestedRoot) => {
    const nestedText = normalizeText(nestedRoot.textContent ?? "");
    if (!nestedText) {
      return;
    }

    sourceText = normalizeText(sourceText.replace(nestedText, " "));
  });

  return sourceText;
}

function collectStructuredGenericCandidateBlock(element: HTMLElement): CandidateBlock | null {
  if (element.tagName === "TABLE" || element.getAttribute("role") === "table" || element.getAttribute("role") === "grid") {
    const sourceText = collectTableText(element);
    if (!sourceText) {
      return null;
    }

    return {
      blockId: getStableBlockId(element),
      element,
      sourceText
    };
  }

  if (element.tagName === "DL") {
    const sourceText = collectDescriptionListText(element);
    if (!sourceText) {
      return null;
    }

    return {
      blockId: getStableBlockId(element),
      element,
      sourceText
    };
  }

  if (element.tagName === "BLOCKQUOTE" && element.querySelector("blockquote") !== null) {
    const sourceText = collectNestedBlockquoteText(element);
    if (!sourceText) {
      return null;
    }

    return {
      blockId: getStableBlockId(element),
      element,
      sourceText
    };
  }

  return null;
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
  const groupedStructuredRootElements: HTMLElement[] = [];
  let matchedSiteCandidate = false;

  elements.forEach((element) => {
    if (isExtensionOwned(element) || isHidden(element)) {
      return;
    }

    const structuredGenericCandidate = collectStructuredGenericCandidateBlock(element);
    const enclosingStructuredRoot = element.closest<HTMLElement>(STRUCTURED_ROOT_SELECTOR);
    const isInsideCollectedStructuredRoot =
      !structuredGenericCandidate &&
      groupedStructuredRootElements.some(
        (structuredRoot) =>
          structuredRoot !== element && (structuredRoot.contains(element) || (enclosingStructuredRoot !== null && structuredRoot === enclosingStructuredRoot))
      );
    const isNestedGenericStructuredDescendant =
      page.site === "generic" &&
      !element.matches(STRUCTURED_ROOT_SELECTOR) &&
      enclosingStructuredRoot !== null &&
      enclosingStructuredRoot !== element;

    if (isInsideCollectedStructuredRoot || isNestedGenericStructuredDescendant) {
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

    if (structuredGenericCandidate) {
      if (looksLikeMostlyNumericText(structuredGenericCandidate.sourceText)) {
        return;
      }

      groupedStructuredRootElements.push(structuredGenericCandidate.element);
      genericCandidates.push(structuredGenericCandidate);
      return;
    }

    if (isInsideDisallowedAncestor(element) || isRedundantSlotContainer(element)) {
      return;
    }

    const sourceText = normalizeText(element.textContent ?? "");
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

  const filteredGenericCandidates = genericCandidates.filter((candidate) => {
    return genericCandidates.every((otherCandidate) => {
      if (otherCandidate === candidate) {
        return true;
      }

      if (!otherCandidate.element.matches(STRUCTURED_ROOT_SELECTOR)) {
        return true;
      }

      if (candidate.element === otherCandidate.element) {
        return true;
      }

      if (!otherCandidate.element.contains(candidate.element)) {
        return true;
      }

      return candidate.element.matches(STRUCTURED_ROOT_SELECTOR);
    });
  });

  if (matchedSiteCandidate) {
    if (shouldMergeGenericFallbackForPage(page)) {
      const mergedGenericCandidates = filteredGenericCandidates.filter((genericCandidate) => {
        if (page.site === "reddit" && page.surface === "detail" && genericCandidate.element.closest("shreddit-post") !== null) {
          return false;
        }

        if (
          page.site === "reddit" &&
          page.surface === "detail" &&
          siteCandidates.some(
            (siteCandidate) =>
              containsEquivalentText(genericCandidate.sourceText, siteCandidate.sourceText) &&
              (
                siteCandidate.sourceText.length >= 24 ||
                normalizeText(genericCandidate.sourceText) === normalizeText(siteCandidate.sourceText)
              )
          )
        ) {
          return false;
        }

        return siteCandidates.every((siteCandidate) => {
          if (siteCandidate.blockId === genericCandidate.blockId) {
            return false;
          }

          return !siteCandidate.element.contains(genericCandidate.element) && !genericCandidate.element.contains(siteCandidate.element);
        });
      });

      return [...siteCandidates, ...mergedGenericCandidates];
    }

    return siteCandidates;
  }

  if (!allowGenericFallbackForPage(page)) {
    return siteCandidates;
  }

  return filteredGenericCandidates;
}
