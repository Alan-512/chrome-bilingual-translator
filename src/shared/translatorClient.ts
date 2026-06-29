import { getTargetLanguagePromptLabel, type ExtensionConfig, type TargetLanguageCode } from "./config";
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
  translateOrExplainSelection(input: {
    config: ExtensionConfig;
    action: "translate" | "explain";
    selectionText: string;
    contextText: string;
  }): Promise<string>;
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

function resolveApiMode(apiBaseUrl: string, provider?: string) {
  const normalized = apiBaseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return { mode: "chat" as const, url: normalized };
  }

  if (normalized.endsWith("/responses")) {
    return { mode: "responses" as const, url: normalized };
  }

  if (provider === "openai-compatible" || provider === "openrouter") {
    return { mode: "chat" as const, url: `${normalized}/chat/completions` };
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

function buildOpenAiReasoningConfig(url: string, model: string) {
  const isReasoning = /thinking|reasoning/i.test(model) || /^o[1-9]/i.test(model);
  const isNvidia = /nvidia/i.test(url);

  if (isReasoning && isNvidia) {
    return {
      extra_body: {
        chat_template_kwargs: {
          enable_thinking: false
        },
        reasoning_budget: 0
      }
    };
  }

  if (isReasoning && isOpenAiOfficialUrl(url)) {
    return {
      reasoning: {
        effort: "low"
      }
    };
  }

  return {};
}

function buildGeminiThinkingConfig(model: string) {
  if (/^gemini-3/i.test(model)) {
    return {
      thinkingConfig: {
        thinkingLevel: "minimal"
      }
    };
  }

  // Only apply thinkingBudget: 0 to explicit thinking/reasoning models (e.g., gemini-2.0-flash-thinking)
  // Standard models (like gemma-4 or gemini-2.5-pro) do not support thinkingBudget: 0 or thinkingConfig at all
  if (/thinking|reasoning/i.test(model)) {
    return {
      thinkingConfig: {
        thinkingBudget: 0
      }
    };
  }

  return undefined;
}

function buildResponsesApiInput(blocks: TranslationBlockInput[], targetLanguage: TargetLanguageCode) {
  const targetLanguageLabel = getTargetLanguagePromptLabel(targetLanguage);

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            `You are a translation engine. Detect the source language automatically and translate every block to ${targetLanguageLabel}. Return a strict JSON object mapping each blockId to its translated string.`
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
              task: `Translate the following content blocks into ${targetLanguageLabel}.`,
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

  const resolvedApi = resolveApiMode(config.apiBaseUrl, config.provider);

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

function buildGeminiTranslationBody(model: string, blocks: TranslationBlockInput[], targetLanguage: TargetLanguageCode) {
  const targetLanguageLabel = getTargetLanguagePromptLabel(targetLanguage);

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
            `You are a translation engine. Detect the source language automatically and translate every block to ${targetLanguageLabel}. Return a strict JSON object mapping each blockId to its translated string.`
        }
      ]
    },
    contents: [
      {
        parts: [
          {
            text: JSON.stringify(
              {
                task: `Translate the following content blocks into ${targetLanguageLabel}.`,
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

function buildGeminiSelectionBody(
  model: string,
  action: "translate" | "explain",
  selectionText: string,
  contextText: string,
  targetLanguage: TargetLanguageCode
) {
  const targetLanguageLabel = getTargetLanguagePromptLabel(targetLanguage);
  let systemText = "";
  if (action === "translate") {
    systemText = `You are a professional translation assistant. Translate the user's selected text into ${targetLanguageLabel}. Use the provided surrounding context to resolve any ambiguity, homophones, or semantic tone, but do not translate or include the context in the output. The response should only be the translation of the selected text itself, without any extra explanation, markdown wrapping, or conversational filler.`;
  } else {
    systemText = `You are an expert bilingual dictionary and vocabulary assistant. Explain the meaning of the selected word, phrase, or sentence in detail. Base your explanation on the surrounding context to ensure accurate semantic understanding. You must output the explanation in ${targetLanguageLabel}. Be precise, concise, and structured, explaining any nuances or context-specific meanings. Return only the explanation without conversational filler.`;
  }

  return {
    ...(buildGeminiThinkingConfig(model)
      ? {
          generationConfig: buildGeminiThinkingConfig(model)
        }
      : {}),
    systemInstruction: {
      parts: [
        {
          text: systemText
        }
      ]
    },
    contents: [
      {
        parts: [
          {
            text: JSON.stringify(
              {
                task: action === "translate"
                  ? `Translate the selected text into ${targetLanguageLabel}.`
                  : `Explain the selected text in ${targetLanguageLabel}, leveraging the surrounding context.`,
                targetLanguage: targetLanguageLabel,
                selectedText: selectionText,
                surroundingContext: contextText
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

function buildSelectionChatMessages(
  action: "translate" | "explain",
  selectionText: string,
  contextText: string,
  targetLanguage: TargetLanguageCode
) {
  const targetLanguageLabel = getTargetLanguagePromptLabel(targetLanguage);
  let systemText = "";
  if (action === "translate") {
    systemText = `You are a professional translation assistant. Translate the user's selected text into ${targetLanguageLabel}. Use the provided surrounding context to resolve any ambiguity, homophones, or semantic tone, but do not translate or include the context in the output. The response should only be the translation of the selected text itself, without any extra explanation, markdown wrapping, or conversational filler.`;
  } else {
    systemText = `You are an expert bilingual dictionary and vocabulary assistant. Explain the meaning of the selected word, phrase, or sentence in detail. Base your explanation on the surrounding context to ensure accurate semantic understanding. You must output the explanation in ${targetLanguageLabel}. Be precise, concise, and structured, explaining any nuances or context-specific meanings. Return only the explanation without conversational filler.`;
  }

  return [
    {
      role: "system",
      content: systemText
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: action === "translate"
            ? `Translate the selected text into ${targetLanguageLabel}.`
            : `Explain the selected text in ${targetLanguageLabel}, leveraging the surrounding context.`,
          targetLanguage: targetLanguageLabel,
          selectedText: selectionText,
          surroundingContext: contextText
        },
        null,
        2
      )
    }
  ];
}

function buildSelectionResponsesApiInput(
  action: "translate" | "explain",
  selectionText: string,
  contextText: string,
  targetLanguage: TargetLanguageCode
) {
  const targetLanguageLabel = getTargetLanguagePromptLabel(targetLanguage);
  let systemText = "";
  if (action === "translate") {
    systemText = `You are a professional translation assistant. Translate the user's selected text into ${targetLanguageLabel}. Use the provided surrounding context to resolve any ambiguity, homophones, or semantic tone, but do not translate or include the context in the output. The response should only be the translation of the selected text itself, without any extra explanation, markdown wrapping, or conversational filler.`;
  } else {
    systemText = `You are an expert bilingual dictionary and vocabulary assistant. Explain the meaning of the selected word, phrase, or sentence in detail. Base your explanation on the surrounding context to ensure accurate semantic understanding. You must output the explanation in ${targetLanguageLabel}. Be precise, concise, and structured, explaining any nuances or context-specific meanings. Return only the explanation without conversational filler.`;
  }

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: systemText
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
              task: action === "translate"
                ? `Translate the selected text into ${targetLanguageLabel}.`
                : `Explain the selected text in ${targetLanguageLabel}, leveraging the surrounding context.`,
              targetLanguage: targetLanguageLabel,
              selectedText: selectionText,
              surroundingContext: contextText
            },
            null,
            2
          )
        }
      ]
    }
  ];
}

export function createTranslatorClient(options: CreateTranslatorClientOptions): TranslatorClient {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    async translateBlocks({ config, blocks }) {
      const result: Record<string, string> = {};
      const uncachedBlocks: TranslationBlockInput[] = [];

      for (const block of blocks) {
        const cachedTranslation = await options.cache.get(block.sourceText, config.targetLanguage);
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
                body: buildGeminiTranslationBody(config.model, uncachedBlocks, config.targetLanguage)
              }
            : (() => {
                const resolvedApi = resolveApiMode(config.apiBaseUrl, config.provider);
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
                          ...buildOpenAiReasoningConfig(resolvedApi.url, config.model),
                          ...(isGeminiChatMode
                            ? {}
                            : {
                                response_format: {
                                  type: "json_object"
                                }
                              }),
                          messages: buildTranslationMessages(uncachedBlocks, config.targetLanguage)
                        }
                      : {
                          model: config.model,
                          ...buildOpenAiReasoningConfig(resolvedApi.url, config.model),
                          input: buildResponsesApiInput(uncachedBlocks, config.targetLanguage)
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
          })),
          config.targetLanguage
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
              : resolveApiMode(config.apiBaseUrl, config.provider).url;
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
    },

    async translateOrExplainSelection({ config, action, selectionText, contextText }) {
      const cacheKey = `selection:${action}:${selectionText}`;
      const cachedResult = await options.cache.get(cacheKey, config.targetLanguage);
      if (cachedResult) {
        return cachedResult;
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
                body: buildGeminiSelectionBody(
                  config.model,
                  action,
                  selectionText,
                  contextText,
                  config.targetLanguage
                )
              }
            : (() => {
                const resolvedApi = resolveApiMode(config.apiBaseUrl, config.provider);

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
                          ...buildOpenAiReasoningConfig(resolvedApi.url, config.model),
                          messages: buildSelectionChatMessages(
                            action,
                            selectionText,
                            contextText,
                            config.targetLanguage
                          )
                        }
                      : {
                          model: config.model,
                          ...buildOpenAiReasoningConfig(resolvedApi.url, config.model),
                          input: buildSelectionResponsesApiInput(
                            action,
                            selectionText,
                            contextText,
                            config.targetLanguage
                          )
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
          throw new Error("Selection translation/explanation response did not include a content payload.");
        }

        const finalResult = content.trim();
        await options.cache.setMany(
          [{ sourceText: cacheKey, translation: finalResult }],
          config.targetLanguage
        );

        return finalResult;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new Error(toTimeoutErrorMessage(timeoutMs));
        }

        if (error instanceof TypeError) {
          const failedUrl =
            config.provider === "google-gemini"
              ? `${config.apiBaseUrl.replace(/\/+$/, "")}/models/${config.model}:generateContent`
              : resolveApiMode(config.apiBaseUrl, config.provider).url;
          throw new Error(toNetworkErrorMessage(failedUrl));
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
