export const TARGET_LANGUAGE = "zh-CN" as const;
export const SUPPORTED_TARGET_LANGUAGES = [
  { code: "zh-CN", label: "Simplified Chinese", promptLabel: "Simplified Chinese" },
  { code: "zh-TW", label: "Traditional Chinese", promptLabel: "Traditional Chinese" },
  { code: "en", label: "English", promptLabel: "English" },
  { code: "ja", label: "Japanese", promptLabel: "Japanese" },
  { code: "ko", label: "Korean", promptLabel: "Korean" },
  { code: "fr", label: "French", promptLabel: "French" },
  { code: "de", label: "German", promptLabel: "German" },
  { code: "es", label: "Spanish", promptLabel: "Spanish" },
  { code: "pt", label: "Portuguese", promptLabel: "Portuguese" },
  { code: "ru", label: "Russian", promptLabel: "Russian" },
  { code: "ar", label: "Arabic", promptLabel: "Arabic" }
] as const;

export const DEFAULT_OPENAI_PROVIDER = "openai-compatible" as const;
export const GEMINI_PROVIDER = "google-gemini" as const;

export type ProviderType = typeof DEFAULT_OPENAI_PROVIDER | typeof GEMINI_PROVIDER;
export type TargetLanguageCode = (typeof SUPPORTED_TARGET_LANGUAGES)[number]["code"];

export type PersistedExtensionConfigInput = {
  provider: ProviderType;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  translateTitles: boolean;
  translateShortContentBlocks: boolean;
  debugMode: boolean;
  targetLanguage?: TargetLanguageCode;
};

export type ExtensionConfig = PersistedExtensionConfigInput & {
  apiOrigin: string;
  targetLanguage: TargetLanguageCode;
};

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  provider: DEFAULT_OPENAI_PROVIDER,
  apiBaseUrl: "",
  apiOrigin: "",
  apiKey: "",
  model: "",
  translateTitles: true,
  translateShortContentBlocks: true,
  debugMode: false,
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
    targetLanguage: normalizeTargetLanguage(input.targetLanguage)
  };
}

export function normalizeTargetLanguage(targetLanguage: string | undefined): TargetLanguageCode {
  return SUPPORTED_TARGET_LANGUAGES.some((language) => language.code === targetLanguage)
    ? (targetLanguage as TargetLanguageCode)
    : TARGET_LANGUAGE;
}

export function getTargetLanguagePromptLabel(targetLanguage: string | undefined): string {
  return (
    SUPPORTED_TARGET_LANGUAGES.find((language) => language.code === targetLanguage)?.promptLabel ??
    SUPPORTED_TARGET_LANGUAGES.find((language) => language.code === TARGET_LANGUAGE)?.promptLabel ??
    "Simplified Chinese"
  );
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
