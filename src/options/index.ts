import {
  DEFAULT_OPENAI_PROVIDER,
  GEMINI_PROVIDER,
  buildPersistedConfigRecord,
  getApiBaseUrlSecurityError,
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
  translateTitles: HTMLInputElement;
  translateShortContentBlocks: HTMLInputElement;
  status: HTMLElement;
};

function queryControls(doc: Document): OptionsFormControls {
  const form = doc.querySelector<HTMLFormElement>("[data-role='options-form']");
  const testApi = doc.querySelector<HTMLButtonElement>("[data-role='test-api']");
  const provider = doc.querySelector<HTMLSelectElement>("[name='provider']");
  const apiBaseUrl = doc.querySelector<HTMLInputElement>("[name='apiBaseUrl']");
  const apiKey = doc.querySelector<HTMLInputElement>("[name='apiKey']");
  const model = doc.querySelector<HTMLInputElement>("[name='model']");
  const translateTitles = doc.querySelector<HTMLInputElement>("[name='translateTitles']");
  const translateShortContentBlocks = doc.querySelector<HTMLInputElement>("[name='translateShortContentBlocks']");
  const status = doc.querySelector<HTMLElement>("[data-role='status']");

  if (
    !form ||
    !testApi ||
    !provider ||
    !apiBaseUrl ||
    !apiKey ||
    !model ||
    !translateTitles ||
    !translateShortContentBlocks ||
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
    translateTitles,
    translateShortContentBlocks,
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
  return {
    provider: controls.provider.value === GEMINI_PROVIDER ? GEMINI_PROVIDER : DEFAULT_OPENAI_PROVIDER,
    apiBaseUrl: controls.apiBaseUrl.value.trim(),
    apiKey: controls.apiKey.value.trim(),
    model: controls.model.value.trim(),
    translateTitles: controls.translateTitles.checked,
    translateShortContentBlocks: controls.translateShortContentBlocks.checked
  };
}

function applyProviderPreset(controls: OptionsFormControls) {
  if (controls.provider.value === GEMINI_PROVIDER) {
    if (!controls.apiBaseUrl.value.trim()) {
      controls.apiBaseUrl.value = "https://generativelanguage.googleapis.com/v1beta";
    }

    if (!controls.model.value.trim()) {
      controls.model.value = "gemini-3.1-flash-lite-preview";
    }
  }
}

async function testApiConfiguration(
  controls: OptionsFormControls,
  dependencies: OptionsPageDependencies,
  doc: Document
) {
  const nextConfig = buildPersistedConfigRecord(collectFormInput(controls));
  const securityError = getApiBaseUrlSecurityError(nextConfig.apiBaseUrl);
  if (securityError) {
    setStatus(controls.status, securityError, "error");
    showToast(doc, securityError, "error");
    return;
  }

  const permissionGranted = nextConfig.apiOrigin
    ? await dependencies.requestApiOriginPermission(nextConfig.apiOrigin)
    : false;
  if (nextConfig.apiOrigin && !permissionGranted) {
    setStatus(controls.status, "API origin permission was denied.", "error");
    showToast(doc, "API origin permission was denied.", "error");
    return;
  }

  controls.testApi.disabled = true;
  const originalLabel = controls.testApi.textContent;
  controls.testApi.textContent = "Testing...";

  try {
    await dependencies.testApiConnection(collectFormInput(controls));

    setStatus(controls.status, "API connection succeeded.", "success");
    showToast(doc, "API connection succeeded.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "API connection failed.";
    setStatus(controls.status, message, "error");
    showToast(doc, message, "error");
  } finally {
    controls.testApi.disabled = false;
    controls.testApi.textContent = originalLabel;
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
  controls.translateTitles.checked = savedConfig.translateTitles;
  controls.translateShortContentBlocks.checked = savedConfig.translateShortContentBlocks;
  setStatus(controls.status, "Ready to save configuration.");

  controls.provider.addEventListener("change", () => {
    applyProviderPreset(controls);
  });

  controls.testApi.addEventListener("click", () => {
    void testApiConfiguration(controls, dependencies, doc);
  });

  controls.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nextConfig = buildPersistedConfigRecord(collectFormInput(controls));
    const securityError = getApiBaseUrlSecurityError(nextConfig.apiBaseUrl);
    if (securityError) {
      setStatus(controls.status, securityError, "error");
      showToast(doc, securityError, "error");
      return;
    }

    const permissionGranted = nextConfig.apiOrigin
      ? await dependencies.requestApiOriginPermission(nextConfig.apiOrigin)
      : false;

    if (nextConfig.apiOrigin && !permissionGranted) {
      setStatus(controls.status, "API origin permission was denied.", "error");
      showToast(doc, "API origin permission was denied.", "error");
      return;
    }

    await saveExtensionConfig(dependencies.storageArea, nextConfig);
    setStatus(controls.status, "Configuration saved.", "success");
    showToast(doc, "Configuration saved.", "success");
  });
}

async function bootstrap() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return;
  }

  await mountOptionsPage(document, {
    storageArea: createChromeStorageArea(chrome.storage.local),
    requestApiOriginPermission: async (origin) => {
      if (!chrome.permissions) {
        return true;
      }

      const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
      if (granted) {
        return true;
      }

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
