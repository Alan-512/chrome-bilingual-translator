import { createPageController } from "./pageController";
import { isExtensionContextInvalidatedError } from "./runtimeMessaging";

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
    sendResponse: (response?: { ok: boolean }) => void
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
  };

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(runtimeListener);
  }

  return {
    dispose() {
      chrome.runtime?.onMessage?.removeListener?.(runtimeListener);
      void controller.deactivate().catch(() => {});
    }
  };
}

if (typeof window !== "undefined" && typeof chrome !== "undefined") {
  window.__bilingualTranslatorContentRuntime?.dispose();
  window.__bilingualTranslatorContentRuntime = bootstrapContentRuntime();
}
