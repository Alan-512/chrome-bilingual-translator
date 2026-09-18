import { hashNormalizedText } from "./hashText";
import { type StorageAreaLike } from "./storage";
import { normalizeSourceText } from "./textNormalizer";

const CACHE_STORAGE_KEY = "translationCache";
const MAX_CACHE_BYTES = 8 * 1024 * 1024;

export type CachedTranslationRecord = {
  sourceText: string;
  translation: string;
};

type PersistedCache = Record<string, string>;

function getSerializedCacheSize(cache: PersistedCache) {
  return new TextEncoder().encode(JSON.stringify({ [CACHE_STORAGE_KEY]: cache })).byteLength;
}

function trimCacheToLimit(cache: PersistedCache): PersistedCache {
  const entries = Object.entries(cache);
  const completeCache = Object.fromEntries(entries);

  if (getSerializedCacheSize(completeCache) <= MAX_CACHE_BYTES) {
    return completeCache;
  }

  let minimumKeysToDrop = 0;
  let maximumKeysToDrop = entries.length;

  while (minimumKeysToDrop < maximumKeysToDrop) {
    const keysToDrop = Math.floor((minimumKeysToDrop + maximumKeysToDrop) / 2);
    const candidateCache = Object.fromEntries(entries.slice(keysToDrop));

    if (getSerializedCacheSize(candidateCache) <= MAX_CACHE_BYTES) {
      maximumKeysToDrop = keysToDrop;
    } else {
      minimumKeysToDrop = keysToDrop + 1;
    }
  }

  return Object.fromEntries(entries.slice(minimumKeysToDrop));
}

export class PersistentTranslationCache {
  private readonly storageArea: StorageAreaLike;

  constructor(storageArea: StorageAreaLike) {
    this.storageArea = storageArea;
  }

  async get(sourceText: string, targetLanguage?: string): Promise<string | null> {
    try {
      const cache = await this.loadCache();
      const normalizedSourceText = normalizeSourceText(sourceText);
      const hash = hashNormalizedText(normalizedSourceText);
      if (targetLanguage) {
        const key = `${targetLanguage}:${hash}`;
        return cache[key] ?? null;
      }
      return cache[hash] ?? null;
    } catch {
      // Persistent caching is an optimization; storage failures must not block translation.
      return null;
    }
  }

  async setMany(records: CachedTranslationRecord[], targetLanguage?: string): Promise<void> {
    try {
      const cache = await this.loadCache();

      for (const record of records) {
        const normalizedSourceText = normalizeSourceText(record.sourceText);
        const hash = hashNormalizedText(normalizedSourceText);
        const key = targetLanguage ? `${targetLanguage}:${hash}` : hash;
        delete cache[key];
        cache[key] = record.translation;
      }

      await this.storageArea.set({ [CACHE_STORAGE_KEY]: trimCacheToLimit(cache) });
    } catch {
      // Persistent caching is an optimization; storage failures must not block translation.
    }
  }

  private async loadCache(): Promise<PersistedCache> {
    const result = await this.storageArea.get(CACHE_STORAGE_KEY);
    const cache = result[CACHE_STORAGE_KEY];

    if (!cache || typeof cache !== "object") {
      return {};
    }

    return cache as PersistedCache;
  }
}
