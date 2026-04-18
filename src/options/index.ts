import {
  buildPersistedConfigRecord,
  getApiBaseUrlSecurityError,
  normalizeApiBaseUrlToOrigin,
  type PersistedExtensionConfigInput
} from "../shared/config";
import { createChromeStorageArea, loadExtensionConfig, saveExtensionConfig, type StorageAreaLike } from "../shared/storage";

type OptionsPageDependencies = {
  storageArea: StorageAreaLike;
  requestApiOriginPermission: (origin: string) => Promise<boolean>;
};

type OptionsFormControls = {
  form: HTMLFormElement;
  apiBaseUrl: HTMLInputElement;
  apiKey: HTMLInputElement;
  model: HTMLInputElement;
  translateTitles: HTMLInputElement;
  translateShortContentBlocks: HTMLInputElement;
  status: HTMLElement;
  apiOriginPreview: HTMLElement;
};

function queryControls(doc: Document): OptionsFormControls {
  const form = doc.querySelector<HTMLFormElement>("[data-role='options-form']");
  const apiBaseUrl = doc.querySelector<HTMLInputElement>("[name='apiBaseUrl']");
  const apiKey = doc.querySelector<HTMLInputElement>("[name='apiKey']");
  const model = doc.querySelector<HTMLInputElement>("[name='model']");
  const translateTitles = doc.querySelector<HTMLInputElement>("[name='translateTitles']");
  const translateShortContentBlocks = doc.querySelector<HTMLInputElement>("[name='translateShortContentBlocks']");
  const status = doc.querySelector<HTMLElement>("[data-role='status']");
  const apiOriginPreview = doc.querySelector<HTMLElement>("[data-role='api-origin-preview']");

  if (
    !form ||
    !apiBaseUrl ||
    !apiKey ||
    !model ||
    !translateTitles ||
    !translateShortContentBlocks ||
    !status ||
    !apiOriginPreview
  ) {
    throw new Error("Options page controls are missing.");
  }

  return { form, apiBaseUrl, apiKey, model, translateTitles, translateShortContentBlocks, status, apiOriginPreview };
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
    apiBaseUrl: controls.apiBaseUrl.value.trim(),
    apiKey: controls.apiKey.value.trim(),
    model: controls.model.value.trim(),
    translateTitles: controls.translateTitles.checked,
    translateShortContentBlocks: controls.translateShortContentBlocks.checked
  };
}

function updateApiOriginPreview(controls: OptionsFormControls) {
  const origin = normalizeApiBaseUrlToOrigin(controls.apiBaseUrl.value.trim());
  controls.apiOriginPreview.textContent = origin ? `Requests will be sent to ${origin}` : "Enter a valid API URL.";
}

export async function mountOptionsPage(
  doc: Document,
  dependencies: OptionsPageDependencies
): Promise<void> {
  const controls = queryControls(doc);
  const savedConfig = await loadExtensionConfig(dependencies.storageArea);

  controls.apiBaseUrl.value = savedConfig.apiBaseUrl;
  controls.apiKey.value = savedConfig.apiKey;
  controls.model.value = savedConfig.model;
  controls.translateTitles.checked = savedConfig.translateTitles;
  controls.translateShortContentBlocks.checked = savedConfig.translateShortContentBlocks;
  updateApiOriginPreview(controls);
  setStatus(controls.status, "Ready to save configuration.");

  controls.apiBaseUrl.addEventListener("input", () => {
    updateApiOriginPreview(controls);
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
    }
  });
}

void bootstrap();
