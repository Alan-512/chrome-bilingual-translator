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

function parseTranslationPayload(content: string, expectedBlockIds: string[]): Record<string, string> {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const missingBlockIds = expectedBlockIds.filter((blockId) => typeof parsed[blockId] !== "string");

  if (missingBlockIds.length > 0) {
    throw new Error(`Missing translations for block ids: ${missingBlockIds.join(", ")}`);
  }

  return Object.fromEntries(expectedBlockIds.map((blockId) => [blockId, String(parsed[blockId])]));
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
        const response = await options.fetchImpl(config.apiBaseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            response_format: {
              type: "json_object"
            },
            messages: buildTranslationMessages(uncachedBlocks)
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Translation request failed with ${response.status} ${response.statusText}`);
        }

        const responseBody = (await response.json()) as OpenAiCompatibleResponse;
        const content = responseBody.choices?.[0]?.message?.content;

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
