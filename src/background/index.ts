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
import {
  type SelectionContextResponse,
  type SelectionRequestContextMessage,
  type SelectionRenderResultMessage,
  type SelectionShowLoadingMessage
} from "../shared/messageTypes";
import { resolveSelectionImages } from "./selectionImageCapture";

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

let menuRegistration = Promise.resolve();

function ensureMenuRegistered(): Promise<void> {
  // Installation and configuration changes can overlap. Keep each rebuild atomic
  // with respect to other rebuilds, including the asynchronous create callbacks.
  menuRegistration = menuRegistration.then(async () => {
    const config = await loadExtensionConfig(localStorageArea);
    await chrome.contextMenus.removeAll();
    await registerToggleMenu(chrome.contextMenus, { enabled: false }, config.targetLanguage);
    await registerSelectionMenus(chrome.contextMenus, config.targetLanguage);
  }).catch((error) => {
    console.error("Failed to register context menus:", error);
  });
  return menuRegistration;
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

function bootstrap() {
  if (typeof chrome === "undefined" || !chrome.contextMenus || !chrome.runtime?.onMessage) {
    return;
  }

  // Register Service Worker event listeners synchronously before any async startup work.
  // Chrome persists menu items across Worker restarts; only rebuild on installation
  // or a target-language change, never on every Worker wake.
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
    const tabId = tab?.id;
    if (!tab || typeof tabId !== "number") {
      return;
    }

    if (info.menuItemId === MENU_ID_TOGGLE_TRANSLATION) {
      void (async () => {
        const session = await tabSessionStore.get(tabId);
        const type = session.enabled ? "page/deactivate" : "page/activate";
        await debugLog("context-menu:clicked", {
          tabId,
          enabled: session.enabled,
          type
        });
        await sendLifecycleMessage(tabId, type);
      })();
      return;
    }

    if (info.menuItemId === MENU_ID_SELECTION_TRANSLATE || info.menuItemId === MENU_ID_SELECTION_EXPLAIN) {
      const action = info.menuItemId === MENU_ID_SELECTION_TRANSLATE ? "translate" : "explain";
      const frameId = typeof info.frameId === "number" ? info.frameId : 0;
      const requestId = crypto.randomUUID();

      void (async () => {
        await debugLog("context-menu:selection:clicked", {
          tabId,
          frameId,
          action
        });

        // 1. Check if the content script is loaded in the target frame.
        let isLoaded = false;
        try {
          const pingResponse = await chrome.tabs.sendMessage(
            tabId,
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
              target: { tabId, frameIds: [frameId] },
              files: ["dist/content.js"]
            });
            await debugLog("context-menu:selection:injected-runtime", {
              tabId,
              frameId
            });
          } catch (injectError) {
            console.error("Failed to inject content script into frame:", injectError);
            return;
          }
        }

        // 3. Request selection context from target frame
        let selectionContext: SelectionContextResponse | null;
        try {
          const request: SelectionRequestContextMessage = {
            type: "selection/request-context",
            requestId,
            action,
            hasSelectionText: !!info.selectionText?.trim(),
            ...(action === "explain" && info.mediaType === "image" && info.srcUrl
              ? { imageUrl: info.srcUrl }
              : {})
          };
          selectionContext = await chrome.tabs.sendMessage(
            tabId,
            request,
            { frameId }
          );
        } catch (msgError) {
          console.error("Failed to request context from frame:", msgError);
          return;
        }

        if (!selectionContext || (!selectionContext.selectionText && !selectionContext.images.length)) {
          await debugLog("context-menu:selection:empty", { tabId, frameId });
          return;
        }

        const { selectionText, contextText, images } = selectionContext;
        let result: SelectionRenderResultMessage;

        try {
          let imageDataUrls: string[];
          let isCurrentRequest = true;
          try {
            imageDataUrls = await resolveSelectionImages(images, tabId, tab.windowId, info.pageUrl);
          } finally {
            if (images.some((image) => "capture" in image)) {
              const loading: SelectionShowLoadingMessage = { type: "selection/show-loading", requestId };
              const response = await chrome.tabs.sendMessage(tabId, loading, { frameId });
              isCurrentRequest = Boolean(response?.ok);
            }
          }
          if (!isCurrentRequest) return;

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
          const text = await translator.translateOrExplainSelection({
            config,
            action,
            selectionText,
            contextText,
            imageDataUrls
          });

          result = { type: "selection/render-result", requestId, status: "success", text };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";
          result = { type: "selection/render-result", requestId, status: "error", error };
        }

        await chrome.tabs.sendMessage(tabId, result, { frameId });
      })().catch((error) => console.error("Selection action failed:", error));
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
