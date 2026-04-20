import type { CandidateBlock } from "../candidateDetector";
import type { PageClassification } from "../pageClassifier";

const OPENROUTER_ALLOWED_ROOT_SELECTOR = [
  ".model-card",
  "[data-testid='model-card']",
  "[data-testid='model-list-item']",
  "[data-or-route='model-card']"
].join(", ");

type OpenRouterAdapterHelpers = {
  getStableBlockId: (element: HTMLElement) => string;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function extractVisibleTitleText(element: HTMLElement): string {
  const childSpans = Array.from(element.querySelectorAll<HTMLElement>("span"));
  const firstLongSpan = childSpans
    .map((span) => normalizeText(span.textContent ?? ""))
    .find((text) => text.length > 0 && normalizeText(element.textContent ?? "").includes(text));

  return firstLongSpan ?? normalizeText(element.textContent ?? "");
}

function getModelDetailLinks(root: HTMLElement): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((link) => {
    const href = link.getAttribute("href") ?? "";
    return /^\/[^/]+\/[^/]+/.test(href);
  });
}

function resolveExpansionRoot(root: HTMLElement): HTMLElement {
  return root.closest<HTMLElement>("li[style*='translateY']") ?? root.closest<HTMLElement>("li") ?? root;
}

export function collectOpenRouterCandidateBlock(
  element: HTMLElement,
  page: PageClassification,
  helpers: OpenRouterAdapterHelpers
): CandidateBlock | null {
  if (page.site !== "openrouter") {
    return null;
  }

  const allowedRoot = element.closest<HTMLElement>(OPENROUTER_ALLOWED_ROOT_SELECTOR);
  if (!allowedRoot) {
    return null;
  }

  const modelDetailLinks = getModelDetailLinks(allowedRoot);
  if (modelDetailLinks.length > 0 && element.tagName === "A") {
    const linkIndex = modelDetailLinks.indexOf(element as HTMLAnchorElement);
    if (linkIndex < 0) {
      return null;
    }

    const sourceText = linkIndex === 0 ? extractVisibleTitleText(element) : normalizeText(element.textContent ?? "");
    if (!sourceText) {
      return null;
    }

    return {
      blockId: helpers.getStableBlockId(element),
      element,
      sourceText,
      rehydrateKey: `openrouter|${page.surface}|${normalizeText(sourceText)}`,
      renderHint: {
        anchorElement: allowedRoot,
        expansionRoot: resolveExpansionRoot(allowedRoot)
      }
    };
  }

  const sourceText = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!sourceText) {
    return null;
  }

  const summaryElement = allowedRoot.querySelector<HTMLElement>("p, li, blockquote");
  const isTitleElement = /^H[1-6]$/.test(element.tagName);

  return {
    blockId: helpers.getStableBlockId(element),
    element,
    sourceText,
    rehydrateKey: `openrouter|${page.surface}|${normalizeText(sourceText)}`,
    renderHint: {
      anchorElement: isTitleElement ? summaryElement ?? undefined : undefined,
      expansionRoot: resolveExpansionRoot(allowedRoot)
    }
  };
}
