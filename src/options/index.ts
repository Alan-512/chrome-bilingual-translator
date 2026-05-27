import {
  DEFAULT_OPENAI_PROVIDER,
  GEMINI_API_BASE_URL,
  GEMINI_PROVIDER,
  OPENROUTER_API_BASE_URL,
  OPENROUTER_PROVIDER,
  SUPPORTED_TARGET_LANGUAGES,
  buildPersistedConfigRecord,
  getApiBaseUrlSecurityError,
  resolveApiBaseUrlForProvider,
  type PersistedExtensionConfigInput
} from "../shared/config";
import { createChromeStorageArea, loadExtensionConfig, saveExtensionConfig, type StorageAreaLike } from "../shared/storage";

type OptionsPageDependencies = {
  storageArea: StorageAreaLike;
  requestApiOriginPermission: (origin: string) => Promise<boolean>;
  testApiConnection: (config: PersistedExtensionConfigInput) => Promise<void>;
};

type OptionsFormControls = {
  form: HTMLFormElement;
  testApi: HTMLButtonElement;
  provider: HTMLSelectElement;
  apiBaseUrl: HTMLInputElement;
  apiKey: HTMLInputElement;
  model: HTMLInputElement;
  targetLanguage: HTMLSelectElement;
  translateTitles: HTMLInputElement;
  translateShortContentBlocks: HTMLInputElement;
  debugMode: HTMLInputElement;
  status: HTMLElement;
};

function queryControls(doc: Document): OptionsFormControls {
  const form = doc.querySelector<HTMLFormElement>("[data-role='options-form']");
  const testApi = doc.querySelector<HTMLButtonElement>("[data-role='test-api']");
  const provider = doc.querySelector<HTMLSelectElement>("[name='provider']");
  const apiBaseUrl = doc.querySelector<HTMLInputElement>("[name='apiBaseUrl']");
  const apiKey = doc.querySelector<HTMLInputElement>("[name='apiKey']");
  const model = doc.querySelector<HTMLInputElement>("[name='model']");
  const targetLanguage = doc.querySelector<HTMLSelectElement>("[name='targetLanguage']");
  const translateTitles = doc.querySelector<HTMLInputElement>("[name='translateTitles']");
  const translateShortContentBlocks = doc.querySelector<HTMLInputElement>("[name='translateShortContentBlocks']");
  const debugMode = doc.querySelector<HTMLInputElement>("[name='debugMode']");
  const status = doc.querySelector<HTMLElement>("[data-role='status']");

  if (
    !form ||
    !testApi ||
    !provider ||
    !apiBaseUrl ||
    !apiKey ||
    !model ||
    !targetLanguage ||
    !translateTitles ||
    !translateShortContentBlocks ||
    !debugMode ||
    !status
  ) {
    throw new Error("Options page controls are missing.");
  }

  return {
    form,
    testApi,
    provider,
    apiBaseUrl,
    apiKey,
    model,
    targetLanguage,
    translateTitles,
    translateShortContentBlocks,
    debugMode,
    status
  };
}

function setStatus(element: HTMLElement, message: string, variant: "neutral" | "success" | "error" = "neutral") {
  element.textContent = message;
  element.dataset.state = variant;
}

let toastTimeoutId: number | undefined;

function showToast(doc: Document, message: string, variant: "success" | "error") {
  const existingToast = doc.querySelector<HTMLElement>("[data-role='toast']");
  const toast = existingToast ?? doc.createElement("div");

  toast.dataset.role = "toast";
  toast.dataset.state = variant;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;

  if (!existingToast) {
    doc.body.appendChild(toast);
  }

  if (toastTimeoutId) {
    doc.defaultView?.clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = doc.defaultView?.setTimeout(() => {
    toast.remove();
    toastTimeoutId = undefined;
  }, 3000);
}

function collectFormInput(controls: OptionsFormControls): PersistedExtensionConfigInput {
  const provider =
    controls.provider.value === GEMINI_PROVIDER
      ? GEMINI_PROVIDER
      : controls.provider.value === OPENROUTER_PROVIDER
        ? OPENROUTER_PROVIDER
        : DEFAULT_OPENAI_PROVIDER;

  return {
    provider,
    apiBaseUrl: resolveApiBaseUrlForProvider(provider, controls.apiBaseUrl.value),
    apiKey: controls.apiKey.value.trim(),
    model: controls.model.value.trim(),
    targetLanguage: SUPPORTED_TARGET_LANGUAGES.some((language) => language.code === controls.targetLanguage.value)
      ? controls.targetLanguage.value
      : "zh-CN",
    translateTitles: controls.translateTitles.checked,
    translateShortContentBlocks: controls.translateShortContentBlocks.checked,
    debugMode: controls.debugMode.checked
  };
}

function applyProviderPreset(controls: OptionsFormControls) {
  if (controls.provider.value === GEMINI_PROVIDER) {
    controls.apiBaseUrl.value = GEMINI_API_BASE_URL;
    controls.model.value = "gemini-3.1-flash-lite-preview";
  } else if (controls.provider.value === OPENROUTER_PROVIDER) {
    controls.apiBaseUrl.value = OPENROUTER_API_BASE_URL;
    controls.model.value = "google/gemini-2.5-flash";
  } else if (controls.provider.value === DEFAULT_OPENAI_PROVIDER) {
    controls.apiBaseUrl.value = "https://api.openai.com/v1";
    controls.model.value = "gpt-4o-mini";
  }
}

function testApiConfiguration(
  controls: OptionsFormControls,
  dependencies: OptionsPageDependencies,
  doc: Document
) {
  try {
    const nextConfig = buildPersistedConfigRecord(collectFormInput(controls));
    const securityError = getApiBaseUrlSecurityError(nextConfig.apiBaseUrl);
    if (securityError) {
      setStatus(controls.status, securityError, "error");
      showToast(doc, securityError, "error");
      return;
    }

    const permissionPromise = nextConfig.apiOrigin
      ? dependencies.requestApiOriginPermission(nextConfig.apiOrigin)
      : Promise.resolve(true);

    permissionPromise
      .then((permissionGranted) => {
        if (nextConfig.apiOrigin && !permissionGranted) {
          setStatus(controls.status, "API origin permission was denied.", "error");
          showToast(doc, "API origin permission was denied.", "error");
          return;
        }

        controls.testApi.disabled = true;
        const originalLabel = controls.testApi.textContent;
        controls.testApi.textContent = "Testing...";

        dependencies
          .testApiConnection(collectFormInput(controls))
          .then(() => {
            setStatus(controls.status, "API connection succeeded.", "success");
            showToast(doc, "API connection succeeded.", "success");
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : "API connection failed.";
            setStatus(controls.status, message, "error");
            showToast(doc, message, "error");
          })
          .finally(() => {
            controls.testApi.disabled = false;
            controls.testApi.textContent = originalLabel;
          });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to request permission.";
        setStatus(controls.status, message, "error");
        showToast(doc, message, "error");
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    setStatus(controls.status, message, "error");
    showToast(doc, message, "error");
  }
}

export async function mountOptionsPage(
  doc: Document,
  dependencies: OptionsPageDependencies
): Promise<void> {
  const controls = queryControls(doc);
  const savedConfig = await loadExtensionConfig(dependencies.storageArea);

  controls.provider.value = savedConfig.provider;
  controls.apiBaseUrl.value = savedConfig.apiBaseUrl;
  controls.apiKey.value = savedConfig.apiKey;
  controls.model.value = savedConfig.model;
  controls.targetLanguage.value = savedConfig.targetLanguage;
  controls.translateTitles.checked = savedConfig.translateTitles;
  controls.translateShortContentBlocks.checked = savedConfig.translateShortContentBlocks;
  controls.debugMode.checked = savedConfig.debugMode;
  setStatus(controls.status, "Ready to save configuration.");

  controls.provider.addEventListener("change", () => {
    applyProviderPreset(controls);
  });

  controls.testApi.addEventListener("click", () => {
    testApiConfiguration(controls, dependencies, doc);
  });

  controls.form.addEventListener("submit", (event) => {
    event.preventDefault();

    try {
      const nextConfig = buildPersistedConfigRecord(collectFormInput(controls));
      const securityError = getApiBaseUrlSecurityError(nextConfig.apiBaseUrl);
      if (securityError) {
        setStatus(controls.status, securityError, "error");
        showToast(doc, securityError, "error");
        return;
      }

      const permissionPromise = nextConfig.apiOrigin
        ? dependencies.requestApiOriginPermission(nextConfig.apiOrigin)
        : Promise.resolve(true);

      permissionPromise
        .then((permissionGranted) => {
          if (nextConfig.apiOrigin && !permissionGranted) {
            setStatus(controls.status, "API origin permission was denied.", "error");
            showToast(doc, "API origin permission was denied.", "error");
            return;
          }

          saveExtensionConfig(dependencies.storageArea, nextConfig)
            .then(() => {
              setStatus(controls.status, "Configuration saved.", "success");
              showToast(doc, "Configuration saved.", "success");
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : "Failed to save configuration.";
              setStatus(controls.status, message, "error");
              showToast(doc, message, "error");
            });
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Failed to request permission.";
          setStatus(controls.status, message, "error");
          showToast(doc, message, "error");
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setStatus(controls.status, message, "error");
      showToast(doc, message, "error");
    }
  });
}

async function bootstrap() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return;
  }

  await mountOptionsPage(document, {
    storageArea: createChromeStorageArea(chrome.storage.local),
    requestApiOriginPermission: (origin) => {
      if (!chrome.permissions) {
        return Promise.resolve(true);
      }

      // We call chrome.permissions.request synchronously inside the user gesture handler.
      // Doing this without any preceding await keeps the user gesture active, preventing
      // Manifest V3 "must be called during a user gesture" errors.
      // If the origin permission is already granted, it resolves to true instantly without prompt.
      return chrome.permissions.request({ origins: [`${origin}/*`] });
    },
    testApiConnection: async (config) => {
      const response = (await chrome.runtime.sendMessage({
        type: "api/test",
        config
      })) as { ok?: boolean; error?: string };

      if (!response?.ok) {
        throw new Error(response?.error ?? "API connection failed.");
      }
    }
  });
}

void bootstrap();
