export type ActivatePageTranslationMessage = {
  type: "page/activate";
  tabId: number;
  debugMode: boolean;
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
    provider: "openai-compatible" | "google-gemini";
    apiBaseUrl: string;
    apiKey: string;
    model: string;
    targetLanguage?: string;
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

export type SelectionAction = "translate" | "explain";
export const MAX_SELECTION_IMAGE_EDGE = 2048;
export const SELECTION_IMAGE_QUALITY = 0.93;

export type SelectionRequestContextMessage = {
  type: "selection/request-context";
  requestId: string;
  action: SelectionAction;
  imageUrl?: string;
  hasSelectionText: boolean;
};

export type ImageCaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export type SelectedImage = { dataUrl: string } | { capture: ImageCaptureRegion };

export type SelectionContextResponse = {
  selectionText: string;
  contextText: string;
  images: SelectedImage[];
};

export type SelectionShowLoadingMessage = {
  type: "selection/show-loading";
  requestId: string;
};

export type SelectionRenderResultMessage = {
  type: "selection/render-result";
  requestId: string;
} & ({ status: "success"; text: string } | { status: "error"; error: string });

export type RuntimeMessage =
  | ActivatePageTranslationMessage
  | DeactivatePageTranslationMessage
  | ApiTestMessage
  | TranslationRequestMessage
  | PageStatusReportMessage
  | SelectionRequestContextMessage
  | SelectionShowLoadingMessage
  | SelectionRenderResultMessage;

