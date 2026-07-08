import { classifyPage } from "./pageClassifier";
import type { CandidateBlock } from "./candidateTypes";
import { isExtensionOwned, isHidden } from "./core/domVisibility";
import { looksLikeMostlyNumericText } from "./core/textUtils";
import {
  analyzeGenericSurfaceElement,
  allowGenericFallbackForPage,
  collectSurfaceCandidateBlock,
  createGenericSurfaceState,
  filterGenericSurfaceCandidates,
  filterMergedGenericFallbackCandidates,
  getCandidateContentSelector,
  rememberGenericStructuredRootCandidate,
  shouldMergeGenericFallbackForPage
} from "./surfaces";

export type { CandidateBlock };

const SOURCE_ID_ATTRIBUTE = "data-bilingual-translator-source-id";
let nextSourceId = 0;

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
  const matchedElements = new Set<HTMLElement>();
  const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument || document;
  const page = classifyPage(doc);
  const siteCandidates: CandidateBlock[] = [];
  const genericCandidates: CandidateBlock[] = [];
  const groupedFeedCardIds = new Set<string>();
  const genericSurfaceState = createGenericSurfaceState();
  let matchedSiteCandidate = false;
  const contentSelector = getCandidateContentSelector(page);

  function traverse(node: ParentNode) {
    if (node.nodeType === 1 && (node as Element).matches(contentSelector)) {
      matchedElements.add(node as HTMLElement);
    }

    const currentMatches = Array.from(node.querySelectorAll<HTMLElement>(contentSelector));
    currentMatches.forEach((el) => matchedElements.add(el));

    const allElements = Array.from(node.querySelectorAll<HTMLElement>("*"));
    allElements.forEach((el) => {
      if (el.shadowRoot) {
        traverse(el.shadowRoot);
      }
    });
  }

  traverse(root);

  matchedElements.forEach((element) => {
    if (isExtensionOwned(element) || isHidden(element)) {
      return;
    }

    const genericAnalysis = analyzeGenericSurfaceElement(
      element,
      page,
      {
        getStableBlockId
      },
      genericSurfaceState
    );

    if (genericAnalysis.skipRemainingElementWork) {
      return;
    }

    const groupedFeedCard = collectSurfaceCandidateBlock(element, page, {
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

    if (genericAnalysis.candidate) {
      if (looksLikeMostlyNumericText(genericAnalysis.candidate.sourceText)) {
        return;
      }

      if (genericAnalysis.isStructuredRootCandidate) {
        rememberGenericStructuredRootCandidate(genericAnalysis.candidate, genericSurfaceState);
      }

      genericCandidates.push(genericAnalysis.candidate);
    }
  });

  const filteredGenericCandidates = filterGenericSurfaceCandidates(genericCandidates);

  if (matchedSiteCandidate) {
    if (shouldMergeGenericFallbackForPage(page)) {
      const mergedGenericCandidates = filterMergedGenericFallbackCandidates(page, siteCandidates, filteredGenericCandidates);

      return [...siteCandidates, ...mergedGenericCandidates];
    }

    return siteCandidates;
  }

  if (!allowGenericFallbackForPage(page)) {
    return siteCandidates;
  }

  return filteredGenericCandidates;
}
