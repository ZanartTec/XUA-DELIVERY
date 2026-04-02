import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "xua-offline";
const STORE_NAME = "pending-actions";
const DB_VERSION = 1;

export interface OfflineAction {
  id: string;
  type: "otp_validation" | "bottle_exchange" | "non_collection";
  url: string;
  method: "POST" | "PATCH" | "PUT";
  body: Record<string, unknown>;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export const offlineQueue = {
  async enqueue(action: OfflineAction): Promise<void> {
    const db = await getDb();
    await db.put(STORE_NAME, action);
  },

  async dequeueAll(): Promise<OfflineAction[]> {
    const db = await getDb();
    return db.getAll(STORE_NAME);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
  },

  async count(): Promise<number> {
    const db = await getDb();
    return db.count(STORE_NAME);
  },
};
