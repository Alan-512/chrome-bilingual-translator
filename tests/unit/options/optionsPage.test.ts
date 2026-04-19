// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { mountOptionsPage } from "../../../src/options/index";
import { createMemoryStorageArea, loadExtensionConfig } from "../../../src/shared/storage";

function renderOptionsDom() {
  document.body.innerHTML = `
    <main class="page">
      <section class="panel">
        <form data-role="options-form">
          <label>
            Provider
            <select name="provider">
              <option value="openai-compatible">OpenAI Compatible</option>
              <option value="google-gemini">Google Gemini</option>
            </select>
          </label>
          <label>
            API Base URL
            <input name="apiBaseUrl" type="url" />
          </label>
          <label>
            API Key
            <input name="apiKey" type="password" />
          </label>
          <label>
            Model
            <input name="model" type="text" />
          </label>
          <label>
            <input name="translateTitles" type="checkbox" />
            Translate titles
          </label>
          <label>
            <input name="translateShortContentBlocks" type="checkbox" />
            Translate short content blocks
          </label>
          <button type="submit">Save</button>
          <button type="button" data-role="test-api">Test API</button>
        </form>
        <p data-role="status"></p>
      </section>
    </main>
  `;
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("mountOptionsPage", () => {
  beforeEach(() => {
    renderOptionsDom();
  });

  it("loads saved config values into the form", async () => {
    const storage = createMemoryStorageArea({
      extensionConfig: {
        apiBaseUrl: "https://api.example.com/v1",
        apiOrigin: "https://api.example.com",
        provider: "openai-compatible",
        apiKey: "abc123",
        model: "gpt-test",
        translateTitles: false,
        translateShortContentBlocks: true,
        targetLanguage: "zh-CN"
      }
    });

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true,
      testApiConnection: async () => undefined
    });

    expect((document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value).toBe(
      "https://api.example.com/v1"
    );
    expect((document.querySelector("[name='provider']") as HTMLSelectElement).value).toBe("openai-compatible");
    expect((document.querySelector("[name='apiKey']") as HTMLInputElement).value).toBe("abc123");
    expect((document.querySelector("[name='model']") as HTMLInputElement).value).toBe("gpt-test");
    expect((document.querySelector("[name='translateTitles']") as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector("[name='translateShortContentBlocks']") as HTMLInputElement).checked).toBe(true);
  });

  it("saves submitted values and reports success", async () => {
    const storage = createMemoryStorageArea();

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true,
      testApiConnection: async () => undefined
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value = "https://api.test.dev/v1/chat/completions";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "secret";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "gpt-5-mini";
    (document.querySelector("[name='translateTitles']") as HTMLInputElement).checked = true;
    (document.querySelector("[name='translateShortContentBlocks']") as HTMLInputElement).checked = false;

    document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushAsyncWork();

    const savedConfig = await loadExtensionConfig(storage);
    expect(savedConfig.apiOrigin).toBe("https://api.test.dev");
    expect(savedConfig.translateShortContentBlocks).toBe(false);
    expect(document.querySelector("[data-role='status']")?.textContent).toContain("saved");
    expect(document.querySelector("[data-role='toast']")?.textContent).toContain("Configuration saved");
    expect(document.querySelector("[data-role='toast']")?.getAttribute("data-state")).toBe("success");
  });

  it("shows a visible error toast when API origin permission is denied", async () => {
    const storage = createMemoryStorageArea();

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => false,
      testApiConnection: async () => undefined
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value =
      "https://api.test.dev/v1/chat/completions";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "secret";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "gpt-5-mini";

    document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushAsyncWork();

    expect(document.querySelector("[data-role='toast']")?.textContent).toContain("permission was denied");
    expect(document.querySelector("[data-role='toast']")?.getAttribute("data-state")).toBe("error");
  });

  it("rejects remote HTTP API URLs before saving", async () => {
    const storage = createMemoryStorageArea();

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true,
      testApiConnection: async () => undefined
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value =
      "http://api.test.dev/v1/chat/completions";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "secret";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "gpt-5-mini";

    document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushAsyncWork();

    const savedConfig = await loadExtensionConfig(storage);
    expect(savedConfig.apiBaseUrl).toBe("");
    expect(document.querySelector("[data-role='toast']")?.textContent).toContain("HTTPS");
    expect(document.querySelector("[data-role='toast']")?.getAttribute("data-state")).toBe("error");
  });

  it("tests the current API configuration without overwriting saved settings", async () => {
    const storage = createMemoryStorageArea({
      extensionConfig: {
        apiBaseUrl: "https://saved.example.com/v1/chat/completions",
        apiOrigin: "https://saved.example.com",
        apiKey: "saved-key",
        model: "saved-model",
        translateTitles: true,
        translateShortContentBlocks: true,
        targetLanguage: "zh-CN"
      }
    });
    let observedConfig: {
      apiBaseUrl: string;
      apiKey: string;
      model: string;
      translateTitles: boolean;
      translateShortContentBlocks: boolean;
    } | null = null;

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true,
      testApiConnection: async (config) => {
        observedConfig = config;
      }
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value = "https://api.test.dev/v1/chat/completions";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "test-key";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "test-model";

    document.querySelector("[data-role='test-api']")?.dispatchEvent(new Event("click", { bubbles: true }));
    await flushAsyncWork();

    const savedConfig = await loadExtensionConfig(storage);
    expect(savedConfig.apiBaseUrl).toBe("https://saved.example.com/v1/chat/completions");
    expect(observedConfig).toEqual({
      provider: "openai-compatible",
      apiBaseUrl: "https://api.test.dev/v1/chat/completions",
      apiKey: "test-key",
      model: "test-model",
      translateTitles: true,
      translateShortContentBlocks: true
    });
    expect(document.querySelector("[data-role='toast']")?.textContent).toContain("API connection succeeded");
    expect(document.querySelector("[data-role='toast']")?.getAttribute("data-state")).toBe("success");
  });

  it("shows the returned API error when test api fails", async () => {
    const storage = createMemoryStorageArea();

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true,
      testApiConnection: async () => {
        throw new Error("Bad model");
      }
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value = "https://api.test.dev/v1/chat/completions";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "test-key";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "bad-model";

    document.querySelector("[data-role='test-api']")?.dispatchEvent(new Event("click", { bubbles: true }));
    await flushAsyncWork();

    expect(document.querySelector("[data-role='toast']")?.textContent).toContain("Bad model");
    expect(document.querySelector("[data-role='toast']")?.getAttribute("data-state")).toBe("error");
  });

  it("tests root base URLs through the background api test flow", async () => {
    const storage = createMemoryStorageArea();
    let observedConfig: {
      apiBaseUrl: string;
      apiKey: string;
      model: string;
      translateTitles: boolean;
      translateShortContentBlocks: boolean;
    } | null = null;

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true,
      testApiConnection: async (config) => {
        observedConfig = config;
      }
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value = "https://ark.cn-beijing.volces.com/api/v3";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "test-key";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "ep-20260321184346-rlw84";

    document.querySelector("[data-role='test-api']")?.dispatchEvent(new Event("click", { bubbles: true }));
    await flushAsyncWork();

    expect(observedConfig?.apiBaseUrl).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(document.querySelector("[data-role='toast']")?.textContent).toContain("API connection succeeded");
  });

  it("applies Google Gemini presets when provider changes", async () => {
    const storage = createMemoryStorageArea();

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true,
      testApiConnection: async () => undefined
    });

    const provider = document.querySelector("[name='provider']") as HTMLSelectElement;
    provider.value = "google-gemini";
    provider.dispatchEvent(new Event("change", { bubbles: true }));

    expect((document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value).toBe(
      "https://generativelanguage.googleapis.com/v1beta"
    );
    expect((document.querySelector("[name='model']") as HTMLInputElement).value).toBe(
      "gemini-3.1-flash-lite-preview"
    );
  });
});
