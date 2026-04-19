import { describe, expect, it, vi } from "vitest";

import { buildPersistedConfigRecord } from "../../../src/shared/config";
import { createMemoryStorageArea } from "../../../src/shared/storage";
import { SessionStorageTabSessionStore } from "../../../src/background/tabSessionStore";
import { createBackgroundMessageRouter } from "../../../src/background/messageRouter";

describe("background message router", () => {
  it("tests api connectivity with unsaved configuration", async () => {
    const testConnection = vi.fn(async () => undefined);
    const requestApiPermission = vi.fn(async () => true);
    const router = createBackgroundMessageRouter({
      loadConfig: async () =>
        buildPersistedConfigRecord({
          provider: "openai-compatible",
          apiBaseUrl: "",
          apiKey: "",
          model: "",
          translateTitles: true,
          translateShortContentBlocks: true
        }),
      translator: {
        translateBlocks: vi.fn(),
        testConnection
      },
      requestApiPermission,
      tabSessionStore: new SessionStorageTabSessionStore(createMemoryStorageArea())
    });

    const result = await router.handleMessage(
      {
        type: "api/test",
        config: {
          provider: "openai-compatible",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          apiKey: "secret-key",
          model: "ep-20260321184346-rlw84",
          translateTitles: true,
          translateShortContentBlocks: true
        }
      },
      {}
    );

    expect(result).toEqual({ ok: true });
    expect(requestApiPermission).toHaveBeenCalledWith("https://ark.cn-beijing.volces.com");
    expect(testConnection).toHaveBeenCalledTimes(1);
  });

  it("routes translation requests and updates tab session counts", async () => {
    const translateBlocks = vi.fn(async () => ({
      alpha: "第一段"
    }));
    const testConnection = vi.fn(async () => undefined);
    const requestApiPermission = vi.fn(async () => true);
    const store = new SessionStorageTabSessionStore(createMemoryStorageArea());

    const router = createBackgroundMessageRouter({
      loadConfig: async () =>
        buildPersistedConfigRecord({
          provider: "openai-compatible",
          apiBaseUrl: "https://api.example.com/v1/chat/completions",
          apiKey: "secret-key",
          model: "gpt-5-mini",
          translateTitles: true,
          translateShortContentBlocks: true
        }),
      translator: { translateBlocks, testConnection },
      requestApiPermission,
      tabSessionStore: store
    });

    const result = await router.handleMessage(
      {
        type: "translation/request",
        tabId: 8,
        blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
      },
      { tab: { id: 8 } }
    );

    expect(result).toEqual({
      ok: true,
      translations: {
        alpha: "第一段"
      }
    });
    expect(requestApiPermission).toHaveBeenCalledWith("https://api.example.com");
    expect(translateBlocks).toHaveBeenCalledTimes(1);
    await expect(store.get(8)).resolves.toMatchObject({
      enabled: true,
      translatedBlockCount: 1
    });
  });

  it("rejects translation requests when required config is missing", async () => {
    const router = createBackgroundMessageRouter({
      loadConfig: async () =>
        buildPersistedConfigRecord({
          provider: "openai-compatible",
          apiBaseUrl: "",
          apiKey: "",
          model: "",
          translateTitles: true,
          translateShortContentBlocks: true
        }),
      translator: {
        translateBlocks: vi.fn(),
        testConnection: vi.fn(async () => undefined)
      },
      requestApiPermission: vi.fn(async () => true),
      tabSessionStore: new SessionStorageTabSessionStore(createMemoryStorageArea())
    });

    await expect(
      router.handleMessage(
        {
          type: "translation/request",
          tabId: 8,
          blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
        },
        { tab: { id: 8 } }
      )
    ).rejects.toThrow(/Missing required configuration/);
  });

  it("rejects remote HTTP API URLs before requesting translation", async () => {
    const translateBlocks = vi.fn();
    const requestApiPermission = vi.fn(async () => true);
    const router = createBackgroundMessageRouter({
      loadConfig: async () =>
        buildPersistedConfigRecord({
          provider: "openai-compatible",
          apiBaseUrl: "http://api.example.com/v1/chat/completions",
          apiKey: "secret-key",
          model: "gpt-5-mini",
          translateTitles: true,
          translateShortContentBlocks: true
        }),
      translator: {
        translateBlocks,
        testConnection: vi.fn(async () => undefined)
      },
      requestApiPermission,
      tabSessionStore: new SessionStorageTabSessionStore(createMemoryStorageArea())
    });

    await expect(
      router.handleMessage(
        {
          type: "translation/request",
          tabId: 8,
          blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
        },
        { tab: { id: 8 } }
      )
    ).rejects.toThrow(/HTTPS/);
    expect(requestApiPermission).not.toHaveBeenCalled();
    expect(translateBlocks).not.toHaveBeenCalled();
  });
});
