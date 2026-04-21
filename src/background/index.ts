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

async function debugLog(event: string, detail?: Record<string, unknown>) {
  const config = await loadExtensionConfig(localStorageArea);

  if (!config.debugMode) {
    return;
  }

  console.log("[bilingual:bg]", event, detail ?? {});
}

const messageRouter = createBackgroundMessageRouter({
  loadConfig: async () => loadExtensionConfig(localStorageArea),
  translator,
  requestApiPermission: createChromeApiOriginPermissionRequester(),
  tabSessionStore,
  debugLog
});

async function ensureMenuRegistered() {
  await chrome.contextMenus.removeAll();
  await registerToggleMenu(chrome.contextMenus, { enabled: false });
}

async function sendLifecycleMessage(tabId: number, type: "page/activate" | "page/deactivate") {
  await debugLog("lifecycle:dispatch:start", {
    tabId,
    type
  });

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "runtime/ping"
    });

    if (!response?.ok) {
      throw new Error("Content runtime did not acknowledge ping.");
    }

    await debugLog("lifecycle:dispatch:reused-runtime", {
      tabId,
      type
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content.js"]
    });

    await debugLog("lifecycle:dispatch:injected-runtime", {
      tabId,
      type
    });
  }

  const config = type === "page/activate" ? await loadExtensionConfig(localStorageArea) : null;
  await chrome.tabs.sendMessage(tabId, {
    type,
    tabId,
    ...(type === "page/activate" ? { debugMode: config?.debugMode ?? false } : {})
  });

  await debugLog("lifecycle:dispatch:sent", {
    tabId,
    type,
    debugMode: config?.debugMode ?? false
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

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== "loading") {
      return;
    }

    void tabSessionStore.clear(tabId);
    void debugLog("tab:cleared-on-loading", {
      tabId
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void tabSessionStore.clear(tabId);
    void debugLog("tab:cleared-on-removed", {
      tabId
    });
  });

  registerOptionalContextMenuShownListener(chrome.contextMenus, (_info, tab) => {
    const tabId = tab?.id;
    if (typeof tabId !== "number") {
      return;
    }

    void (async () => {
      const session = await tabSessionStore.get(tabId);
      await debugLog("context-menu:shown", {
        tabId,
        enabled: session.enabled,
        translatedBlockCount: session.translatedBlockCount,
        pendingRequestCount: session.pendingRequestCount
      });
      await refreshToggleMenu(chrome.contextMenus, session);
      chrome.contextMenus.refresh?.();
    })();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID_TOGGLE_TRANSLATION || typeof tab?.id !== "number") {
      return;
    }

    void (async () => {
      await debugLog("context-menu:clicked", {
        tabId: tab.id
      });
      await sendLifecycleMessage(tab.id, "page/activate");
    })();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      try {
        const response = await messageRouter.handleMessage(message, sender);
        sendResponse(response);
      } catch (error) {
        await debugLog("runtime/message:error", {
          type: typeof message?.type === "string" ? message.type : "unknown",
          error: error instanceof Error ? error.message : "Unknown background error"
        });
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
