export type TranslationPromptBlock = {
  blockId: string;
  sourceText: string;
};

export function buildTranslationMessages(blocks: TranslationPromptBlock[]) {
  return [
    {
      role: "system",
      content:
        "You are a translation engine. Detect the source language automatically and translate every block to Simplified Chinese. Return a strict JSON object mapping each blockId to its translated string."
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: "Translate the following content blocks into Simplified Chinese.",
          blocks
        },
        null,
        2
      )
    }
  ];
}
