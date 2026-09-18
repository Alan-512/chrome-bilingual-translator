import { describe, expect, it, vi } from "vitest";

import { PersistentTranslationCache } from "../../../src/shared/cacheStore";

function createRecordingStorage(seed: Record<string, unknown> = {}) {
  const state = new Map(Object.entries(seed));

  return {
    get: vi.fn(async (key: string) => (state.has(key) ? { [key]: state.get(key) } : {})),
    set: vi.fn(async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        state.set(key, value);
      }
    }),
    read(key: string) {
      return state.get(key);
    }
  };
}

describe("PersistentTranslationCache", () => {
  it("treats storage read failures as cache misses", async () => {
    const storage = {
      get: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
      set: vi.fn(async () => {})
    };
    const cache = new PersistentTranslationCache(storage);

    await expect(cache.get("Hello world", "zh-CN")).resolves.toBeNull();
  });

  it("does not turn storage write failures into translation failures", async () => {
    const storage = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {
        throw new Error("FILE_ERROR_NO_SPACE");
      })
    };
    const cache = new PersistentTranslationCache(storage);

    await expect(
      cache.setMany([{ sourceText: "Hello world", translation: "你好，世界" }], "zh-CN")
    ).resolves.toBeUndefined();
  });

  it("keeps the serialized cache below the storage quota by evicting oldest entries", async () => {
    const storage = createRecordingStorage();
    const cache = new PersistentTranslationCache(storage);
    const largeTranslation = "x".repeat(6_000_000);

    await cache.setMany([{ sourceText: "old text", translation: largeTranslation }], "zh-CN");
    await cache.setMany([{ sourceText: "new text", translation: largeTranslation }], "zh-CN");

    const persistedCache = storage.read("translationCache") as Record<string, string>;
    const serializedBytes = new TextEncoder().encode(JSON.stringify({ translationCache: persistedCache })).byteLength;

    expect(serializedBytes).toBeLessThan(10 * 1024 * 1024);
    await expect(cache.get("old text", "zh-CN")).resolves.toBeNull();
    await expect(cache.get("new text", "zh-CN")).resolves.toBe(largeTranslation);
  });
});
