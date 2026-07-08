export function normalizeText(text: string | null | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

export function normalizeTextForKey(text: string | null | undefined): string {
  return normalizeText(text);
}

export function containsEquivalentText(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);

  if (!normalizedHaystack || !normalizedNeedle) {
    return false;
  }

  return normalizedHaystack.includes(normalizedNeedle);
}

export function looksLikeMostlyNumericText(text: string): boolean {
  const stripped = text.replace(/\s+/g, "");
  return /^[\d.,:+\-/%年月日点分秒]+(?:points?)?$/i.test(stripped);
}

