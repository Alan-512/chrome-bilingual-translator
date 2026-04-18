export function normalizeSourceText(sourceText: string): string {
  return sourceText.replace(/\s+/g, " ").trim();
}
