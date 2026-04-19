export const TARGET_LANGUAGE = "zh-CN" as const;

export const DEFAULT_OPENAI_PROVIDER = "openai-compatible" as const;
export const GEMINI_PROVIDER = "google-gemini" as const;

export type ProviderType = typeof DEFAULT_OPENAI_PROVIDER | typeof GEMINI_PROVIDER;

export type PersistedExtensionConfigInput = {
  provider: ProviderType;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  translateTitles: boolean;
  translateShortContentBlocks: boolean;
};

export type ExtensionConfig = PersistedExtensionConfigInput & {
  apiOrigin: string;
  targetLanguage: typeof TARGET_LANGUAGE;
};

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  provider: DEFAULT_OPENAI_PROVIDER,
  apiBaseUrl: "",
  apiOrigin: "",
  apiKey: "",
  model: "",
  translateTitles: true,
  translateShortContentBlocks: true,
  targetLanguage: TARGET_LANGUAGE
};

export function normalizeApiBaseUrlToOrigin(apiBaseUrl: string): string {
  try {
    const url = new URL(apiBaseUrl);
    return url.origin;
  } catch {
    return "";
  }
}

export function buildPersistedConfigRecord(input: PersistedExtensionConfigInput): ExtensionConfig {
  return {
    ...input,
    apiOrigin: normalizeApiBaseUrlToOrigin(input.apiBaseUrl),
    targetLanguage: TARGET_LANGUAGE
  };
}

export function getApiBaseUrlSecurityError(apiBaseUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(apiBaseUrl);
  } catch {
    return "API Base URL must be a valid URL.";
  }

  if (url.protocol === "https:") {
    return null;
  }

  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "http:" && isLocalhost) {
    return null;
  }

  return "API Base URL must use HTTPS unless it points to localhost for local development.";
}

export function getMissingConfigFields(config: ExtensionConfig): Array<keyof PersistedExtensionConfigInput> {
  const missingFields: Array<keyof PersistedExtensionConfigInput> = [];

  if (!config.provider.trim()) {
    missingFields.push("provider");
  }

  if (!config.apiBaseUrl.trim()) {
    missingFields.push("apiBaseUrl");
  }

  if (!config.apiKey.trim()) {
    missingFields.push("apiKey");
  }

  if (!config.model.trim()) {
    missingFields.push("model");
  }

  return missingFields;
}
