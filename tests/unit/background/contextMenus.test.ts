import { describe, expect, it } from "vitest";

import {
  MENU_ID_TOGGLE_TRANSLATION,
  buildToggleMenuItem,
  getToggleMenuTitle,
  registerOptionalContextMenuShownListener,
  registerToggleMenu,
  refreshToggleMenu,
  type ContextMenuItem
} from "../../../src/background/contextMenus";

describe("context menu labeling", () => {
  it("uses the translate label for tabs without active translation", () => {
    expect(getToggleMenuTitle({ enabled: false })).toBe("Translate current webpage");
  });

  it("uses the hide label for tabs with active translation", () => {
    expect(getToggleMenuTitle({ enabled: true })).toBe("Hide translated webpage");
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
});
