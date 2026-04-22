export type TranslationPromptBlock = {
  blockId: string;
  sourceText: string;
};

import { getTargetLanguagePromptLabel, type TargetLanguageCode } from "./config";

export function buildTranslationMessages(blocks: TranslationPromptBlock[], targetLanguage: TargetLanguageCode) {
  const targetLanguageLabel = getTargetLanguagePromptLabel(targetLanguage);

  return [
    {
      role: "system",
      content:
        `You are a translation engine. Detect the source language automatically and translate every block to ${targetLanguageLabel}. Return a strict JSON object mapping each blockId to its translated string.`
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: `Translate the following content blocks into ${targetLanguageLabel}.`,
          blocks
        },
        null,
        2
      )
    }
  ];
}
