import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXTENSION_CONFIG,
  buildPersistedConfigRecord,
  getApiBaseUrlSecurityError,
  getMissingConfigFields,
  normalizeApiBaseUrlToOrigin
} from "../../../src/shared/config";
import { createMemoryStorageArea, loadExtensionConfig, saveExtensionConfig } from "../../../src/shared/storage";

describe("config defaults", () => {
  it("returns the expected default settings shape", () => {
    expect(DEFAULT_EXTENSION_CONFIG).toEqual({
      provider: "openai-compatible",
      apiBaseUrl: "",
      apiOrigin: "",
      apiKey: "",
      model: "",
      translateTitles: true,
      translateShortContentBlocks: true,
      debugMode: false,
      targetLanguage: "zh-CN"
    });
  });
});

describe("config persistence", () => {
  it("saves and loads a config round-trip with normalized origin metadata", async () => {
    const storage = createMemoryStorageArea();
    const persisted = buildPersistedConfigRecord({
      provider: "openai-compatible",
      apiBaseUrl: "https://api.openai.example.com/v1/chat/completions",
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      translateTitles: false,
      translateShortContentBlocks: true,
      debugMode: true,
      targetLanguage: "ja"
    });

    await saveExtensionConfig(storage, persisted);
    const loaded = await loadExtensionConfig(storage);

    expect(loaded).toEqual({
      provider: "openai-compatible",
      apiBaseUrl: "https://api.openai.example.com/v1/chat/completions",
      apiOrigin: "https://api.openai.example.com",
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      translateTitles: false,
      translateShortContentBlocks: true,
      debugMode: true,
      targetLanguage: "ja"
    });
  });

  it("falls back to Simplified Chinese when persisted target language is invalid", async () => {
    const storage = createMemoryStorageArea({
      extensionConfig: {
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.com/v1/chat/completions",
        apiOrigin: "https://api.example.com",
        apiKey: "test-key",
        model: "gpt-5-mini",
        translateTitles: true,
        translateShortContentBlocks: true,
        debugMode: false,
        targetLanguage: "invalid-language"
      }
    });

    const loaded = await loadExtensionConfig(storage);

    expect(loaded.targetLanguage).toBe("zh-CN");
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

  it("uses the built-in Gemini base URL when provider is google-gemini and URL is empty", () => {
    const persisted = buildPersistedConfigRecord({
      provider: "google-gemini",
      apiBaseUrl: "",
      apiKey: "gemini-key",
      model: "gemini-3.1-flash-lite-preview",
      translateTitles: true,
      translateShortContentBlocks: true,
      debugMode: false,
      targetLanguage: "en"
    });

    expect(persisted.apiBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(persisted.apiOrigin).toBe("https://generativelanguage.googleapis.com");
  });

  it("keeps explicit Gemini base URL when provided", () => {
    const persisted = buildPersistedConfigRecord({
      provider: "google-gemini",
      apiBaseUrl: "https://custom-gemini-host.example.com/v1beta",
      apiKey: "gemini-key",
      model: "gemini-3.1-flash-lite-preview",
      translateTitles: true,
      translateShortContentBlocks: true,
      debugMode: false,
      targetLanguage: "en"
    });

    expect(persisted.apiBaseUrl).toBe("https://custom-gemini-host.example.com/v1beta");
    expect(persisted.apiOrigin).toBe("https://custom-gemini-host.example.com");
  });
});

describe("API base URL security validation", () => {
  it("allows HTTPS API URLs", () => {
    expect(getApiBaseUrlSecurityError("https://ark.cn-beijing.volces.com/api/v3/chat/completions")).toBeNull();
  });

  it("allows HTTP only for localhost development endpoints", () => {
    expect(getApiBaseUrlSecurityError("http://localhost:11434/v1/chat/completions")).toBeNull();
    expect(getApiBaseUrlSecurityError("http://127.0.0.1:11434/v1/chat/completions")).toBeNull();
  });

  it("rejects remote HTTP API URLs", () => {
    expect(getApiBaseUrlSecurityError("http://api.example.com/v1/chat/completions")).toContain("HTTPS");
  });

  it("rejects invalid API URLs", () => {
    expect(getApiBaseUrlSecurityError("not a valid url")).toContain("valid URL");
  });
});
