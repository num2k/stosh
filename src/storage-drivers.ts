export class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

export class CookieStorage implements Storage {
  get length() {
    return document.cookie ? document.cookie.split(";").length : 0;
  }
  clear() {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      if (name) this.removeItem(name);
    }
  }
  getItem(key: string) {
    const name = encodeURIComponent(key) + "=";
    const ca = document.cookie.split(";");
    for (let c of ca) {
      c = c.trim();
      if (c.indexOf(name) === 0)
        return decodeURIComponent(c.substring(name.length));
    }
    return null;
  }
  key(index: number) {
    const cookies = document.cookie.split(";");
    if (index < 0 || index >= cookies.length) return null;
    const eqPos = cookies[index].indexOf("=");
    return eqPos > -1
      ? decodeURIComponent(cookies[index].substr(0, eqPos).trim())
      : null;
  }
  removeItem(key: string) {
    document.cookie =
      encodeURIComponent(key) +
      "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  }
  setItem(key: string, value: string) {
    document.cookie =
      encodeURIComponent(key) + "=" + encodeURIComponent(value) + "; path=/";
  }
}

export class IndexedDBStorage {
  private dbName: string;
  private storeName: string;
  private dbPromise: Promise<IDBDatabase>;

  constructor(dbName = "stosh", storeName = "store") {
    this.dbName = dbName;
    this.storeName = storeName;
    this.dbPromise = this.open();
  }

  public getStoreName() {
    return this.storeName;
  }
  public getDbPromise() {
    return this.dbPromise;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getItem(key: string): Promise<string | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
