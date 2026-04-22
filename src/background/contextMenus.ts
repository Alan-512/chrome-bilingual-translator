import { type TabSessionRecord } from "./tabSessionStore";

export const MENU_ID_TOGGLE_TRANSLATION = "toggle-page-translation";
const TRANSLATE_MENU_TITLE = "Translate current webpage";
const HIDE_TRANSLATION_MENU_TITLE = "Hide translated webpage";

export type ContextMenuItem = {
  id: string;
  title: string;
  contexts: chrome.contextMenus.ContextType[];
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

export function getToggleMenuTitle(session: Pick<TabSessionRecord, "enabled">): string {
  return session.enabled ? HIDE_TRANSLATION_MENU_TITLE : TRANSLATE_MENU_TITLE;
}

export function buildToggleMenuItem(session: Pick<TabSessionRecord, "enabled">): ContextMenuItem {
  return {
    id: MENU_ID_TOGGLE_TRANSLATION,
    title: getToggleMenuTitle(session),
    contexts: ["page"]
  };
}

export async function registerToggleMenu(
  api: ContextMenusCreateApi,
  session: Pick<TabSessionRecord, "enabled">
): Promise<void> {
  await api.create(buildToggleMenuItem(session));
}

export async function refreshToggleMenu(
  api: ContextMenusUpdateApi,
  session: Pick<TabSessionRecord, "enabled">
): Promise<void> {
  await api.update(MENU_ID_TOGGLE_TRANSLATION, {
    title: getToggleMenuTitle(session)
  });
}

export function registerOptionalContextMenuShownListener(
  api: ContextMenusOnShownApi,
  listener: (info: unknown, tab?: chrome.tabs.Tab) => void
): void {
  api.onShown?.addListener(listener);
}
