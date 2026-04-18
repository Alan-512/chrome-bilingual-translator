import { type StorageAreaLike } from "../shared/storage";

const SESSION_STORAGE_KEY = "tabSessionStore";

export type TabSessionRecord = {
  enabled: boolean;
  translatedBlockCount: number;
  pendingRequestCount: number;
};

const DEFAULT_TAB_SESSION: TabSessionRecord = {
  enabled: false,
  translatedBlockCount: 0,
  pendingRequestCount: 0
};

type PersistedTabSessions = Record<string, TabSessionRecord>;

export class SessionStorageTabSessionStore {
  readonly storageArea: StorageAreaLike;

  constructor(storageArea: StorageAreaLike) {
    this.storageArea = storageArea;
  }

  async get(tabId: number): Promise<TabSessionRecord> {
    const sessions = await this.loadAll();
    return sessions[String(tabId)] ?? DEFAULT_TAB_SESSION;
  }

  async set(tabId: number, session: TabSessionRecord): Promise<void> {
    const sessions = await this.loadAll();
    sessions[String(tabId)] = session;
    await this.storageArea.set({ [SESSION_STORAGE_KEY]: sessions });
  }

  private async loadAll(): Promise<PersistedTabSessions> {
    const result = await this.storageArea.get(SESSION_STORAGE_KEY);
    const sessions = result[SESSION_STORAGE_KEY];

    if (!sessions || typeof sessions !== "object") {
      return {};
    }

    return sessions as PersistedTabSessions;
  }
}
