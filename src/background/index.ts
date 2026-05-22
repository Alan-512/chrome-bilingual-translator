import { PersistentTranslationCache } from "../shared/cacheStore";
import { loadExtensionConfig } from "../shared/storage";
import { createChromeStorageArea } from "../shared/storage";
import { createTranslatorClient } from "../shared/translatorClient";
import {
  MENU_ID_TOGGLE_TRANSLATION,
  MENU_ID_SELECTION_TRANSLATE,
  MENU_ID_SELECTION_EXPLAIN,
  refreshToggleMenu,
  registerOptionalContextMenuShownListener,
  registerToggleMenu,
  registerSelectionMenus
} from "./contextMenus";
import { createBackgroundMessageRouter } from "./messageRouter";
import { createChromeApiOriginPermissionRequester } from "./permissionManager";
import { SessionStorageTabSessionStore } from "./tabSessionStore";
import { getMissingConfigFields, getApiBaseUrlSecurityError } from "../shared/config";

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
  const config = await loadExtensionConfig(localStorageArea);
  await chrome.contextMenus.removeAll();
  await registerToggleMenu(chrome.contextMenus, { enabled: false }, config.targetLanguage);
  await registerSelectionMenus(chrome.contextMenus, config.targetLanguage);
}


async function sendLifecycleMessage(tabId: number, type: "page/activate" | "page/deactivate") {
  await debugLog("lifecycle:dispatch:start", {
    tabId,
    type
  });

  if (type === "page/activate") {
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
  } else {
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
      await debugLog("lifecycle:dispatch:missing-runtime", {
        tabId,
        type
      });
      await tabSessionStore.clear(tabId);
      return;
    }
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

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.extensionConfig) {
      const oldLang = (changes.extensionConfig.oldValue as any)?.targetLanguage;
      const newLang = (changes.extensionConfig.newValue as any)?.targetLanguage;
      if (oldLang !== newLang) {
        void ensureMenuRegistered();
      }
    }
  });

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
      const config = await loadExtensionConfig(localStorageArea);
      await debugLog("context-menu:shown", {
        tabId,
        enabled: session.enabled,
        translatedBlockCount: session.translatedBlockCount,
        pendingRequestCount: session.pendingRequestCount
      });
      await refreshToggleMenu(chrome.contextMenus, session, config.targetLanguage);
      chrome.contextMenus.refresh?.();
    })();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (typeof tab?.id !== "number") {
      return;
    }

    if (info.menuItemId === MENU_ID_TOGGLE_TRANSLATION) {
      void (async () => {
        const session = await tabSessionStore.get(tab.id);
        const type = session.enabled ? "page/deactivate" : "page/activate";
        await debugLog("context-menu:clicked", {
          tabId: tab.id,
          enabled: session.enabled,
          type
        });
        await sendLifecycleMessage(tab.id, type);
      })();
      return;
    }

    if (info.menuItemId === MENU_ID_SELECTION_TRANSLATE || info.menuItemId === MENU_ID_SELECTION_EXPLAIN) {
      const action = info.menuItemId === MENU_ID_SELECTION_TRANSLATE ? "translate" : "explain";
      const frameId = typeof info.frameId === "number" ? info.frameId : 0;

      void (async () => {
        await debugLog("context-menu:selection:clicked", {
          tabId: tab.id,
          frameId,
          action
        });

        // 1. Check if the content script is loaded in the target frame.
        let isLoaded = false;
        try {
          const pingResponse = await chrome.tabs.sendMessage(
            tab.id,
            { type: "runtime/ping" },
            { frameId }
          );
          if (pingResponse?.ok) {
            isLoaded = true;
          }
        } catch {
          // ignore error, will inject script
        }

        // 2. Dynamic injection if not loaded
        if (!isLoaded) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              files: ["dist/content.js"]
            });
            await debugLog("context-menu:selection:injected-runtime", {
              tabId: tab.id,
              frameId
            });
          } catch (injectError) {
            console.error("Failed to inject content script into frame:", injectError);
            return;
          }
        }

        // 3. Request selection context from target frame
        let selectionContext: { selectionText: string; contextText: string } | null = null;
        try {
          selectionContext = await chrome.tabs.sendMessage(
            tab.id,
            { type: "selection/request-context", action },
            { frameId }
          );
        } catch (msgError) {
          console.error("Failed to request context from frame:", msgError);
          return;
        }

        if (!selectionContext || !selectionContext.selectionText) {
          await debugLog("context-menu:selection:empty", { tabId: tab.id, frameId });
          return;
        }

        const { selectionText, contextText } = selectionContext;

        try {
          // 4. Assert endpoint configuration and verify origin permissions
          const config = await loadExtensionConfig(localStorageArea);
          const missingFields = getMissingConfigFields(config);

          if (missingFields.length > 0) {
            throw new Error(`Missing required configuration: ${missingFields.join(", ")}. Please configure API keys in the extension options.`);
          }

          const securityError = getApiBaseUrlSecurityError(config.apiBaseUrl);
          if (securityError) {
            throw new Error(securityError);
          }

          if (config.apiOrigin) {
            const requester = createChromeApiOriginPermissionRequester();
            const granted = await requester(config.apiOrigin);
            if (!granted) {
              throw new Error("API origin permission was denied. Please grant permission to make LLM API requests.");
            }
          }

          // 5. Invoke translator
          const resultText = await translator.translateOrExplainSelection({
            config,
            action,
            selectionText,
            contextText
          });

          // 6. Dispatch render result
          await chrome.tabs.sendMessage(
            tab.id,
            {
              type: "selection/render-result",
              action,
              status: "success",
              text: resultText
            },
            { frameId }
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          await chrome.tabs.sendMessage(
            tab.id,
            {
              type: "selection/render-result",
              action,
              status: "error",
              error: errorMsg
            },
            { frameId }
          );
        }
      })();
      return;
    }
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
