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
  debugLog?: (event: string, detail?: Record<string, unknown>) => void;
};

const TRANSLATION_BATCH_SIZE = 12;
const MAX_CONCURRENT_BATCHES = 2;

type CandidateBlock = ReturnType<typeof collectCandidateBlocks>[number];
type QueuedBatch = {
  candidates: CandidateBlock[];
  resolve: () => void;
};

function normalizeSourceText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getCandidateSignature(candidate: { element: HTMLElement; sourceText: string }) {
  const slotName = candidate.element.getAttribute("slot") ?? "";
  return `${candidate.element.tagName}|${slotName}|${normalizeSourceText(candidate.sourceText)}`;
}

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
  const debugLog = dependencies.debugLog ?? (() => {});
  let active = false;
  let translatedBlockCount = 0;
  let pendingBlockCount = 0;
  let inFlightBatchCount = 0;
  let lastError: Error | null = null;
  const failedBlockIds = new Set<string>();
  const queuedBatches: QueuedBatch[] = [];
  const translationMemory = new Map<string, string>();
  const inFlightSignatures = new Set<string>();

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
      const currentState = stateStore.get(candidate.blockId);
      if (currentState === "queued" || currentState === "pending" || currentState === "translated") {
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
    debugLog("batch/request", {
      batchSize: batch.length,
      blockIds: batch.map((candidate) => candidate.blockId)
    });
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
        inFlightSignatures.delete(getCandidateSignature(candidate));
        debugLog("block/failed", {
          blockId: candidate.blockId,
          signature: getCandidateSignature(candidate),
          sourceText: candidate.sourceText
        });
        continue;
      }

      renderTranslationBelow(candidate.element, {
        blockId: candidate.blockId,
        translationText,
        sourceText: candidate.sourceText,
        anchorElement: candidate.renderHint?.anchorElement,
        expansionRoot: candidate.renderHint?.expansionRoot
      });
      translationMemory.set(getCandidateSignature(candidate), translationText);
      inFlightSignatures.delete(getCandidateSignature(candidate));
      failedBlockIds.delete(candidate.blockId);
      stateStore.set(candidate.blockId, "translated");
      translatedBlockCount += 1;
      debugLog("block/translated", {
        blockId: candidate.blockId,
        signature: getCandidateSignature(candidate),
        sourceText: candidate.sourceText,
        translationText
      });
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
    debugLog("candidates/collected", {
      requestedTargetCount: targetElements?.length ?? 0,
      eligibleCount: candidates.length,
      blockIds: candidates.map((candidate) => candidate.blockId)
    });

    if (candidates.length === 0) {
      await syncPageState();
      return;
    }

    const candidatesNeedingRequests: CandidateBlock[] = [];

    for (const candidate of candidates) {
      const cachedTranslation = translationMemory.get(getCandidateSignature(candidate));
      if (!cachedTranslation) {
        if (inFlightSignatures.has(getCandidateSignature(candidate))) {
          debugLog("candidate/skipped-inflight-duplicate", {
            blockId: candidate.blockId,
            signature: getCandidateSignature(candidate),
            sourceText: candidate.sourceText
          });
          continue;
        }

        inFlightSignatures.add(getCandidateSignature(candidate));
        candidatesNeedingRequests.push(candidate);
        debugLog("candidate/queued", {
          blockId: candidate.blockId,
          signature: getCandidateSignature(candidate),
          sourceText: candidate.sourceText
        });
        continue;
      }

      renderTranslationBelow(candidate.element, {
        blockId: candidate.blockId,
        translationText: cachedTranslation,
        sourceText: candidate.sourceText,
        anchorElement: candidate.renderHint?.anchorElement,
        expansionRoot: candidate.renderHint?.expansionRoot
      });
      stateStore.set(candidate.blockId, "translated");
      debugLog("candidate/rehydrated-from-memory", {
        blockId: candidate.blockId,
        signature: getCandidateSignature(candidate),
        sourceText: candidate.sourceText
      });
    }

    if (candidatesNeedingRequests.length === 0) {
      await syncPageState();
      return;
    }

    observerCoordinator.observeCandidates(candidatesNeedingRequests.map((candidate) => candidate.element));
    const batchPromises = chunkBlocks(candidatesNeedingRequests, TRANSLATION_BATCH_SIZE).map((candidateBatch) => {
      candidateBatch.forEach((candidate) => {
        stateStore.set(candidate.blockId, "pending");
        renderTranslationLoadingBelow(candidate.element, {
          blockId: candidate.blockId,
          anchorElement: candidate.renderHint?.anchorElement,
          expansionRoot: candidate.renderHint?.expansionRoot
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
              const readyElements = nextCandidates.filter((element) => isElementReadyForTranslation(element));
              if (readyElements.length > 0) {
                void processCandidates(readyElements);
              }
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
      translationMemory.clear();
      inFlightSignatures.clear();
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
