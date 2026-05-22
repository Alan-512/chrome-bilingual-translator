import { createPageController } from "./pageController";
import { isExtensionContextInvalidatedError } from "./runtimeMessaging";
import { getSelectionAndContext, SelectionTooltipManager } from "./selectionTooltip";

declare global {
  interface Window {
    __bilingualTranslatorContentRuntime?: {
      dispose: () => void;
    };
  }
}

function bootstrapContentRuntime() {
  let currentTabId = 0;
  let debugMode = false;
  let lastSelectionText = "";

  const controller = createPageController(document, {
    async requestTranslations(blocks) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "translation/request",
          tabId: currentTabId,
          blocks
        });

        if (!response?.ok) {
          throw new Error(response?.error ?? "Translation request failed.");
        }

        return response.translations as Record<string, string>;
      } catch (error) {
        if (isExtensionContextInvalidatedError(error)) {
          throw new Error("Extension was reloaded. Reload the page and try again.");
        }

        throw error;
      }
    },
    async reportPageState(state) {
      try {
        await chrome.runtime.sendMessage({
          type: "page/status",
          tabId: currentTabId,
          ...state
        });
      } catch (error) {
        if (!isExtensionContextInvalidatedError(error)) {
          throw error;
        }
      }
    },
    debugLog(event, detail) {
      if (!debugMode) {
        return;
      }

      console.log("[bilingual]", event, detail ?? {});
    }
  });

  const runtimeListener = (
    message: { type?: string; tabId?: number },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) => {
    if (message?.type === "runtime/ping") {
      if (debugMode) {
        console.log("[bilingual]", "runtime/ping", {
          href: window.location.href,
          tabId: currentTabId
        });
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "page/activate" && typeof message.tabId === "number") {
      currentTabId = message.tabId;
      debugMode = Boolean((message as { debugMode?: boolean }).debugMode);
      if (debugMode) {
        console.log("[bilingual]", "page/activate", {
          href: window.location.href,
          tabId: currentTabId
        });
      }
      void controller.activate();
    }

    if (message?.type === "page/deactivate" && typeof message.tabId === "number") {
      currentTabId = message.tabId;
      if (debugMode) {
        console.log("[bilingual]", "page/deactivate", {
          href: window.location.href,
          tabId: currentTabId
        });
      }
      debugMode = false;
      void controller.deactivate();
    }

    if (message?.type === "selection/request-context") {
      const { action } = message as { action: "translate" | "explain" };
      const selectionInfo = getSelectionAndContext();
      if (!selectionInfo) {
        sendResponse(null);
        return;
      }

      lastSelectionText = selectionInfo.selectionText;

      // Render loading tooltip card
      SelectionTooltipManager.getInstance().showLoading(
        selectionInfo.rect,
        action,
        selectionInfo.selectionText
      );

      sendResponse({
        selectionText: selectionInfo.selectionText,
        contextText: selectionInfo.contextText
      });
      return;
    }

    if (message?.type === "selection/render-result") {
      const { action, status, text, error } = message as {
        action: "translate" | "explain";
        status: "success" | "error";
        text?: string;
        error?: string;
      };

      const tooltip = SelectionTooltipManager.getInstance();

      if (status === "success" && text) {
        tooltip.renderResult(action, lastSelectionText, text);
      } else {
        tooltip.renderError(action, lastSelectionText, error || "Unknown rendering error.");
      }
      sendResponse({ ok: true });
      return;
    }
  };

  const storageListener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === "local" && changes.extensionConfig) {
      const oldConfig = changes.extensionConfig.oldValue;
      const newConfig = changes.extensionConfig.newValue;
      const oldLang = oldConfig?.targetLanguage;
      const newLang = newConfig?.targetLanguage;
      if (oldLang && newLang && oldLang !== newLang) {
        if (controller.isActive()) {
          if (debugMode) {
            console.log("[bilingual]", "targetLanguage changed, reactivating pageController", { oldLang, newLang });
          }
          void (async () => {
            await controller.deactivate();
            await controller.activate();
          })();
        }
      }
    }
  };

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(runtimeListener);
  }

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(storageListener);
  }

  return {
    dispose() {
      chrome.runtime?.onMessage?.removeListener?.(runtimeListener);
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(storageListener);
      }
      void controller.deactivate().catch(() => {});
      SelectionTooltipManager.getInstance().destroy();
    }
  };
}

if (typeof window !== "undefined" && typeof chrome !== "undefined") {
  window.__bilingualTranslatorContentRuntime?.dispose();
  window.__bilingualTranslatorContentRuntime = bootstrapContentRuntime();
}
