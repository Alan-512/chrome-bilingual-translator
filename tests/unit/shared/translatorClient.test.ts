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
        provider: "openai-compatible",
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

  it("adds low reasoning effort for official OpenAI endpoints", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.reasoning).toEqual({ effort: "low" });

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alpha: "第一段"
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

    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://api.openai.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
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
          provider: "openai-compatible",
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
        provider: "openai-compatible",
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
          provider: "openai-compatible",
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

  it("supports base URLs that require the OpenAI responses endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://ark.cn-beijing.volces.com/api/v3/responses");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("ep-20260321184346-rlw84");
      expect(body.input[0].role).toBe("system");
      expect(body.input[1].content[0].type).toBe("input_text");

      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    alpha: "第一段"
                  })
                }
              ]
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

    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiKey: "secret-key",
        model: "ep-20260321184346-rlw84",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
  });

  it("avoids json_object response_format for Gemini OpenAI compatibility chat completions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gemini-3.1-flash-lite-preview");
      expect(body.response_format).toBeUndefined();
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("strict JSON object");
      expect(body.messages[1].content).toContain("\"blockId\": \"alpha\"");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alpha: "第一段"
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

    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        apiKey: "secret-key",
        model: "gemini-3.1-flash-lite-preview",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
  });

  it("surfaces a readable timeout error instead of the raw abort signal message", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("signal is aborted without reason"));
        });
      });
    });

    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea()),
      timeoutMs: 10
    });

    await expect(
      client.testConnection({
        config: buildPersistedConfigRecord({
          provider: "openai-compatible",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          apiKey: "secret-key",
          model: "ep-20260321184346-rlw84",
          translateTitles: true,
          translateShortContentBlocks: true
        })
      })
    ).rejects.toThrow(/timed out after 10ms/i);
  });

  it("surfaces a readable network error instead of the raw failed to fetch message", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea())
    });

    await expect(
      client.testConnection({
        config: buildPersistedConfigRecord({
          provider: "openai-compatible",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          apiKey: "secret-key",
          model: "ep-20260321184346-rlw84",
          translateTitles: true,
          translateShortContentBlocks: true
        })
      })
    ).rejects.toThrow(/network request to https:\/\/ark\.cn-beijing\.volces\.com\/api\/v3\/responses failed/i);
  });

  it("supports native Google Gemini generateContent requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent"
      );
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-goog-api-key": "secret-key"
      });
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
      expect(body.systemInstruction.parts[0].text).toContain("strict JSON object");
      expect(body.contents[0].parts[0].text).toContain("\"blockId\": \"alpha\"");

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      alpha: "第一段"
                    })
                  }
                ]
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

    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "google-gemini",
        apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "secret-key",
        model: "gemini-3.1-flash-lite-preview",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
  });

  it("uses zero thinking budget for Gemini 2.5 native requests", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      alpha: "第一段"
                    })
                  }
                ]
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

    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "google-gemini",
        apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "secret-key",
        model: "gemini-2.5-flash",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
  });

  it("surfaces Gemini HTTP error bodies instead of misclassifying them as network failures", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "Requested entity was not found.",
            status: "NOT_FOUND"
          }
        }),
        { status: 404, statusText: "Not Found", headers: { "Content-Type": "application/json" } }
      );
    });

    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea())
    });

    await expect(
      client.testConnection({
        config: buildPersistedConfigRecord({
          provider: "google-gemini",
          apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          apiKey: "secret-key",
          model: "gemini-3.1-flash-lite-preview",
          translateTitles: true,
          translateShortContentBlocks: true
        })
      })
    ).rejects.toThrow(/requested entity was not found/i);
  });

  it("surfaces Gemini network failures with the generateContent URL", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea())
    });

    await expect(
      client.testConnection({
        config: buildPersistedConfigRecord({
          provider: "google-gemini",
          apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          apiKey: "secret-key",
          model: "gemini-3.1-flash-lite-preview",
          translateTitles: true,
          translateShortContentBlocks: true
        })
      })
    ).rejects.toThrow(
      /network request to https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.1-flash-lite-preview:generateContent failed/i
    );
  });
});
