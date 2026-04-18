import { type ExtensionConfig } from "./config";
import { type PersistentTranslationCache } from "./cacheStore";
import { buildTranslationMessages, type TranslationPromptBlock } from "./promptBuilder";

export type TranslationBlockInput = TranslationPromptBlock;

export type TranslatorClient = {
  translateBlocks(input: {
    config: ExtensionConfig;
    blocks: TranslationBlockInput[];
  }): Promise<Record<string, string>>;
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

export function createTranslatorClient(options: CreateTranslatorClientOptions): TranslatorClient {
  const timeoutMs = options.timeoutMs ?? 15_000;

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
        const resolvedApi = resolveApiMode(config.apiBaseUrl);
        const response = await options.fetchImpl(resolvedApi.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(
            resolvedApi.mode === "chat"
              ? {
                  model: config.model,
                  response_format: {
                    type: "json_object"
                  },
                  messages: buildTranslationMessages(uncachedBlocks)
                }
              : {
                  model: config.model,
                  input: buildResponsesApiInput(uncachedBlocks)
                }
          ),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Translation request failed with ${response.status} ${response.statusText}`);
        }

        const responseBody = (await response.json()) as OpenAiCompatibleResponse & ResponsesApiResponse;
        const content =
          resolvedApi.mode === "chat"
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
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
