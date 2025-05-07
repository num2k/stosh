import { CookieOptions } from "./types";

export class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

export class CookieStorage implements Storage {
  get length(): number {
    return document.cookie ? document.cookie.split(";").length : 0;
  }

  clear(): void {
    document.cookie
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter(Boolean)
      .forEach((name) => this.removeItem(decodeURIComponent(name)));
  }

  getItem(key: string): string | null {
    const name = encodeURIComponent(key) + "=";
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const cookie = cookies.find((c) => c.startsWith(name));
    if (!cookie) {
      return null;
    }
    return decodeURIComponent(cookie.slice(name.length));
  }

  key(index: number): string | null {
    const cookies = document.cookie.split(";");
    if (index < 0 || index >= cookies.length) {
      return null;
    }
    const [name] = cookies[index].split("=");
    return name ? decodeURIComponent(name.trim()) : null;
  }

  removeItem(key: string, options?: CookieOptions): void {
    document.cookie = buildCookieString(key, "", {
      ...options,
      expire: "Thu, 01 Jan 1970 00:00:00 GMT",
    });
  }

  setItem(
    key: string,
    value: string,
    options?: CookieOptions & { expire?: number | Date | string },
  ): void {
    document.cookie = buildCookieString(key, value, options);
  }
}

function buildCookieString(
  key: string,
  value: string,
  options?: CookieOptions & { expire?: number | Date | string },
): string {
  const segments = [
    `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    `path=${options?.path ?? "/"}`,
  ];
  if (options?.domain) {
    segments.push(`domain=${options.domain}`);
  }
  if (options?.expire) {
    const expires =
      typeof options.expire === "string"
        ? options.expire
        : typeof options.expire === "number"
          ? new Date(Date.now() + options.expire).toUTCString()
          : (options.expire as Date).toUTCString();
    segments.push(`expires=${expires}`);
  }
  if (options?.secure) {
    segments.push("secure");
  }
  if (options?.sameSite) {
    segments.push(`samesite=${options.sameSite}`);
  }
  return segments.join("; ");
}

export class IndexedDBStorage {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(namespace: string) {
    if (
      typeof indexedDB === "undefined" ||
      typeof indexedDB.open !== "function"
    ) {
      throw new Error(
        "[stosh] IndexedDB is not supported or 'open' method is missing in this environment.",
      );
    }
    this.dbName = `stoshDB_${namespace}`;
    this.storeName = "stosh_store";
    this.dbPromise = this.open();
  }

  public getStoreName(): string {
    return this.storeName;
  }

  public getDbPromise(): Promise<IDBDatabase> {
    return this.dbPromise;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      try {
        // Double-check right before the call, just to be safe
        if (
          typeof indexedDB === "undefined" ||
          typeof indexedDB.open !== "function"
        ) {
          return reject(
            new Error(
              "[stosh] IndexedDB became unavailable or invalid before open call.",
            ),
          );
        }

        // Attempt to open the database
        const request = indexedDB.open(this.dbName, 1); // Line that might throw in jsdom

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };

        request.onsuccess = (event) => {
          resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
          console.error(
            `[stosh] IndexedDB open request error:`,
            (event.target as IDBOpenDBRequest).error,
          );
          reject((event.target as IDBOpenDBRequest).error);
        };
      } catch (e) {
        // Catch synchronous errors specifically from the indexedDB.open() call itself
        console.error(`[stosh] Critical error calling indexedDB.open:`, e);
        reject(e); // Reject the promise if the open call itself fails
      }
    });
  }

  async getItem(key: string): Promise<string | null> {
    return this.createTransaction<string | null>(
      "readonly",
      (store, resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () =>
          reject(new Error("[stosh] IndexedDB getItem error: " + req.error));
      },
    );
  }

  async setItem(key: string, value: string): Promise<void> {
    return this.createTransaction<void>(
      "readwrite",
      (store, resolve, reject) => {
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () =>
          reject(new Error("[stosh] IndexedDB setItem error: " + req.error));
      },
    );
  }

  async removeItem(key: string): Promise<void> {
    return this.createTransaction<void>(
      "readwrite",
      (store, resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () =>
          reject(new Error("[stosh] IndexedDB removeItem error: " + req.error));
      },
    );
  }

  async clear(): Promise<void> {
    return this.createTransaction<void>(
      "readwrite",
      (store, resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      },
    );
  }

  async getAllKeys(): Promise<string[]> {
    return this.createTransaction<string[]>(
      "readonly",
      (store, resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
      },
    );
  }

  /**
   * Helper method to create a transaction and handle common error patterns
   */
  private async createTransaction<T>(
    mode: IDBTransactionMode,
    operation: (
      store: IDBObjectStore,
      resolve: (value: T) => void,
      reject: (reason: any) => void,
    ) => void,
  ): Promise<T> {
    const db = await this.dbPromise;
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode);
      const store = tx.objectStore(this.storeName);

      operation(store, resolve, reject);

      tx.oncomplete = () => {
        resolve(undefined as unknown as T);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("[stosh] Transaction aborted"));
    });
  }

  async batchSet(
    entries: Array<{ key: string; value: string }>,
  ): Promise<void> {
    if (!entries.length) {
      return;
    }

    return this.createTransaction<void>("readwrite", (store, _, reject) => {
      entries.forEach(({ key, value }) => {
        const req = store.put(value, key);
        req.onerror = () => {
          reject(req.error);
          store.transaction.abort();
        };
      });
    });
  }

  async batchGet(keys: string[]): Promise<(string | null)[]> {
    if (!keys.length) {
      return [];
    }

    return this.createTransaction<(string | null)[]>(
      "readonly",
      (store, resolve, reject) => {
        const results: (string | null)[] = new Array(keys.length).fill(null);
        const keyMap = new Map<string, number[]>();

        keys.forEach((key, index) => {
          if (!keyMap.has(key)) {
            keyMap.set(key, []);
          }
          keyMap.get(key)!.push(index);
        });

        if (keyMap.size === 0) {
          resolve(results);
          return;
        }

        keyMap.forEach((indices, key) => {
          const req = store.get(key);
          req.onsuccess = () => {
            indices.forEach((index) => (results[index] = req.result ?? null));
          };
          req.onerror = () => reject(req.error);
        });

        // Set up a handler to resolve with results when transaction completes
        store.transaction.addEventListener("complete", () => resolve(results));
      },
    );
  }

  async batchRemove(keys: string[]): Promise<void> {
    if (!keys.length) {
      return;
    }

    return this.createTransaction<void>("readwrite", (store, _, reject) => {
      keys.forEach((key) => {
        const req = store.delete(key);
        req.onerror = () => {
          reject(req.error);
          store.transaction.abort();
        };
      });
    });
  }
}
