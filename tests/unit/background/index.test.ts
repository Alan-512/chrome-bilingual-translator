import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EXTENSION_CONFIG } from "../../../src/shared/config";
import { type ContextMenuItem } from "../../../src/background/contextMenus";

function createEvent() {
  const listeners: Array<(...args: any[]) => unknown> = [];
  return {
    addListener: vi.fn((listener: (...args: any[]) => unknown) => listeners.push(listener)),
    emit: (...args: any[]) => listeners.forEach((listener) => listener(...args))
  };
}

function createChromeMock() {
  const menus = new Map<string, ContextMenuItem>();
  const creationErrors: string[] = [];
  let config = { ...DEFAULT_EXTENSION_CONFIG };
  const runtime = {
    lastError: undefined as { message: string } | undefined,
    onInstalled: createEvent(),
    onStartup: createEvent(),
    onMessage: createEvent()
  };
  const storageArea = {
    get: vi.fn(async (key: string) => key === "extensionConfig" ? { extensionConfig: config } : {}),
    set: vi.fn(async () => {})
  };
  const api = {
    runtime,
    storage: { local: storageArea, session: storageArea, onChanged: createEvent() },
    contextMenus: {
      onClicked: createEvent(),
      removeAll: vi.fn(async () => { menus.clear(); }),
      create: vi.fn((item: ContextMenuItem, callback?: () => void) => {
        queueMicrotask(() => {
          if (menus.has(item.id)) {
            runtime.lastError = { message: `Cannot create item with duplicate id ${item.id}` };
            creationErrors.push(runtime.lastError.message);
          } else {
            menus.set(item.id, item);
          }
          callback?.();
          runtime.lastError = undefined;
        });
        return item.id;
      })
    },
    tabs: {
      onUpdated: createEvent(),
      onRemoved: createEvent(),
      sendMessage: vi.fn(async () => ({ ok: true }))
    },
    scripting: { executeScript: vi.fn(async () => {}) }
  };
  return {
    api, menus, creationErrors,
    changeLanguage(targetLanguage: typeof config.targetLanguage) {
      const oldValue = config;
      config = { ...config, targetLanguage };
      api.storage.onChanged.emit({ extensionConfig: { oldValue, newValue: config } }, "local");
    }
  };
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("background menu lifecycle", () => {
  it("preserves persisted menus and registers click/message listeners on worker wake", async () => {
    const { api, menus } = createChromeMock();
    menus.set("toggle-page-translation", {
      id: "toggle-page-translation", title: "翻译当前网页", contexts: ["page"]
    });
    vi.stubGlobal("chrome", api);

    await import("../../../src/background/index");
    api.runtime.onStartup.emit();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.contextMenus.onClicked.addListener).toHaveBeenCalledOnce();
    expect(api.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    expect(api.contextMenus.removeAll).not.toHaveBeenCalled();
    expect(api.contextMenus.create).not.toHaveBeenCalled();
    expect(menus.get("toggle-page-translation")?.title).toBe("翻译当前网页");

    api.contextMenus.onClicked.emit({ menuItemId: "toggle-page-translation" }, { id: 7 });
    await vi.waitFor(() => expect(api.tabs.sendMessage).toHaveBeenCalledWith(7,
      { type: "page/activate", tabId: 7, debugMode: false }));
  });

  it("serializes overlapping installation and language updates without duplicate IDs", async () => {
    const { api, menus, creationErrors, changeLanguage } = createChromeMock();
    vi.stubGlobal("chrome", api);
    await import("../../../src/background/index");

    api.runtime.onInstalled.emit();
    changeLanguage("en");
    changeLanguage("ja");

    await vi.waitFor(() => expect(menus.has("selection-explain")).toBe(true));
    expect(creationErrors).toEqual([]);
    expect(api.contextMenus.create).toHaveBeenCalledTimes(12);
    expect([...menus.keys()]).toEqual([
      "toggle-page-translation", "selection-parent", "selection-translate", "selection-explain"
    ]);
    expect(menus.get("toggle-page-translation")?.title).toBe("このページを翻訳");
    expect(menus.get("selection-translate")?.title).toBe("翻訳");
  });

  it("reports creation failure and allows the next rebuild to recover", async () => {
    const { api, menus, changeLanguage } = createChromeMock();
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    api.contextMenus.create.mockImplementationOnce((item, callback) => {
      queueMicrotask(() => {
        api.runtime.lastError = { message: "Menu creation failed" };
        callback?.();
        api.runtime.lastError = undefined;
      });
      return item.id;
    });
    vi.stubGlobal("chrome", api);
    await import("../../../src/background/index");

    api.runtime.onInstalled.emit();
    changeLanguage("en");

    await vi.waitFor(() => expect(menus.size).toBe(4));
    expect(logError).toHaveBeenCalledExactlyOnceWith("Failed to register context menus:",
      expect.objectContaining({ message: "Menu creation failed" }));
    expect(api.contextMenus.create).toHaveBeenCalledTimes(5);
    expect(menus.get("toggle-page-translation")?.title).toBe("Translate current webpage");
  });
});
