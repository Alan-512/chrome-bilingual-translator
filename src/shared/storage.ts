import { DEFAULT_EXTENSION_CONFIG, normalizeTargetLanguage, type ExtensionConfig } from "./config";

const CONFIG_STORAGE_KEY = "extensionConfig";

export type StorageRecord = Record<string, unknown>;

export type StorageAreaLike = {
  get(key: string): Promise<StorageRecord>;
  set(values: StorageRecord): Promise<void>;
};

export function createChromeStorageArea(storageArea: chrome.storage.StorageArea): StorageAreaLike {
  return {
    async get(key: string) {
      return storageArea.get(key);
    },
    async set(values: StorageRecord) {
      await storageArea.set(values);
    }
  };
}

export function createMemoryStorageArea(seed: StorageRecord = {}): StorageAreaLike {
  const state = new Map(Object.entries(seed));

  return {
    async get(key: string) {
      return state.has(key) ? { [key]: state.get(key) } : {};
    },
    async set(values: StorageRecord) {
      for (const [key, value] of Object.entries(values)) {
        state.set(key, value);
      }
    }
  };
}

export async function saveExtensionConfig(storageArea: StorageAreaLike, config: ExtensionConfig): Promise<void> {
  await storageArea.set({ [CONFIG_STORAGE_KEY]: config });
}

export async function loadExtensionConfig(storageArea: StorageAreaLike): Promise<ExtensionConfig> {
  const result = await storageArea.get(CONFIG_STORAGE_KEY);
  const config = result[CONFIG_STORAGE_KEY];

  if (!config || typeof config !== "object") {
    return DEFAULT_EXTENSION_CONFIG;
  }

  const mergedConfig = {
    ...DEFAULT_EXTENSION_CONFIG,
    ...(config as Partial<ExtensionConfig>)
  };

  return {
    ...mergedConfig,
    targetLanguage: normalizeTargetLanguage(mergedConfig.targetLanguage)
  };
}
