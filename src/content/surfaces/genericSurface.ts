import type { CandidateBlock } from "../candidateTypes";
import {
  collectDescriptionListText,
  collectNestedBlockquoteText,
  collectTableText,
  STRUCTURED_ROOT_SELECTOR
} from "../core/structuredText";
import { containsEquivalentText, normalizeText } from "../core/textUtils";
import type { PageClassification } from "../pageClassifier";

export const GENERIC_CONTENT_SELECTOR = [
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
  "[data-as='p']",
  "[data-as='li']",
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

const DISALLOWED_ANCESTORS = ["nav", "footer", "aside", "button"];
const REDUNDANT_CONTAINER_SELECTOR = "p, li, blockquote, figcaption, h1, h2, h3, h4, h5, h6, [data-as='p'], [data-as='li']";

type GenericSurfaceHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

export type GenericSurfaceState = {
  groupedStructuredRootElements: HTMLElement[];
};

export type GenericSurfaceElementAnalysis = {
  candidate: CandidateBlock | null;
  isStructuredRootCandidate: boolean;
  skipRemainingElementWork: boolean;
};

export function createGenericSurfaceState(): GenericSurfaceState {
  return {
    groupedStructuredRootElements: []
  };
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

function collectStructuredGenericCandidateBlock(
  element: HTMLElement,
  helpers: GenericSurfaceHelpers
): CandidateBlock | null {
  if (element.tagName === "TABLE" || element.getAttribute("role") === "table" || element.getAttribute("role") === "grid") {
    const sourceText = collectTableText(element);
    if (!sourceText) {
      return null;
    }

    return {
      blockId: helpers.getStableBlockId(element),
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
      blockId: helpers.getStableBlockId(element),
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
      blockId: helpers.getStableBlockId(element),
      element,
      sourceText
    };
  }

  return null;
}

export function analyzeGenericSurfaceElement(
  element: HTMLElement,
  page: PageClassification,
  helpers: GenericSurfaceHelpers,
  state: GenericSurfaceState
): GenericSurfaceElementAnalysis {
  const structuredGenericCandidate = collectStructuredGenericCandidateBlock(element, helpers);
  const enclosingStructuredRoot = element.closest<HTMLElement>(STRUCTURED_ROOT_SELECTOR);
  const isInsideCollectedStructuredRoot =
    !structuredGenericCandidate &&
    state.groupedStructuredRootElements.some(
      (structuredRoot) =>
        structuredRoot !== element && (structuredRoot.contains(element) || (enclosingStructuredRoot !== null && structuredRoot === enclosingStructuredRoot))
    );
  const isNestedGenericStructuredDescendant =
    page.site === "generic" &&
    !element.matches(STRUCTURED_ROOT_SELECTOR) &&
    enclosingStructuredRoot !== null &&
    enclosingStructuredRoot !== element;

  if (isInsideCollectedStructuredRoot || isNestedGenericStructuredDescendant) {
    return {
      candidate: null,
      isStructuredRootCandidate: false,
      skipRemainingElementWork: true
    };
  }

  if (structuredGenericCandidate) {
    return {
      candidate: structuredGenericCandidate,
      isStructuredRootCandidate: true,
      skipRemainingElementWork: false
    };
  }

  if (isInsideDisallowedAncestor(element) || isRedundantSlotContainer(element)) {
    return {
      candidate: null,
      isStructuredRootCandidate: false,
      skipRemainingElementWork: false
    };
  }

  const sourceText = normalizeText(element.textContent);
  if (!sourceText) {
    return {
      candidate: null,
      isStructuredRootCandidate: false,
      skipRemainingElementWork: false
    };
  }

  return {
    candidate: {
      blockId: helpers.getStableBlockId(element),
      element,
      sourceText
    },
    isStructuredRootCandidate: false,
    skipRemainingElementWork: false
  };
}

export function rememberGenericStructuredRootCandidate(
  candidate: CandidateBlock,
  state: GenericSurfaceState
): void {
  state.groupedStructuredRootElements.push(candidate.element);
}

export function filterGenericSurfaceCandidates(genericCandidates: CandidateBlock[]): CandidateBlock[] {
  return genericCandidates.filter((candidate) => {
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
}

export function filterMergedGenericFallbackCandidates(
  page: PageClassification,
  siteCandidates: CandidateBlock[],
  genericCandidates: CandidateBlock[]
): CandidateBlock[] {
  return genericCandidates.filter((genericCandidate) => {
    if (page.site === "reddit" && page.surface === "detail" && genericCandidate.element.closest("shreddit-post") !== null) {
      return false;
    }

    if (
      page.site === "reddit" &&
      page.surface === "detail" &&
      siteCandidates.some(
        (siteCandidate) =>
          containsEquivalentText(genericCandidate.sourceText, siteCandidate.sourceText) &&
          (siteCandidate.sourceText.length >= 24 || normalizeText(genericCandidate.sourceText) === normalizeText(siteCandidate.sourceText))
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
}

