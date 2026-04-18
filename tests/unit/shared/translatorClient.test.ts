import { describe, expect, it, vi } from "vitest";

import { buildPersistedConfigRecord } from "../../../src/shared/config";
import { createMemoryStorageArea } from "../../../src/shared/storage";
import { PersistentTranslationCache } from "../../../src/shared/cacheStore";
import { createTranslatorClient } from "../../../src/shared/translatorClient";

describe("translator client", () => {
  it("builds an OpenAI-compatible request body and returns translations by block id", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key"
      });

      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5-mini");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].content).toContain("alpha");
      expect(body.messages[1].content).toContain("beta");
      expect(init?.signal).toBeInstanceOf(AbortSignal);

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alpha: "第一段",
                  beta: "第二段"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea()),
      timeoutMs: 2_000
    });

    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [
        { blockId: "alpha", sourceText: "Hello world" },
        { blockId: "beta", sourceText: "Another paragraph" }
      ]
    });

    expect(result).toEqual({
      alpha: "第一段",
      beta: "第二段"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the model response is missing a requested block id", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alpha: "只有一段"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea())
    });

    await expect(
      client.translateBlocks({
        config: buildPersistedConfigRecord({
          apiBaseUrl: "https://api.example.com/v1/chat/completions",
          apiKey: "secret-key",
          model: "gpt-5-mini",
          translateTitles: true,
          translateShortContentBlocks: true
        }),
        blocks: [
          { blockId: "alpha", sourceText: "Hello world" },
          { blockId: "beta", sourceText: "Another paragraph" }
        ]
      })
    ).rejects.toThrow(/Missing translations for block ids: beta/);
  });

  it("returns cached translations without hitting the network", async () => {
    const cache = new PersistentTranslationCache(createMemoryStorageArea());
    await cache.setMany([
      {
        sourceText: "Cached text",
        translation: "缓存文本"
      }
    ]);

    const fetchMock = vi.fn();
    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache
    });

    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Cached text" }]
    });

    expect(result).toEqual({ alpha: "缓存文本" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails fast on non-ok http responses", async () => {
    const fetchMock = vi.fn(async () => new Response("upstream failure", { status: 429, statusText: "Too Many Requests" }));

    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea())
    });

    await expect(
      client.translateBlocks({
        config: buildPersistedConfigRecord({
          apiBaseUrl: "https://api.example.com/v1/chat/completions",
          apiKey: "secret-key",
          model: "gpt-5-mini",
          translateTitles: true,
          translateShortContentBlocks: true
        }),
        blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
      })
    ).rejects.toThrow(/429/);
  });
});
