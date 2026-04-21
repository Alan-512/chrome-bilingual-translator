import {
  buildPersistedConfigRecord,
  getApiBaseUrlSecurityError,
  getMissingConfigFields,
  type ExtensionConfig
} from "../shared/config";
import { type ApiTestMessage, type RuntimeMessage, type TranslationRequestMessage } from "../shared/messageTypes";
import { type TranslatorClient } from "../shared/translatorClient";
import { type ApiOriginPermissionRequester } from "./permissionManager";
import { type SessionStorageTabSessionStore } from "./tabSessionStore";

type BackgroundMessageRouterDependencies = {
  loadConfig: () => Promise<ExtensionConfig>;
  translator: TranslatorClient;
  requestApiPermission: ApiOriginPermissionRequester;
  tabSessionStore: SessionStorageTabSessionStore;
  debugLog?: (event: string, detail?: Record<string, unknown>) => void | Promise<void>;
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
  await dependencies.debugLog?.("translation/request:received", {
    tabId: message.tabId,
    blockCount: message.blocks.length,
    blockIds: message.blocks.map((block) => block.blockId)
  });

  const config = await dependencies.loadConfig();
  const missingFields = getMissingConfigFields(config);

  if (missingFields.length > 0) {
    throw new Error(`Missing required configuration: ${missingFields.join(", ")}`);
  }

  const securityError = getApiBaseUrlSecurityError(config.apiBaseUrl);
  if (securityError) {
    throw new Error(securityError);
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

  await dependencies.debugLog?.("translation/request:succeeded", {
    tabId: message.tabId,
    translatedBlockCount: Object.keys(translations).length
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

async function handleApiTest(message: ApiTestMessage, dependencies: BackgroundMessageRouterDependencies) {
  await dependencies.debugLog?.("api/test:received", {
    provider: message.config.provider,
    model: message.config.model,
    apiBaseUrl: message.config.apiBaseUrl
  });

  const config = buildPersistedConfigRecord(message.config);
  const missingFields = getMissingConfigFields(config);

  if (missingFields.length > 0) {
    throw new Error(`Missing required configuration: ${missingFields.join(", ")}`);
  }

  const securityError = getApiBaseUrlSecurityError(config.apiBaseUrl);
  if (securityError) {
    throw new Error(securityError);
  }

  if (config.apiOrigin) {
    const granted = await dependencies.requestApiPermission(config.apiOrigin);
    if (!granted) {
      throw new Error("API origin permission was denied.");
    }
  }

  await dependencies.translator.testConnection({ config });

  await dependencies.debugLog?.("api/test:succeeded", {
    provider: config.provider,
    model: config.model
  });

  return { ok: true as const };
}

export function createBackgroundMessageRouter(dependencies: BackgroundMessageRouterDependencies) {
  return {
    async handleMessage(message: RuntimeMessage, _sender: MessageSenderLike) {
      await dependencies.debugLog?.("runtime/message:received", {
        type: message.type,
        tabId: "tabId" in message ? message.tabId : undefined
      });

      if (message.type === "api/test") {
        return handleApiTest(message, dependencies);
      }

      if (message.type === "translation/request") {
        return handleTranslationRequest(message, dependencies);
      }

      if (message.type === "page/status") {
        await dependencies.debugLog?.("page/status:received", {
          tabId: message.tabId,
          enabled: message.enabled,
          translatedBlockCount: message.translatedBlockCount,
          pendingRequestCount: message.pendingRequestCount
        });

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
