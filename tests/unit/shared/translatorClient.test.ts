import { describe, expect, it, vi } from "vitest";

import { buildPersistedConfigRecord, DEFAULT_EXTENSION_CONFIG } from "../../../src/shared/config";
import { createMemoryStorageArea } from "../../../src/shared/storage";
import { PersistentTranslationCache } from "../../../src/shared/cacheStore";
import { createTranslatorClient } from "../../../src/shared/translatorClient";

describe("translator client", () => {
  it("returns provider translations when cache persistence fails", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ alpha: "第一段" })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const cache = new PersistentTranslationCache({
      get: async () => ({}),
      set: async () => {
        throw new Error("FILE_ERROR_NO_SPACE");
      }
    });
    const client = createTranslatorClient({ fetchImpl: fetchMock, cache });

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
    ).resolves.toEqual({ alpha: "第一段" });
  });

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
      expect(body.messages[0].content).toContain("Japanese");
      expect(body.messages[1].content).toContain("Japanese");
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
        translateShortContentBlocks: true,
        targetLanguage: "ja"
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

  it("accepts JSON wrapped in a markdown code fence", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "```json\n{\"alpha\":\"第一段\"}\n```"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
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
    ).resolves.toEqual({ alpha: "第一段" });
  });

  it("accepts fenced Gemini translation arrays keyed by block id", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n[{"blockId":"alpha","translation":"第一段"}]\n```'
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea())
    });

    await expect(
      client.translateBlocks({
        config: buildPersistedConfigRecord({
          provider: "google-gemini",
          apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          apiKey: "secret-key",
          model: "gemini-3.5-flash-lite",
          translateTitles: true,
          translateShortContentBlocks: true
        }),
        blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
      })
    ).resolves.toEqual({ alpha: "第一段" });
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
        model: "o3-mini",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
  });

  it("disables thinking for Nvidia reasoning models under OpenAI Compatible provider", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.extra_body).toEqual({
        chat_template_kwargs: {
          enable_thinking: false
        },
        reasoning_budget: 0
      });

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
        apiBaseUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
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
    ], "zh-CN");

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

  it("isolates cached translations by target language", async () => {
    const cache = new PersistentTranslationCache(createMemoryStorageArea());
    // Seed translation for "Hello world" to Japanese
    await cache.setMany(
      [
        {
          sourceText: "Hello world",
          translation: "こんにちは世界"
        }
      ],
      "ja"
    );

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alpha: "Hello world translated to French"
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
      cache
    });

    // 1. Request translation for French (should NOT hit Japanese cache, should make network request)
    const resultFr = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true,
        targetLanguage: "fr"
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(resultFr).toEqual({ alpha: "Hello world translated to French" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. Request translation for Japanese (should hit cache, should NOT make network request)
    const resultJa = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true,
        targetLanguage: "ja"
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(resultJa).toEqual({ alpha: "こんにちは世界" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1 from the French call

    // 3. Request translation for French again (should hit cache now, should NOT make network request)
    const resultFrCached = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true,
        targetLanguage: "fr"
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(resultFrCached).toEqual({ alpha: "Hello world translated to French" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1
  });

  it("does not fall back to generic cache when target language is specified", async () => {
    const cache = new PersistentTranslationCache(createMemoryStorageArea());
    // Seed generic translation (without target language)
    await cache.setMany([
      {
        sourceText: "Hello world",
        translation: "generic translation"
      }
    ]);

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alpha: "Bonjour le monde"
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
      cache
    });

    // Request translation for French (should NOT return generic translation, should hit network)
    const result = await client.translateBlocks({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "o3-mini",
        translateTitles: true,
        translateShortContentBlocks: true,
        targetLanguage: "fr"
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "Bonjour le monde" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
                  text: '{"alpha":"第'
                },
                {
                  type: "output_text",
                  text: '一段"}'
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
        apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3/responses",
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
      expect(body.model).toBe("gemini-3.5-flash-lite");
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
        model: "gemini-3.5-flash-lite",
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
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3/responses",
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
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
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
        model: "gemini-3.5-flash-lite",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
  });

  it("does not use thinking budget for Gemini 2.5 standard requests", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig).toBeUndefined();

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

  it("does not use thinking budget for Gemma 4 standard requests", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig).toBeUndefined();

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
        model: "gemma-4-31b-it",
        translateTitles: true,
        translateShortContentBlocks: true
      }),
      blocks: [{ blockId: "alpha", sourceText: "Hello world" }]
    });

    expect(result).toEqual({ alpha: "第一段" });
  });

  it("uses zero thinking budget for explicit thinking models", async () => {
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
        model: "gemini-2.0-flash-thinking-exp",
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
          model: "gemini-3.5-flash-lite",
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
          model: "gemini-3.5-flash-lite",
          translateTitles: true,
          translateShortContentBlocks: true
        })
      })
    ).rejects.toThrow(
      /network request to https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent failed/i
    );
  });

  it("builds a selection translation request and returns the resulting string", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5-mini");
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("translation");
      const userContent = JSON.parse(body.messages[1].content);
      expect(userContent.selectedText).toBe("bonjour");
      expect(userContent.surroundingContext).toBe("bonjour tout le monde");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "hello"
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

    const result = await client.translateOrExplainSelection({
      config: buildPersistedConfigRecord({
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true,
        targetLanguage: "en"
      }),
      action: "translate",
      selectionText: "bonjour",
      contextText: "bonjour tout le monde"
    });

    expect(result).toBe("hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("assembles and caches the complete Gemini explanation (legacy cache: %s)", async (hasLegacyCache) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
      );
      const body = JSON.parse(String(init?.body));
      expect(body.systemInstruction.parts[0].text).toContain("Explain");
      const userContent = JSON.parse(body.contents[0].parts[0].text);
      expect(userContent.selectedText).toBe("技术性调整");
      expect(userContent.surroundingContext).toBe("从高点回落超过 10%，通常称为技术性调整。");

      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  { text: "Consider the market context.", thought: true },
                  { text: "技术" },
                  { text: "性调整通常指市场从高点回落约 10%。" },
                  { text: "\n\n它描述的是价格回落幅度。" }
                ]
              }
            },
            { content: { parts: [{ text: "Alternative candidate" }] } }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const cache = new PersistentTranslationCache(createMemoryStorageArea());
    if (hasLegacyCache) {
      await cache.setMany([{ sourceText: "selection:explain:技术性调整", translation: "技术" }], "zh-CN");
    }
    const client = createTranslatorClient({ fetchImpl: fetchMock, cache });

    const input = {
      config: buildPersistedConfigRecord({
        provider: "google-gemini",
        apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "secret-key",
        model: "gemini-3.5-flash-lite",
        translateTitles: true,
        translateShortContentBlocks: true,
        debugMode: false,
        targetLanguage: "zh-CN"
      }),
      action: "explain" as const,
      selectionText: "技术性调整",
      contextText: "从高点回落超过 10%，通常称为技术性调整。"
    };

    const expected = "技术性调整通常指市场从高点回落约 10%。\n\n它描述的是价格回落幅度。";
    await expect(client.translateOrExplainSelection(input)).resolves.toBe(expected);
    await expect(client.translateOrExplainSelection(input)).resolves.toBe(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      provider: "openai-compatible",
      apiBaseUrl: "https://api.example.com/v1/chat/completions",
      incomplete: { choices: [{ finish_reason: "length", message: { content: "技术" } }] },
      complete: { choices: [{ finish_reason: "stop", message: { content: "完整解释" } }] }
    },
    {
      provider: "openai-compatible",
      apiBaseUrl: "https://api.example.com/v1/responses",
      incomplete: { status: "incomplete", output_text: "技术" },
      complete: { status: "completed", output_text: "完整解释" }
    },
    {
      provider: "google-gemini",
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      incomplete: {
        candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "技术" }] } }]
      },
      complete: {
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: "完整解释" }] } }]
      }
    }
  ] as const)("rejects and does not cache incomplete selection results from $apiBaseUrl", async ({
    provider,
    apiBaseUrl,
    incomplete,
    complete
  }) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(incomplete))
      .mockResolvedValueOnce(Response.json(complete));
    const client = createTranslatorClient({
      fetchImpl: fetchMock,
      cache: new PersistentTranslationCache(createMemoryStorageArea())
    });
    const input = {
      config: buildPersistedConfigRecord({
        ...DEFAULT_EXTENSION_CONFIG,
        provider,
        apiBaseUrl,
        apiKey: "secret-key",
        model: "test-model"
      }),
      action: "explain" as const,
      selectionText: "技术性调整",
      contextText: "股市中的技术性调整"
    };

    await expect(client.translateOrExplainSelection(input)).rejects.toThrow("模型未生成完整结果，请重试。");
    await expect(client.translateOrExplainSelection(input)).resolves.toBe("完整解释");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches selection translation/explanation results and returns them without calling API", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "cached-hello"
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

    const config = buildPersistedConfigRecord({
      provider: "openai-compatible",
      apiBaseUrl: "https://api.example.com/v1/chat/completions",
      apiKey: "secret-key",
      model: "gpt-5-mini",
      translateTitles: true,
      translateShortContentBlocks: true,
      targetLanguage: "ja"
    });

    // First call (cache miss)
    const result1 = await client.translateOrExplainSelection({
      config,
      action: "translate",
      selectionText: "hello",
      contextText: "hello world"
    });

    expect(result1).toBe("cached-hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call (cache hit)
    const result2 = await client.translateOrExplainSelection({
      config,
      action: "translate",
      selectionText: "hello",
      contextText: "hello world"
    });

    expect(result2).toBe("cached-hello");
    expect(fetchMock).toHaveBeenCalledTimes(1); // should still be 1 (no new fetch)
  });
});
