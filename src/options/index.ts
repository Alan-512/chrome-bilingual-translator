import { buildPersistedConfigRecord, type PersistedExtensionConfigInput } from "../shared/config";
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
};

function queryControls(doc: Document): OptionsFormControls {
  const form = doc.querySelector<HTMLFormElement>("[data-role='options-form']");
  const apiBaseUrl = doc.querySelector<HTMLInputElement>("[name='apiBaseUrl']");
  const apiKey = doc.querySelector<HTMLInputElement>("[name='apiKey']");
  const model = doc.querySelector<HTMLInputElement>("[name='model']");
  const translateTitles = doc.querySelector<HTMLInputElement>("[name='translateTitles']");
  const translateShortContentBlocks = doc.querySelector<HTMLInputElement>("[name='translateShortContentBlocks']");
  const status = doc.querySelector<HTMLElement>("[data-role='status']");

  if (!form || !apiBaseUrl || !apiKey || !model || !translateTitles || !translateShortContentBlocks || !status) {
    throw new Error("Options page controls are missing.");
  }

  return { form, apiBaseUrl, apiKey, model, translateTitles, translateShortContentBlocks, status };
}

function setStatus(element: HTMLElement, message: string, variant: "neutral" | "success" | "error" = "neutral") {
  element.textContent = message;
  element.dataset.state = variant;
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
  setStatus(controls.status, "Ready to save configuration.");

  controls.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nextConfig = buildPersistedConfigRecord(collectFormInput(controls));
    const permissionGranted = nextConfig.apiOrigin
      ? await dependencies.requestApiOriginPermission(nextConfig.apiOrigin)
      : false;

    if (nextConfig.apiOrigin && !permissionGranted) {
      setStatus(controls.status, "API origin permission was denied.", "error");
      return;
    }

    await saveExtensionConfig(dependencies.storageArea, nextConfig);
    setStatus(controls.status, "Configuration saved.", "success");
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
