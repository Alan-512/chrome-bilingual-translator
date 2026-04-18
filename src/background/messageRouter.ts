import { getMissingConfigFields, type ExtensionConfig } from "../shared/config";
import { type RuntimeMessage, type TranslationRequestMessage } from "../shared/messageTypes";
import { type TranslatorClient } from "../shared/translatorClient";
import { type ApiOriginPermissionRequester } from "./permissionManager";
import { type SessionStorageTabSessionStore } from "./tabSessionStore";

type BackgroundMessageRouterDependencies = {
  loadConfig: () => Promise<ExtensionConfig>;
  translator: TranslatorClient;
  requestApiPermission: ApiOriginPermissionRequester;
  tabSessionStore: SessionStorageTabSessionStore;
};

type MessageSenderLike = {
  tab?: {
    id?: number;
  };
};

async function handleTranslationRequest(
  message: TranslationRequestMessage,
  dependencies: BackgroundMessageRouterDependencies
) {
  const config = await dependencies.loadConfig();
  const missingFields = getMissingConfigFields(config);

  if (missingFields.length > 0) {
    throw new Error(`Missing required configuration: ${missingFields.join(", ")}`);
  }

  if (config.apiOrigin) {
    const granted = await dependencies.requestApiPermission(config.apiOrigin);
    if (!granted) {
      throw new Error("API origin permission was denied.");
    }
  }

  const translations = await dependencies.translator.translateBlocks({
    config,
    blocks: message.blocks
  });

  const previousSession = await dependencies.tabSessionStore.get(message.tabId);
  await dependencies.tabSessionStore.set(message.tabId, {
    enabled: true,
    translatedBlockCount: previousSession.translatedBlockCount + Object.keys(translations).length,
    pendingRequestCount: 0
  });

  return {
    ok: true as const,
    translations
  };
}

export function createBackgroundMessageRouter(dependencies: BackgroundMessageRouterDependencies) {
  return {
    async handleMessage(message: RuntimeMessage, _sender: MessageSenderLike) {
      if (message.type === "translation/request") {
        return handleTranslationRequest(message, dependencies);
      }

      if (message.type === "page/status") {
        await dependencies.tabSessionStore.set(message.tabId, {
          enabled: message.enabled,
          translatedBlockCount: message.translatedBlockCount,
          pendingRequestCount: message.pendingRequestCount
        });

        return { ok: true as const };
      }

      return { ok: false as const };
    }
  };
}
