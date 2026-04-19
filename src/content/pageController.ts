import { BlockStateStore } from "./blockStateStore";
import { collectCandidateBlocks } from "./candidateDetector";
import { createObserverCoordinator } from "./observerCoordinator";
import {
  removeRenderedTranslationBlock,
  removeRenderedTranslations,
  renderTranslationBelow,
  renderTranslationLoadingBelow
} from "./translationRenderer";
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

const TRANSLATION_BATCH_SIZE = 12;
const MAX_CONCURRENT_BATCHES = 2;

type CandidateBlock = ReturnType<typeof collectCandidateBlocks>[number];
type QueuedBatch = {
  candidates: CandidateBlock[];
  resolve: () => void;
};

async function safeReportPageState(
  dependencies: PageControllerDependencies,
  state: {
    enabled: boolean;
    translatedBlockCount: number;
    pendingRequestCount: number;
  }
) {
  try {
    await dependencies.reportPageState(state);
  } catch (error) {
    if (error instanceof Error && /Extension context invalidated/i.test(error.message)) {
      return;
    }

    throw error;
  }
}

function isElementNearViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = element.ownerDocument.defaultView?.innerHeight ?? 0;
  const preloadMargin = 200;
  return rect.bottom >= -preloadMargin && rect.top <= viewportHeight + preloadMargin;
}

function chunkBlocks<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function requestBatchRobust(
  dependencies: PageControllerDependencies,
  blocks: Array<{ blockId: string; sourceText: string }>
) {
  const translations: Record<string, string> = {};
  const failedBlockIds = new Set<string>();
  let lastError: Error | null = null;

  try {
    const batchTranslations = await dependencies.requestTranslations(blocks);

    for (const block of blocks) {
      const translationText = batchTranslations[block.blockId];
      if (translationText) {
        translations[block.blockId] = translationText;
      } else {
        failedBlockIds.add(block.blockId);
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error("Translation request failed.");

    for (const block of blocks) {
      try {
        const singleTranslation = await dependencies.requestTranslations([block]);
        const translationText = singleTranslation[block.blockId];
        if (translationText) {
          translations[block.blockId] = translationText;
        } else {
          failedBlockIds.add(block.blockId);
        }
      } catch (singleError) {
        lastError = singleError instanceof Error ? singleError : new Error("Translation request failed.");
        failedBlockIds.add(block.blockId);
      }
    }
  }

  return {
    translations,
    failedBlockIds,
    lastError
  };
}

export function createPageController(doc: Document, dependencies: PageControllerDependencies) {
  const stateStore = new BlockStateStore();
  const statusPill = ensureStatusPill(doc);
  const observerCoordinator = (dependencies.createObserverCoordinator ?? createObserverCoordinator)(doc);
  const isElementReadyForTranslation = dependencies.isElementReadyForTranslation ?? isElementNearViewport;
  let active = false;
  let translatedBlockCount = 0;
  let pendingBlockCount = 0;
  let inFlightBatchCount = 0;
  let lastError: Error | null = null;
  const failedBlockIds = new Set<string>();
  const queuedBatches: QueuedBatch[] = [];

  async function syncPageState() {
    updateStatusPill(
      statusPill,
      failedBlockIds.size > 0
        ? {
            state: "error",
            translatedBlockCount,
            failedBlockCount: failedBlockIds.size,
            errorMessage: lastError?.message
          }
        : pendingBlockCount > 0
          ? {
              state: "translating",
              translatedBlockCount
            }
          : {
              state: active ? "translated" : "idle",
              translatedBlockCount
            }
    );

    await safeReportPageState(dependencies, {
      enabled: active,
      translatedBlockCount,
      pendingRequestCount: pendingBlockCount
    });
  }

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

  async function processBatch(batch: CandidateBlock[]) {
    const batchResult = await requestBatchRobust(
      dependencies,
      batch.map((candidate) => ({
        blockId: candidate.blockId,
        sourceText: candidate.sourceText
      }))
    );
    lastError = batchResult.lastError ?? lastError;

    for (const candidate of batch) {
      const translationText = batchResult.translations[candidate.blockId];
      pendingBlockCount = Math.max(0, pendingBlockCount - 1);

      if (!translationText) {
        stateStore.set(candidate.blockId, "failed");
        removeRenderedTranslationBlock(doc, candidate.blockId);
        failedBlockIds.add(candidate.blockId);
        continue;
      }

      renderTranslationBelow(candidate.element, {
        blockId: candidate.blockId,
        translationText
      });
      failedBlockIds.delete(candidate.blockId);
      stateStore.set(candidate.blockId, "translated");
      translatedBlockCount += 1;
    }

    await syncPageState();
  }

  function drainQueuedBatches() {
    while (active && inFlightBatchCount < MAX_CONCURRENT_BATCHES && queuedBatches.length > 0) {
      const nextBatch = queuedBatches.shift();
      if (!nextBatch) {
        return;
      }

      inFlightBatchCount += 1;
      void processBatch(nextBatch.candidates)
        .finally(() => {
          inFlightBatchCount = Math.max(0, inFlightBatchCount - 1);
          nextBatch.resolve();
          drainQueuedBatches();
        });
    }
  }

  async function processCandidates(targetElements?: HTMLElement[]) {
    const candidates = getEligibleCandidates(targetElements);

    if (candidates.length === 0) {
      await syncPageState();
      return;
    }

    observerCoordinator.observeCandidates(candidates.map((candidate) => candidate.element));
    const batchPromises = chunkBlocks(candidates, TRANSLATION_BATCH_SIZE).map((candidateBatch) => {
      candidateBatch.forEach((candidate) => {
        stateStore.set(candidate.blockId, "pending");
        renderTranslationLoadingBelow(candidate.element, {
          blockId: candidate.blockId
        });
      });
      pendingBlockCount += candidateBatch.length;

      let resolveBatch = () => {};
      const batchPromise = new Promise<void>((resolve) => {
        resolveBatch = resolve;
      });
      queuedBatches.push({
        candidates: candidateBatch,
        resolve: resolveBatch
      });

      return batchPromise;
    });

    await syncPageState();
    drainQueuedBatches();

    await Promise.all(batchPromises);
  }

  return {
    async activate() {
      if (!active) {
        active = true;
        await safeReportPageState(dependencies, {
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
      pendingBlockCount = 0;
      inFlightBatchCount = 0;
      lastError = null;
      failedBlockIds.clear();
      queuedBatches.length = 0;
      observerCoordinator.disconnect();
      removeRenderedTranslations(doc);
      stateStore.clear();
      updateStatusPill(statusPill, { state: "idle", translatedBlockCount: 0 });
      await safeReportPageState(dependencies, {
        enabled: false,
        translatedBlockCount,
        pendingRequestCount: 0
      });
    }
  };
}
