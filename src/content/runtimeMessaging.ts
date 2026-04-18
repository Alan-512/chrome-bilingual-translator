export function isExtensionContextInvalidatedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Extension context invalidated/i.test(error.message);
}
