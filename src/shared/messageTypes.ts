export type ActivatePageTranslationMessage = {
  type: "page/activate";
  tabId: number;
};

export type DeactivatePageTranslationMessage = {
  type: "page/deactivate";
  tabId: number;
};

export type TranslationRequestBlock = {
  blockId: string;
  sourceText: string;
};

export type TranslationRequestMessage = {
  type: "translation/request";
  tabId: number;
  blocks: TranslationRequestBlock[];
};

export type ApiTestMessage = {
  type: "api/test";
  config: {
    apiBaseUrl: string;
    apiKey: string;
    model: string;
    translateTitles: boolean;
    translateShortContentBlocks: boolean;
  };
};

export type PageStatusReportMessage = {
  type: "page/status";
  tabId: number;
  enabled: boolean;
  translatedBlockCount: number;
  pendingRequestCount: number;
};

export type RuntimeMessage =
  | ActivatePageTranslationMessage
  | DeactivatePageTranslationMessage
  | ApiTestMessage
  | TranslationRequestMessage
  | PageStatusReportMessage;
