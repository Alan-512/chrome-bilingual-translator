import { describe, expect, it } from "vitest";

import { isExtensionContextInvalidatedError } from "../../../src/content/runtimeMessaging";

describe("runtime messaging", () => {
  it("recognizes an invalidated extension context error", () => {
    expect(isExtensionContextInvalidatedError(new Error("Extension context invalidated."))).toBe(true);
    expect(isExtensionContextInvalidatedError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true);
    expect(isExtensionContextInvalidatedError(new Error("The message port closed before a response was received."))).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isExtensionContextInvalidatedError(new Error("Failed to fetch"))).toBe(false);
    expect(isExtensionContextInvalidatedError("Extension context invalidated.")).toBe(false);
  });
});
