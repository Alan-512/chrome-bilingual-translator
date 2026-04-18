export function hashNormalizedText(normalizedText: string): string {
  let hash = 0;

  for (let index = 0; index < normalizedText.length; index += 1) {
    hash = (hash * 31 + normalizedText.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}
