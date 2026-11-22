import { createPageController } from "./pageController";
import { isExtensionContextInvalidatedError } from "./runtimeMessaging";
import {
  captureRegionsAreCurrent,
  findContextImage,
  readSelectedImages,
  suspendSelectionHighlight
} from "./selectionImages";
import { getSelectionAndContext, SelectionTooltipManager } from "./selectionTooltip";
import {
  type SelectionAction,
  type SelectionContextResponse,
  type SelectionRequestContextMessage,
  type SelectionShowLoadingMessage,
  type SelectionRenderResultMessage
} from "../shared/messageTypes";

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
  let pendingSelection: {
    requestId: string;
    action: SelectionAction;
    sourceText: string;
    rect: DOMRect;
    restoreSelection?: () => void;
    validateCapture?: () => boolean;
  } | undefined;

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
      const { action, requestId, imageUrl, hasSelectionText } = message as SelectionRequestContextMessage;
      pendingSelection?.restoreSelection?.();
      const clickedImage = imageUrl ? findContextImage(imageUrl) : undefined;
      let selection = getSelectionAndContext(action === "explain");
      if (clickedImage && !hasSelectionText && !selection?.images.includes(clickedImage)) {
        selection = null;
      }
      if (!selection && !imageUrl) {
        sendResponse(null);
        return;
      }

      const selectionText = selection?.selectionText ?? "";
      const images = selection?.images ?? [];
      if (clickedImage && !images.includes(clickedImage)) images.push(clickedImage);
      const rect = selection?.rect ?? clickedImage?.getBoundingClientRect() ??
        new DOMRect(window.innerWidth / 2, window.innerHeight / 2);
      const imageLabel = images.length > 1 ? `已选 ${images.length} 张图片` : "图片";
      const sourceText = imageUrl || images.length
        ? [selectionText, imageLabel].filter(Boolean).join(" · ")
        : selectionText;
      const tooltip = SelectionTooltipManager.getInstance();
      tooltip.destroy();
      pendingSelection = { requestId, action, sourceText, rect };

      try {
        if (imageUrl && !clickedImage) throw new Error("无法定位这张图片，请重新右键点击图片后重试。");
        const selectedImages = readSelectedImages(images);
        const response: SelectionContextResponse = {
          selectionText,
          contextText: selectionText ? selection?.contextText ?? "" : "",
          images: selectedImages
        };
        if (selectedImages.some((image) => "capture" in image)) {
          pendingSelection.validateCapture = () => captureRegionsAreCurrent(images, selectedImages);
          if (selection?.domSelection) {
            const { ready, restore } = suspendSelectionHighlight(selection.domSelection);
            pendingSelection.restoreSelection = restore;
            void ready.then(() => sendResponse(pendingSelection?.requestId === requestId ? response : null));
            return true;
          }
        } else {
          tooltip.showLoading(rect, action, sourceText);
        }
        sendResponse(response);
      } catch (error) {
        pendingSelection = undefined;
        tooltip.showLoading(rect, action, sourceText);
        tooltip.renderError(action, sourceText, error instanceof Error ? error.message : String(error));
        sendResponse(null);
      }
      return;
    }

    if (message?.type === "selection/show-loading") {
      const { requestId } = message as SelectionShowLoadingMessage;
      const pending = pendingSelection;
      if (!pending || pending.requestId !== requestId) {
        sendResponse({ ok: false });
        return;
      }

      const captureIsCurrent = pending.validateCapture?.() ?? true;
      pending.restoreSelection?.();
      const tooltip = SelectionTooltipManager.getInstance();
      tooltip.showLoading(pending.rect, pending.action, pending.sourceText);
      if (!captureIsCurrent) {
        pendingSelection = undefined;
        tooltip.renderError(pending.action, pending.sourceText, "图片位置已变化，请重新选中图片后重试。");
      }
      sendResponse({ ok: captureIsCurrent });
      return;
    }

    if (message?.type === "selection/render-result") {
      const result = message as SelectionRenderResultMessage;
      const pending = pendingSelection;
      if (!pending || pending.requestId !== result.requestId) {
        sendResponse({ ok: false });
        return;
      }
      pendingSelection = undefined;
      const tooltip = SelectionTooltipManager.getInstance();

      if (result.status === "success") {
        tooltip.renderResult(pending.action, pending.sourceText, result.text);
      } else {
        tooltip.renderError(pending.action, pending.sourceText, result.error);
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
      pendingSelection?.restoreSelection?.();
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
