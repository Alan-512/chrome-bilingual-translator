export function isExtensionContextInvalidatedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /Extension context invalidated/i.test(error.message) ||
    /Could not establish connection/i.test(error.message) ||
    /Receiving end does not exist/i.test(error.message) ||
    /The message port closed before a response was received/i.test(error.message)
  );
}
