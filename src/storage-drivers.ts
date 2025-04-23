export class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
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
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      if (name) this.removeItem(name);
    }
  }
  getItem(key: string): string | null {
    const name = encodeURIComponent(key) + "=";
    const ca = document.cookie.split(";");
    for (let c of ca) {
      c = c.trim();
      if (c.indexOf(name) === 0)
        return decodeURIComponent(c.substring(name.length));
    }
    return null;
  }
  key(index: number): string | null {
    const cookies = document.cookie.split(";");
    if (index < 0 || index >= cookies.length) return null;
    const eqPos = cookies[index].indexOf("=");
    return eqPos > -1
      ? decodeURIComponent(cookies[index].substr(0, eqPos).trim())
      : null;
  }
  removeItem(key: string): void {
    document.cookie =
      encodeURIComponent(key) +
      "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  }
  setItem(key: string, value: string): void {
    document.cookie =
      encodeURIComponent(key) + "=" + encodeURIComponent(value) + "; path=/";
  }
}

export class IndexedDBStorage {
  private dbName: string;
  private storeName: string;
  private dbPromise: Promise<IDBDatabase>;

  constructor(namespace: string) {
    if (
      typeof indexedDB === "undefined" ||
      typeof indexedDB.open !== "function"
    ) {
      throw new Error(
        "IndexedDB is not supported or 'open' method is missing in this environment."
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
              "IndexedDB became unavailable or invalid before open call."
            )
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
            (event.target as IDBOpenDBRequest).error
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
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () =>
        reject(new Error("IndexedDB getItem error: " + req.error));
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(new Error("IndexedDB setItem error: " + req.error));
    });
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(new Error("IndexedDB removeItem error: " + req.error));
    });
  }

  async clear(): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
  }

  async getAllKeys(): Promise<string[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  }

  async batchSet(
    entries: Array<{ key: string; value: string }>
  ): Promise<void> {
    if (!entries.length) return;
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      let remaining = entries.length;

      entries.forEach(({ key, value }) => {
        const req = store.put(value, key);
        req.onsuccess = () => {
          remaining--;
          if (remaining === 0) {
          }
        };
        req.onerror = () => {
          if (!tx.error) {
            reject(req.error);
            tx.abort();
          }
        };
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
  }

  async batchGet(keys: string[]): Promise<(string | null)[]> {
    if (!keys.length) return [];
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const results: (string | null)[] = new Array(keys.length).fill(null);
      const keyMap = new Map<string, number[]>();

      keys.forEach((key, index) => {
        if (!keyMap.has(key)) keyMap.set(key, []);
        keyMap.get(key)!.push(index);
      });

      let remaining = keyMap.size;
      if (remaining === 0) {
        resolve(results);
        return;
      }

      keyMap.forEach((indices, key) => {
        const req = store.get(key);
        req.onsuccess = () => {
          indices.forEach((index) => (results[index] = req.result ?? null));
          remaining--;
          if (remaining === 0) {
          }
        };
        req.onerror = () => {
          if (!tx.error) {
            reject(req.error);
          }
        };
      });

      tx.oncomplete = () => resolve(results);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
  }

  async batchRemove(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      let remaining = keys.length;

      keys.forEach((key) => {
        const req = store.delete(key);
        req.onsuccess = () => {
          remaining--;
          if (remaining === 0) {
          }
        };
        req.onerror = () => {
          if (!tx.error) {
            reject(req.error);
            tx.abort();
          }
        };
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
  }
}
