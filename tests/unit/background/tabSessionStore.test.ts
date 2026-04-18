import { beforeEach, describe, expect, it } from "vitest";

import {
  SessionStorageTabSessionStore,
  type TabSessionRecord
} from "../../../src/background/tabSessionStore";
import { createMemoryStorageArea } from "../../../src/shared/storage";

describe("SessionStorageTabSessionStore", () => {
  let store: SessionStorageTabSessionStore;

  beforeEach(() => {
    store = new SessionStorageTabSessionStore(createMemoryStorageArea());
  });

  it("returns a disabled default state for unknown tabs", async () => {
    await expect(store.get(42)).resolves.toEqual({
      enabled: false,
      translatedBlockCount: 0,
      pendingRequestCount: 0
    });
  });

  it("persists and reloads tab session metadata", async () => {
    const session: TabSessionRecord = {
      enabled: true,
      translatedBlockCount: 12,
      pendingRequestCount: 2
    };

    await store.set(9, session);

    const reloadedStore = new SessionStorageTabSessionStore(store.storageArea);
    await expect(reloadedStore.get(9)).resolves.toEqual(session);
  });
});
