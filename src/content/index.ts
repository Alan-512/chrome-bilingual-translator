import { createPageController } from "./pageController";

declare global {
  interface Window {
    __bilingualTranslatorContentBootstrapped?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__bilingualTranslatorContentBootstrapped) {
  window.__bilingualTranslatorContentBootstrapped = true;

  let currentTabId = 0;
  const controller = createPageController(document, {
    async requestTranslations(blocks) {
      const response = await chrome.runtime.sendMessage({
        type: "translation/request",
        tabId: currentTabId,
        blocks
      });

      if (!response?.ok) {
        throw new Error(response?.error ?? "Translation request failed.");
      }

      return response.translations as Record<string, string>;
    },
    async reportPageState(state) {
      await chrome.runtime.sendMessage({
        type: "page/status",
        tabId: currentTabId,
        ...state
      });
    }
  });

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "page/activate") {
        currentTabId = message.tabId;
        void controller.activate();
      }

      if (message?.type === "page/deactivate") {
        currentTabId = message.tabId;
        void controller.deactivate();
      }
    });
  }
}
