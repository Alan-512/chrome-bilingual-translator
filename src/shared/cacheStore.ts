import { hashNormalizedText } from "./hashText";
import { type StorageAreaLike } from "./storage";
import { normalizeSourceText } from "./textNormalizer";

const CACHE_STORAGE_KEY = "translationCache";

export type CachedTranslationRecord = {
  sourceText: string;
  translation: string;
};

type PersistedCache = Record<string, string>;

export class PersistentTranslationCache {
  private readonly storageArea: StorageAreaLike;

  constructor(storageArea: StorageAreaLike) {
    this.storageArea = storageArea;
  }

  async get(sourceText: string): Promise<string | null> {
    const cache = await this.loadCache();
    const normalizedSourceText = normalizeSourceText(sourceText);
    return cache[hashNormalizedText(normalizedSourceText)] ?? null;
  }

  async setMany(records: CachedTranslationRecord[]): Promise<void> {
    const cache = await this.loadCache();

    for (const record of records) {
      const normalizedSourceText = normalizeSourceText(record.sourceText);
      cache[hashNormalizedText(normalizedSourceText)] = record.translation;
    }

    await this.storageArea.set({ [CACHE_STORAGE_KEY]: cache });
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
