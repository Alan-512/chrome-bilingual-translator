import { describe, expect, it } from "vitest";

import {
  MENU_ID_TOGGLE_TRANSLATION,
  MENU_ID_SELECTION_PARENT,
  MENU_ID_SELECTION_TRANSLATE,
  MENU_ID_SELECTION_EXPLAIN,
  buildToggleMenuItem,
  getToggleMenuTitle,
  registerOptionalContextMenuShownListener,
  registerToggleMenu,
  refreshToggleMenu,
  registerSelectionMenus,
  type ContextMenuItem
} from "../../../src/background/contextMenus";

describe("context menu labeling", () => {
  it("uses the translate label for tabs without active translation", () => {
    expect(getToggleMenuTitle({ enabled: false })).toBe("Translate current webpage");
  });

  it("uses the hide label for tabs with active translation", () => {
    expect(getToggleMenuTitle({ enabled: true })).toBe("Hide translated webpage");
  });

  it("uses the localized translate label based on target language", () => {
    expect(getToggleMenuTitle({ enabled: false }, "zh-CN")).toBe("翻译当前网页");
    expect(getToggleMenuTitle({ enabled: false }, "zh-TW")).toBe("翻譯當前網頁");
    expect(getToggleMenuTitle({ enabled: false }, "ja")).toBe("このページを翻訳");
  });

  it("uses the localized hide label based on target language", () => {
    expect(getToggleMenuTitle({ enabled: true }, "zh-CN")).toBe("显示原文");
    expect(getToggleMenuTitle({ enabled: true }, "zh-TW")).toBe("顯示原文");
    expect(getToggleMenuTitle({ enabled: true }, "ja")).toBe("原文を表示");
  });
});

describe("buildToggleMenuItem", () => {
  it("creates a page-level menu definition with a stable id", () => {
    const menuItem: ContextMenuItem = buildToggleMenuItem({ enabled: true });

    expect(menuItem).toEqual({
      id: MENU_ID_TOGGLE_TRANSLATION,
      title: "Hide translated webpage",
      contexts: ["page"]
    });
  });

  it("creates a page-level menu definition with localized title based on target language", () => {
    const menuItem: ContextMenuItem = buildToggleMenuItem({ enabled: false }, "zh-CN");

    expect(menuItem).toEqual({
      id: MENU_ID_TOGGLE_TRANSLATION,
      title: "翻译当前网页",
      contexts: ["page"]
    });
  });
});

describe("context menu api integration", () => {
  it("registers the toggle menu item", async () => {
    const created: ContextMenuItem[] = [];

    await registerToggleMenu(
      {
        create(item) {
          created.push(item);
        }
      },
      { enabled: false }
    );

    expect(created).toEqual([
      {
        id: MENU_ID_TOGGLE_TRANSLATION,
        title: "Translate current webpage",
        contexts: ["page"]
      }
    ]);
  });

  it("registers the localized toggle menu item", async () => {
    const created: ContextMenuItem[] = [];

    await registerToggleMenu(
      {
        create(item) {
          created.push(item);
        }
      },
      { enabled: false },
      "zh-CN"
    );

    expect(created).toEqual([
      {
        id: MENU_ID_TOGGLE_TRANSLATION,
        title: "翻译当前网页",
        contexts: ["page"]
      }
    ]);
  });

  it("refreshes the toggle menu title for the current tab", async () => {
    const updates: Array<{ id: string; update: Pick<ContextMenuItem, "title"> }> = [];

    await refreshToggleMenu(
      {
        update(id, update) {
          updates.push({ id, update });
        }
      },
      { enabled: true }
    );

    expect(updates).toEqual([
      {
        id: MENU_ID_TOGGLE_TRANSLATION,
        update: {
          title: "Hide translated webpage"
        }
      }
    ]);
  });

  it("refreshes the localized toggle menu title for the current tab", async () => {
    const updates: Array<{ id: string; update: Pick<ContextMenuItem, "title"> }> = [];

    await refreshToggleMenu(
      {
        update(id, update) {
          updates.push({ id, update });
        }
      },
      { enabled: true },
      "zh-CN"
    );

    expect(updates).toEqual([
      {
        id: MENU_ID_TOGGLE_TRANSLATION,
        update: {
          title: "显示原文"
        }
      }
    ]);
  });

  it("skips the optional onShown listener when the Chrome API does not expose it", () => {
    expect(() => {
      registerOptionalContextMenuShownListener({}, () => {});
    }).not.toThrow();
  });

  it("registers the optional onShown listener when the Chrome API exposes it", () => {
    let listener: unknown;

    registerOptionalContextMenuShownListener(
      {
        onShown: {
          addListener(nextListener: unknown) {
            listener = nextListener;
          }
        }
      },
      () => {}
    );

    expect(listener).toBeTypeOf("function");
  });

  it("registers selection menu items with correct translations based on target language", async () => {
    const createdZh: ContextMenuItem[] = [];
    await registerSelectionMenus(
      {
        create(item) {
          createdZh.push(item);
        }
      },
      "zh-CN"
    );

    expect(createdZh).toEqual([
      {
        id: MENU_ID_SELECTION_PARENT,
        title: "AI 操作",
        contexts: ["selection"]
      },
      {
        id: MENU_ID_SELECTION_TRANSLATE,
        parentId: MENU_ID_SELECTION_PARENT,
        title: "翻译",
        contexts: ["selection"]
      },
      {
        id: MENU_ID_SELECTION_EXPLAIN,
        parentId: MENU_ID_SELECTION_PARENT,
        title: "解释",
        contexts: ["selection"]
      }
    ]);

    const createdEn: ContextMenuItem[] = [];
    await registerSelectionMenus(
      {
        create(item) {
          createdEn.push(item);
        }
      },
      "en"
    );

    expect(createdEn).toEqual([
      {
        id: MENU_ID_SELECTION_PARENT,
        title: "AI Actions",
        contexts: ["selection"]
      },
      {
        id: MENU_ID_SELECTION_TRANSLATE,
        parentId: MENU_ID_SELECTION_PARENT,
        title: "Translate",
        contexts: ["selection"]
      },
      {
        id: MENU_ID_SELECTION_EXPLAIN,
        parentId: MENU_ID_SELECTION_PARENT,
        title: "Explain",
        contexts: ["selection"]
      }
    ]);

    const createdTw: ContextMenuItem[] = [];
    await registerSelectionMenus(
      {
        create(item) {
          createdTw.push(item);
        }
      },
      "zh-TW"
    );

    expect(createdTw).toEqual([
      {
        id: MENU_ID_SELECTION_PARENT,
        title: "AI 動作",
        contexts: ["selection"]
      },
      {
        id: MENU_ID_SELECTION_TRANSLATE,
        parentId: MENU_ID_SELECTION_PARENT,
        title: "翻譯",
        contexts: ["selection"]
      },
      {
        id: MENU_ID_SELECTION_EXPLAIN,
        parentId: MENU_ID_SELECTION_PARENT,
        title: "解釋",
        contexts: ["selection"]
      }
    ]);
  });
});
