import { type TabSessionRecord } from "./tabSessionStore";
import { type TargetLanguageCode } from "../shared/config";

export const MENU_ID_TOGGLE_TRANSLATION = "toggle-page-translation";

export const MENU_ID_SELECTION_PARENT = "selection-parent";
export const MENU_ID_SELECTION_TRANSLATE = "selection-translate";
export const MENU_ID_SELECTION_EXPLAIN = "selection-explain";

export type ContextMenuItem = {
  id: string;
  title: string;
  contexts: chrome.contextMenus.ContextType[];
  parentId?: string;
};

export type ContextMenusCreateApi = {
  create(item: ContextMenuItem): void | Promise<void>;
};

export type ContextMenusUpdateApi = {
  update(id: string, update: Pick<ContextMenuItem, "title">): void | Promise<void>;
};

export type ContextMenusOnShownApi = {
  onShown?: {
    addListener(listener: (info: unknown, tab?: chrome.tabs.Tab) => void): void;
  };
};

type ToggleMenuTitles = {
  translate: string;
  hide: string;
};

const TOGGLE_MENU_TITLES: Record<TargetLanguageCode, ToggleMenuTitles> = {
  "zh-CN": {
    translate: "翻译当前网页",
    hide: "显示原文"
  },
  "zh-TW": {
    translate: "翻譯當前網頁",
    hide: "顯示原文"
  },
  "en": {
    translate: "Translate current webpage",
    hide: "Hide translated webpage"
  },
  "ja": {
    translate: "このページを翻訳",
    hide: "原文を表示"
  },
  "ko": {
    translate: "현재 페이지 번역",
    hide: "원문 보기"
  },
  "fr": {
    translate: "Traduire la page",
    hide: "Afficher l'original"
  },
  "de": {
    translate: "Seite übersetzen",
    hide: "Original anzeigen"
  },
  "es": {
    translate: "Traducir esta página",
    hide: "Mostrar original"
  },
  "pt": {
    translate: "Traduzir esta página",
    hide: "Mostrar original"
  },
  "ru": {
    translate: "Перевести страницу",
    hide: "Показать оригинал"
  },
  "ar": {
    translate: "ترجمة هذه الصفحة",
    hide: "عرض الصفحة الأصلية"
  }
};

export function getToggleMenuTitle(
  session: Pick<TabSessionRecord, "enabled">,
  targetLanguage: TargetLanguageCode = "en"
): string {
  const titles = TOGGLE_MENU_TITLES[targetLanguage] || TOGGLE_MENU_TITLES["en"];
  return session.enabled ? titles.hide : titles.translate;
}

export function buildToggleMenuItem(
  session: Pick<TabSessionRecord, "enabled">,
  targetLanguage: TargetLanguageCode = "en"
): ContextMenuItem {
  return {
    id: MENU_ID_TOGGLE_TRANSLATION,
    title: getToggleMenuTitle(session, targetLanguage),
    contexts: ["page"]
  };
}

export async function registerToggleMenu(
  api: ContextMenusCreateApi,
  session: Pick<TabSessionRecord, "enabled">,
  targetLanguage: TargetLanguageCode = "en"
): Promise<void> {
  await api.create(buildToggleMenuItem(session, targetLanguage));
}

type SelectionMenuTitles = {
  parent: string;
  translate: string;
  explain: string;
};

const SELECTION_MENU_TITLES: Record<TargetLanguageCode, SelectionMenuTitles> = {
  "zh-CN": {
    parent: "AI 操作",
    translate: "翻译",
    explain: "解释"
  },
  "zh-TW": {
    parent: "AI 動作",
    translate: "翻譯",
    explain: "解釋"
  },
  "en": {
    parent: "AI Actions",
    translate: "Translate",
    explain: "Explain"
  },
  "ja": {
    parent: "AI 操作",
    translate: "翻訳",
    explain: "解説"
  },
  "ko": {
    parent: "AI 작업",
    translate: "번역",
    explain: "설명"
  },
  "fr": {
    parent: "Actions IA",
    translate: "Traduire",
    explain: "Expliquer"
  },
  "de": {
    parent: "KI-Aktionen",
    translate: "Übersetzen",
    explain: "Erklären"
  },
  "es": {
    parent: "Acciones de IA",
    translate: "Traducir",
    explain: "Explicar"
  },
  "pt": {
    parent: "Ações de IA",
    translate: "Traduzir",
    explain: "Explicar"
  },
  "ru": {
    parent: "Действия ИИ",
    translate: "Перевести",
    explain: "Объяснить"
  },
  "ar": {
    parent: "إجراءات الذكاء الاصطناعي",
    translate: "ترجمة",
    explain: "شرح"
  }
};

export function getSelectionMenuTitles(targetLanguage: TargetLanguageCode): SelectionMenuTitles {
  return SELECTION_MENU_TITLES[targetLanguage] || SELECTION_MENU_TITLES["en"];
}

export async function registerSelectionMenus(
  api: ContextMenusCreateApi,
  targetLanguage: TargetLanguageCode
): Promise<void> {
  const titles = getSelectionMenuTitles(targetLanguage);
  await api.create({
    id: MENU_ID_SELECTION_PARENT,
    title: titles.parent,
    contexts: ["selection"]
  });
  await api.create({
    id: MENU_ID_SELECTION_TRANSLATE,
    parentId: MENU_ID_SELECTION_PARENT,
    title: titles.translate,
    contexts: ["selection"]
  });
  await api.create({
    id: MENU_ID_SELECTION_EXPLAIN,
    parentId: MENU_ID_SELECTION_PARENT,
    title: titles.explain,
    contexts: ["selection"]
  });
}

export async function refreshToggleMenu(
  api: ContextMenusUpdateApi,
  session: Pick<TabSessionRecord, "enabled">,
  targetLanguage: TargetLanguageCode = "en"
): Promise<void> {
  await api.update(MENU_ID_TOGGLE_TRANSLATION, {
    title: getToggleMenuTitle(session, targetLanguage)
  });
}

export function registerOptionalContextMenuShownListener(
  api: ContextMenusOnShownApi,
  listener: (info: unknown, tab?: chrome.tabs.Tab) => void
): void {
  api.onShown?.addListener(listener);
}
