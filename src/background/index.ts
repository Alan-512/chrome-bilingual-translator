import { PersistentTranslationCache } from "../shared/cacheStore";
import { loadExtensionConfig } from "../shared/storage";
import { createChromeStorageArea } from "../shared/storage";
import { createTranslatorClient } from "../shared/translatorClient";
import {
  MENU_ID_TOGGLE_TRANSLATION,
  refreshToggleMenu,
  registerOptionalContextMenuShownListener,
  registerToggleMenu
} from "./contextMenus";
import { createBackgroundMessageRouter } from "./messageRouter";
import { createChromeApiOriginPermissionRequester } from "./permissionManager";
import { SessionStorageTabSessionStore } from "./tabSessionStore";

const localStorageArea = createChromeStorageArea(chrome.storage.local);
const sessionStorageArea = createChromeStorageArea(chrome.storage.session ?? chrome.storage.local);
const tabSessionStore = new SessionStorageTabSessionStore(sessionStorageArea);
const translator = createTranslatorClient({
  fetchImpl: (...args) => fetch(...args),
  cache: new PersistentTranslationCache(localStorageArea)
});
const messageRouter = createBackgroundMessageRouter({
  loadConfig: async () => loadExtensionConfig(localStorageArea),
  translator,
  requestApiPermission: createChromeApiOriginPermissionRequester(),
  tabSessionStore
});

async function ensureMenuRegistered() {
  await chrome.contextMenus.removeAll();
  await registerToggleMenu(chrome.contextMenus, { enabled: false });
}

async function sendLifecycleMessage(tabId: number, type: "page/activate" | "page/deactivate") {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["dist/content.js"]
  });

  const config = type === "page/activate" ? await loadExtensionConfig(localStorageArea) : null;
  await chrome.tabs.sendMessage(tabId, {
    type,
    tabId,
    ...(type === "page/activate" ? { debugMode: config?.debugMode ?? false } : {})
  });
}

async function bootstrap() {
  if (typeof chrome === "undefined" || !chrome.contextMenus || !chrome.runtime?.onMessage) {
    return;
  }

  await ensureMenuRegistered();

  chrome.runtime.onInstalled.addListener(() => {
    void ensureMenuRegistered();
  });

  chrome.runtime.onStartup.addListener(() => {
    void ensureMenuRegistered();
  });

  registerOptionalContextMenuShownListener(chrome.contextMenus, (_info, tab) => {
    const tabId = tab?.id;
    if (typeof tabId !== "number") {
      return;
    }

    void (async () => {
      const session = await tabSessionStore.get(tabId);
      await refreshToggleMenu(chrome.contextMenus, session);
      chrome.contextMenus.refresh?.();
    })();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID_TOGGLE_TRANSLATION || typeof tab?.id !== "number") {
      return;
    }

    void (async () => {
      const session = await tabSessionStore.get(tab.id);
      await sendLifecycleMessage(tab.id, session.enabled ? "page/deactivate" : "page/activate");
    })();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      try {
        const response = await messageRouter.handleMessage(message, sender);
        sendResponse(response);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown background error"
        });
      }
    })();

    return true;
  });
}

void bootstrap();
