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
        </form>
        <p data-role="status"></p>
      </section>
    </main>
  `;
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
        apiKey: "abc123",
        model: "gpt-test",
        translateTitles: false,
        translateShortContentBlocks: true,
        targetLanguage: "zh-CN"
      }
    });

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true
    });

    expect((document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value).toBe(
      "https://api.example.com/v1"
    );
    expect((document.querySelector("[name='apiKey']") as HTMLInputElement).value).toBe("abc123");
    expect((document.querySelector("[name='model']") as HTMLInputElement).value).toBe("gpt-test");
    expect((document.querySelector("[name='translateTitles']") as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector("[name='translateShortContentBlocks']") as HTMLInputElement).checked).toBe(true);
  });

  it("saves submitted values and reports success", async () => {
    const storage = createMemoryStorageArea();

    await mountOptionsPage(document, {
      storageArea: storage,
      requestApiOriginPermission: async () => true
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value = "https://api.test.dev/v1/chat/completions";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "secret";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "gpt-5-mini";
    (document.querySelector("[name='translateTitles']") as HTMLInputElement).checked = true;
    (document.querySelector("[name='translateShortContentBlocks']") as HTMLInputElement).checked = false;

    document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

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
      requestApiOriginPermission: async () => false
    });

    (document.querySelector("[name='apiBaseUrl']") as HTMLInputElement).value =
      "https://api.test.dev/v1/chat/completions";
    (document.querySelector("[name='apiKey']") as HTMLInputElement).value = "secret";
    (document.querySelector("[name='model']") as HTMLInputElement).value = "gpt-5-mini";

    document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector("[data-role='toast']")?.textContent).toContain("permission was denied");
    expect(document.querySelector("[data-role='toast']")?.getAttribute("data-state")).toBe("error");
  });
});
