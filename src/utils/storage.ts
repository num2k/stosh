import {
  STORAGE_TYPE_COOKIE,
  STORAGE_TYPE_LOCAL,
  STORAGE_TYPE_MEMORY,
  STORAGE_TYPE_SESSION,
  StorageType,
} from "../constants";
import { CookieStorage, MemoryStorage } from "../storage-drivers";

export function testStorageAvailable(storage: Storage): boolean {
  try {
    const testKey = "__stosh_test_key__" + Math.random();
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function selectSyncStorage(priority: StorageType[]): Storage {
  for (const type of priority) {
    let candidate: Storage | null = null;
    if (type === STORAGE_TYPE_LOCAL) {
      candidate = typeof window !== "undefined" ? window.localStorage : null;
    } else if (type === STORAGE_TYPE_SESSION) {
      candidate = typeof window !== "undefined" ? window.sessionStorage : null;
    } else if (type === STORAGE_TYPE_COOKIE) {
      candidate = typeof window !== "undefined" ? new CookieStorage() : null;
    } else if (type === STORAGE_TYPE_MEMORY) {
      candidate = new MemoryStorage();
    }
    if (candidate && testStorageAvailable(candidate)) {
      return candidate;
    }
  }
  return new MemoryStorage();
}
