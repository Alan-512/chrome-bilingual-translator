import { BlockStateStore } from "./blockStateStore";
import { collectCandidateBlocks } from "./candidateDetector";
import { createObserverCoordinator } from "./observerCoordinator";
import { removeRenderedTranslations, renderTranslationBelow } from "./translationRenderer";
import { ensureStatusPill, updateStatusPill } from "./statusPill";

type ObserverCoordinatorLike = {
  start(candidates: HTMLElement[], callbacks: { onVisible: (elements: HTMLElement[]) => void; onMutation: () => void }): void;
  observeCandidates(candidates: HTMLElement[]): void;
  disconnect(): void;
};

type PageControllerDependencies = {
  requestTranslations: (blocks: Array<{ blockId: string; sourceText: string }>) => Promise<Record<string, string>>;
  reportPageState: (state: {
    enabled: boolean;
    translatedBlockCount: number;
    pendingRequestCount: number;
  }) => Promise<void>;
  createObserverCoordinator?: (doc: Document) => ObserverCoordinatorLike;
  isElementReadyForTranslation?: (element: HTMLElement) => boolean;
};

function isElementNearViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = element.ownerDocument.defaultView?.innerHeight ?? 0;
  const preloadMargin = 200;
  return rect.bottom >= -preloadMargin && rect.top <= viewportHeight + preloadMargin;
}

export function createPageController(doc: Document, dependencies: PageControllerDependencies) {
  const stateStore = new BlockStateStore();
  const statusPill = ensureStatusPill(doc);
  const observerCoordinator = (dependencies.createObserverCoordinator ?? createObserverCoordinator)(doc);
  const isElementReadyForTranslation = dependencies.isElementReadyForTranslation ?? isElementNearViewport;
  let active = false;
  let translatedBlockCount = 0;
  let isProcessing = false;
  let rescanQueued = false;
  let queuedElements: HTMLElement[] | null = null;

  function getEligibleCandidates(targetElements?: HTMLElement[]) {
    const targetSet = targetElements ? new Set(targetElements) : null;

    return collectCandidateBlocks(doc).filter((candidate) => {
      if (stateStore.has(candidate.blockId)) {
        return false;
      }

      if (targetSet && !targetSet.has(candidate.element)) {
        return false;
      }

      if (!targetSet && !isElementReadyForTranslation(candidate.element)) {
        return false;
      }

      return true;
    });
  }

  async function processCandidates(targetElements?: HTMLElement[]) {
    if (isProcessing) {
      rescanQueued = true;
      if (targetElements) {
        queuedElements = [...(queuedElements ?? []), ...targetElements];
      }
      return;
    }

    isProcessing = true;
    const candidates = getEligibleCandidates(targetElements);

    try {
      if (candidates.length === 0) {
        updateStatusPill(statusPill, { state: "translated", translatedBlockCount });
        await dependencies.reportPageState({
          enabled: active,
          translatedBlockCount,
          pendingRequestCount: 0
        });
        return;
      }

      observerCoordinator.observeCandidates(candidates.map((candidate) => candidate.element));
      candidates.forEach((candidate) => stateStore.set(candidate.blockId, "pending"));
      updateStatusPill(statusPill, { state: "translating", translatedBlockCount });

      let translations: Record<string, string>;
      try {
        translations = await dependencies.requestTranslations(
          candidates.map((candidate) => ({
            blockId: candidate.blockId,
            sourceText: candidate.sourceText
          }))
        );
      } catch (error) {
        candidates.forEach((candidate) => stateStore.set(candidate.blockId, "failed"));
        updateStatusPill(statusPill, {
          state: "error",
          translatedBlockCount,
          failedBlockCount: candidates.length,
          errorMessage: error instanceof Error ? error.message : "Translation request failed."
        });
        await dependencies.reportPageState({
          enabled: active,
          translatedBlockCount,
          pendingRequestCount: 0
        });
        return;
      }

      for (const candidate of candidates) {
        const translationText = translations[candidate.blockId];
        if (!translationText) {
          stateStore.set(candidate.blockId, "failed");
          continue;
        }

        renderTranslationBelow(candidate.element, {
          blockId: candidate.blockId,
          translationText
        });
        stateStore.set(candidate.blockId, "translated");
        translatedBlockCount += 1;
      }

      updateStatusPill(statusPill, {
        state: "translated",
        translatedBlockCount
      });
      await dependencies.reportPageState({
        enabled: active,
        translatedBlockCount,
        pendingRequestCount: 0
      });
    } finally {
      isProcessing = false;

      if (rescanQueued && active) {
        rescanQueued = false;
        const nextQueuedElements = queuedElements;
        queuedElements = null;
        await processCandidates(nextQueuedElements ?? undefined);
      }
    }
  }

  return {
    async activate() {
      if (!active) {
        active = true;
        await dependencies.reportPageState({
          enabled: true,
          translatedBlockCount,
          pendingRequestCount: 0
        });

        const initialCandidates = collectCandidateBlocks(doc);
        observerCoordinator.start(
          initialCandidates.map((candidate) => candidate.element),
          {
            onVisible: (elements) => {
              void processCandidates(elements);
            },
            onMutation: () => {
              const nextCandidates = collectCandidateBlocks(doc)
                .filter((candidate) => !stateStore.has(candidate.blockId))
                .map((candidate) => candidate.element);
              observerCoordinator.observeCandidates(nextCandidates);
            }
          }
        );

        await processCandidates(
          initialCandidates
            .map((candidate) => candidate.element)
            .filter((element) => isElementReadyForTranslation(element))
        );
        return;
      }

      await processCandidates();
    },

    async rescan() {
      if (!active) {
        return;
      }

      const nextCandidates = collectCandidateBlocks(doc)
        .filter((candidate) => !stateStore.has(candidate.blockId))
        .map((candidate) => candidate.element);
      observerCoordinator.observeCandidates(nextCandidates);
      await processCandidates();
    },

    async deactivate() {
      active = false;
      translatedBlockCount = 0;
      rescanQueued = false;
      queuedElements = null;
      observerCoordinator.disconnect();
      removeRenderedTranslations(doc);
      stateStore.clear();
      updateStatusPill(statusPill, { state: "idle", translatedBlockCount: 0 });
      await dependencies.reportPageState({
        enabled: false,
        translatedBlockCount,
        pendingRequestCount: 0
      });
    }
  };
}
