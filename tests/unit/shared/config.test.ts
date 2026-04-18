import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXTENSION_CONFIG,
  buildPersistedConfigRecord,
  getMissingConfigFields,
  normalizeApiBaseUrlToOrigin
} from "../../../src/shared/config";
import { createMemoryStorageArea, loadExtensionConfig, saveExtensionConfig } from "../../../src/shared/storage";

describe("config defaults", () => {
  it("returns the expected default settings shape", () => {
    expect(DEFAULT_EXTENSION_CONFIG).toEqual({
      apiBaseUrl: "",
      apiOrigin: "",
      apiKey: "",
      model: "",
      translateTitles: true,
      translateShortContentBlocks: true,
      targetLanguage: "zh-CN"
    });
  });
});

describe("config persistence", () => {
  it("saves and loads a config round-trip with normalized origin metadata", async () => {
    const storage = createMemoryStorageArea();
    const persisted = buildPersistedConfigRecord({
      apiBaseUrl: "https://api.openai.example.com/v1/chat/completions",
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      translateTitles: false,
      translateShortContentBlocks: true
    });

    await saveExtensionConfig(storage, persisted);
    const loaded = await loadExtensionConfig(storage);

    expect(loaded).toEqual({
      apiBaseUrl: "https://api.openai.example.com/v1/chat/completions",
      apiOrigin: "https://api.openai.example.com",
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      translateTitles: false,
      translateShortContentBlocks: true,
      targetLanguage: "zh-CN"
    });
  });
});

describe("config validation", () => {
  it("reports missing required API fields", () => {
    expect(
      getMissingConfigFields({
        ...DEFAULT_EXTENSION_CONFIG,
        apiBaseUrl: "https://api.example.com/v1",
        apiOrigin: "https://api.example.com"
      })
    ).toEqual(["apiKey", "model"]);
  });
});

describe("API base URL normalization", () => {
  it("reduces a pathful API base URL to an origin", () => {
    expect(normalizeApiBaseUrlToOrigin("https://example.com/v1/chat/completions")).toBe("https://example.com");
  });

  it("returns an empty string for invalid input", () => {
    expect(normalizeApiBaseUrlToOrigin("not a valid url")).toBe("");
  });
});
