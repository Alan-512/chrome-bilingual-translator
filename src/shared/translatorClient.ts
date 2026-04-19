import { type ExtensionConfig } from "./config";
import { type PersistentTranslationCache } from "./cacheStore";
import { buildTranslationMessages, type TranslationPromptBlock } from "./promptBuilder";

export type TranslationBlockInput = TranslationPromptBlock;

export type TranslatorClient = {
  translateBlocks(input: {
    config: ExtensionConfig;
    blocks: TranslationBlockInput[];
  }): Promise<Record<string, string>>;
  testConnection(input: {
    config: ExtensionConfig;
  }): Promise<void>;
};

type CreateTranslatorClientOptions = {
  fetchImpl: typeof fetch;
  cache: PersistentTranslationCache;
  timeoutMs?: number;
};

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

async function readApiErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as
      | { error?: { message?: string } }
      | { error?: { message?: string; status?: string; details?: unknown[] } };
    const message = payload.error?.message?.trim();
    if (message) {
      return message;
    }
  } catch {
    // ignore non-json error bodies
  }

  try {
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
    // ignore unreadable bodies
  }

  return `Translation request failed with ${response.status} ${response.statusText}`.trim();
}

function parseTranslationPayload(content: string, expectedBlockIds: string[]): Record<string, string> {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const missingBlockIds = expectedBlockIds.filter((blockId) => typeof parsed[blockId] !== "string");

  if (missingBlockIds.length > 0) {
    throw new Error(`Missing translations for block ids: ${missingBlockIds.join(", ")}`);
  }

  return Object.fromEntries(expectedBlockIds.map((blockId) => [blockId, String(parsed[blockId])]));
}

function resolveApiMode(apiBaseUrl: string) {
  const normalized = apiBaseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return { mode: "chat" as const, url: normalized };
  }

  if (normalized.endsWith("/responses")) {
    return { mode: "responses" as const, url: normalized };
  }

  return { mode: "responses" as const, url: `${normalized}/responses` };
}

function isGeminiOpenAiCompatibilityUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "generativelanguage.googleapis.com" &&
      parsed.pathname.includes("/openai/")
    );
  } catch {
    return false;
  }
}

function isOpenAiOfficialUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "api.openai.com";
  } catch {
    return false;
  }
}

function buildGeminiThinkingConfig(model: string) {
  if (/^gemini-3/i.test(model)) {
    return {
      thinkingConfig: {
        thinkingLevel: "minimal"
      }
    };
  }

  if (/^gemini-2\.5/i.test(model)) {
    return {
      thinkingConfig: {
        thinkingBudget: 0
      }
    };
  }

  return undefined;
}

function buildResponsesApiInput(blocks: TranslationBlockInput[]) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "You are a translation engine. Detect the source language automatically and translate every block to Simplified Chinese. Return a strict JSON object mapping each blockId to its translated string."
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(
            {
              task: "Translate the following content blocks into Simplified Chinese.",
              blocks
            },
            null,
            2
          )
        }
      ]
    }
  ];
}

function extractResponsesApiText(responseBody: ResponsesApiResponse): string | null {
  if (typeof responseBody.output_text === "string" && responseBody.output_text.trim()) {
    return responseBody.output_text;
  }

  for (const outputItem of responseBody.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (typeof contentItem.text === "string" && contentItem.text.trim()) {
        return contentItem.text;
      }
    }
  }

  return null;
}

function buildApiTestRequest(config: ExtensionConfig) {
  if (config.provider === "google-gemini") {
    const normalized = config.apiBaseUrl.replace(/\/+$/, "");
    return {
      mode: "gemini" as const,
      url: `${normalized}/models/${config.model}:generateContent`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey
      },
      body: {
        ...(buildGeminiThinkingConfig(config.model)
          ? {
              generationConfig: buildGeminiThinkingConfig(config.model)
            }
          : {}),
        contents: [
          {
            parts: [{ text: 'Reply with "OK" only.' }]
          }
        ]
      }
    };
  }

  const resolvedApi = resolveApiMode(config.apiBaseUrl);

  return {
    ...resolvedApi,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body:
      resolvedApi.mode === "chat"
        ? {
            model: config.model,
            max_tokens: 8,
            messages: [
              {
                role: "user",
                content: 'Reply with "OK" only.'
              }
            ]
          }
        : {
            model: config.model,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: 'Reply with "OK" only.'
                  }
                ]
              }
            ]
          }
  };
}

function buildGeminiTranslationBody(model: string, blocks: TranslationBlockInput[]) {
  return {
    ...(buildGeminiThinkingConfig(model)
      ? {
          generationConfig: buildGeminiThinkingConfig(model)
        }
      : {}),
    systemInstruction: {
      parts: [
        {
          text:
            "You are a translation engine. Detect the source language automatically and translate every block to Simplified Chinese. Return a strict JSON object mapping each blockId to its translated string."
        }
      ]
    },
    contents: [
      {
        parts: [
          {
            text: JSON.stringify(
              {
                task: "Translate the following content blocks into Simplified Chinese.",
                blocks
              },
              null,
              2
            )
          }
        ]
      }
    ]
  };
}

function extractGeminiText(responseBody: GeminiGenerateContentResponse): string | null {
  for (const candidate of responseBody.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  return null;
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return false;
}

function toTimeoutErrorMessage(timeoutMs: number) {
  const seconds = timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)}s` : `${timeoutMs}ms`;
  return `API request timed out after ${seconds}.`;
}

function toNetworkErrorMessage(url: string) {
  return `Network request to ${url} failed before receiving a response. Check whether this API host is reachable and not blocked by proxy, firewall, DNS, or TLS issues.`;
}

export function createTranslatorClient(options: CreateTranslatorClientOptions): TranslatorClient {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    async translateBlocks({ config, blocks }) {
      const result: Record<string, string> = {};
      const uncachedBlocks: TranslationBlockInput[] = [];

      for (const block of blocks) {
        const cachedTranslation = await options.cache.get(block.sourceText);
        if (cachedTranslation) {
          result[block.blockId] = cachedTranslation;
          continue;
        }

        uncachedBlocks.push(block);
      }

      if (uncachedBlocks.length === 0) {
        return result;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const request =
          config.provider === "google-gemini"
            ? {
                mode: "gemini" as const,
                url: `${config.apiBaseUrl.replace(/\/+$/, "")}/models/${config.model}:generateContent`,
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": config.apiKey
                },
                body: buildGeminiTranslationBody(config.model, uncachedBlocks)
              }
            : (() => {
                const resolvedApi = resolveApiMode(config.apiBaseUrl);
                const isGeminiChatMode = resolvedApi.mode === "chat" && isGeminiOpenAiCompatibilityUrl(resolvedApi.url);

                return {
                  mode: resolvedApi.mode,
                  url: resolvedApi.url,
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${config.apiKey}`
                  },
                  body:
                    resolvedApi.mode === "chat"
                      ? {
                          model: config.model,
                          ...(isOpenAiOfficialUrl(resolvedApi.url)
                            ? {
                                reasoning: {
                                  effort: "low"
                                }
                              }
                            : {}),
                          ...(isGeminiChatMode
                            ? {}
                            : {
                                response_format: {
                                  type: "json_object"
                                }
                              }),
                          messages: buildTranslationMessages(uncachedBlocks)
                        }
                      : {
                          model: config.model,
                          ...(isOpenAiOfficialUrl(resolvedApi.url)
                            ? {
                                reasoning: {
                                  effort: "low"
                                }
                              }
                            : {}),
                          input: buildResponsesApiInput(uncachedBlocks)
                        }
                };
              })();

        const response = await options.fetchImpl(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(request.body),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response));
        }

        const responseBody = (await response.json()) as OpenAiCompatibleResponse &
          ResponsesApiResponse &
          GeminiGenerateContentResponse;
        const content =
          request.mode === "gemini"
            ? extractGeminiText(responseBody)
            : request.mode === "chat"
              ? responseBody.choices?.[0]?.message?.content
              : extractResponsesApiText(responseBody);

        if (!content) {
          throw new Error("Translation response did not include a content payload.");
        }

        const translatedBlocks = parseTranslationPayload(
          content,
          uncachedBlocks.map((block) => block.blockId)
        );

        await options.cache.setMany(
          uncachedBlocks.map((block) => ({
            sourceText: block.sourceText,
            translation: translatedBlocks[block.blockId]
          }))
        );

        return {
          ...result,
          ...translatedBlocks
        };
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new Error(toTimeoutErrorMessage(timeoutMs));
        }

        if (error instanceof TypeError) {
          const failedUrl =
            config.provider === "google-gemini"
              ? `${config.apiBaseUrl.replace(/\/+$/, "")}/models/${config.model}:generateContent`
              : resolveApiMode(config.apiBaseUrl).url;
          throw new Error(toNetworkErrorMessage(failedUrl));
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },

    async testConnection({ config }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const request = buildApiTestRequest(config);

      try {
        const response = await options.fetchImpl(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(request.body),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response));
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new Error(toTimeoutErrorMessage(timeoutMs));
        }

        if (error instanceof TypeError) {
          throw new Error(toNetworkErrorMessage(request.url));
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
