import {
  StoshOptions,
  SetOptions,
  Middleware,
  MiddlewareContext,
} from "./types";
import {
  MemoryStorage,
  CookieStorage,
  IndexedDBStorage,
} from "./storage-drivers";
import { runMiddlewareSync, runMiddleware } from "./middleware";
import { MiddlewareMethod } from "./middleware";

/**
 * Stosh: Middleware-based storage wrapper
 */
export class Stosh<T = any> {
  private storage: Storage;
  private namespace: string;
  private serializeFn: (data: any) => string;
  private deserializeFn: (raw: string) => any;
  private middlewares: Map<MiddlewareMethod, Middleware<T>[]> = new Map([
    ["get", []],
    ["set", []],
    ["remove", []],
  ]);
  private onChangeCb?: (key: string, value: T | null) => void | Promise<void>;
  private idbStorage?: IndexedDBStorage;
  /** Indicates if memory fallback is active */
  readonly isMemoryFallback: boolean;
  /** Indicates if running in SSR environment */
  static get isSSR(): boolean {
    return typeof window === "undefined";
  }

  constructor(options?: StoshOptions) {
    let storage: Storage | null = null;
    let fallback = false;
    const validTypes = ["idb", "local", "session", "cookie", "memory"];
    if (options?.type && !validTypes.includes(options.type)) {
      throw new Error(`Unsupported storage type: ${options.type}`);
    }
    // Apply priority except idb in synchronization API
    const isSync =
      options?.type === undefined || options?.type.endsWith("Sync");
    let priority =
      options?.priority || (options?.type ? [options.type] : validTypes);
    // If synchronous API, exclude idb from priority
    if (isSync && priority.includes("idb")) {
      priority = priority.filter((t) => t !== "idb");
      if (typeof window !== "undefined" && window.console) {
        console.warn(
          "[stosh] In synchronous API, idb (IndexedDB) cannot be used. Automatically switching to available storage among local/session/cookie/memory."
        );
      }
    }
    if (typeof window === "undefined") {
      // SSR environment: use memory storage, do not register event listeners
      fallback = true;
      this.storage = new MemoryStorage();
      this.isMemoryFallback = true;
      this.namespace = options?.namespace ? options.namespace + ":" : "";
      this.serializeFn = options?.serialize || JSON.stringify;
      this.deserializeFn = options?.deserialize || JSON.parse;
      return;
    }
    // Try storages in priority order
    for (const type of priority) {
      try {
        if (type === "idb") {
          this.idbStorage = new IndexedDBStorage(
            "stosh_idb",
            options?.namespace || "stosh_default"
          );
        } else if (type === "local") {
          storage = window.localStorage;
        } else if (type === "session") {
          storage = window.sessionStorage;
        } else if (type === "cookie") {
          storage = new CookieStorage();
        } else if (type === "memory") {
          storage = new MemoryStorage();
        }
        if (storage && type !== "memory" && type !== "idb") {
          const testKey = "__stosh_test_key__" + Math.random();
          storage.setItem(testKey, "1");
          storage.removeItem(testKey);
        }
        fallback = type === "memory";
        break;
      } catch {
        storage = null;
        continue;
      }
    }
    if (!storage) {
      storage = new MemoryStorage();
      fallback = true;
    }
    this.storage = storage;
    this.isMemoryFallback = fallback;
    this.namespace = options?.namespace ? options.namespace + ":" : "";
    this.serializeFn = options?.serialize || JSON.stringify;
    this.deserializeFn = options?.deserialize || JSON.parse;
    if (!fallback && typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("storage", (e) => {
        if (e.key && e.key.startsWith(this.namespace) && this.onChangeCb) {
          const key = e.key.replace(this.namespace, "");
          const value = e.newValue ? this.deserialize(e.newValue) : null;
          this.onChangeCb(key, value);
        }
      });
    }
  }

  use(method: MiddlewareMethod, mw: Middleware<T>): void {
    if (!this.middlewares.has(method)) {
      throw new Error(`Invalid middleware method: ${method}`);
    }
    const arr = this.middlewares.get(method);
    if (arr) arr.push(mw);
  }

  // Asynchronous middleware chain application
  private async runMiddlewareChain(
    method: MiddlewareMethod,
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => Promise<void> | void
  ) {
    await runMiddleware(this.middlewares.get(method) ?? [], ctx, last);
  }

  // Synchronous middleware chain application
  private runMiddlewareChainSync(
    method: MiddlewareMethod,
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => void
  ) {
    runMiddlewareSync(this.middlewares.get(method) ?? [], ctx, last);
  }

  // Asynchronous API middleware chain application
  async set(key: string, value: T, options?: SetOptions): Promise<void> {
    if (this.idbStorage) {
      await this.runMiddlewareChain(
        "set",
        { key, value, options },
        async (ctx) => {
          const data = {
            v: ctx.value,
            e: ctx.options?.expire
              ? Date.now() + ctx.options.expire
              : undefined,
          };
          await this.idbStorage!.setItem(
            this.namespace + key,
            this.serialize(data)
          );
          this.triggerChange(key, ctx.value === undefined ? null : ctx.value);
        }
      );
      return;
    }
    this.setSync(key, value, options);
  }

  async get<U = T>(key: string): Promise<U | null> {
    if (this.idbStorage) {
      let ctxResult: U | null = null;
      const ctx: MiddlewareContext<T> = { key };
      await this.runMiddlewareChain("get", ctx, async (ctx) => {
        const raw = await this.idbStorage!.getItem(this.namespace + key);
        if (!raw) {
          ctxResult = null;
          ctx.result = ctxResult;
          return;
        }
        try {
          const data = this.deserialize(raw);
          if (data.e && Date.now() > data.e) {
            await this.idbStorage!.removeItem(this.namespace + key);
            ctxResult = null;
          } else {
            ctxResult = data.v;
          }
        } catch {
          ctxResult = null;
        }
        ctx.result = ctxResult;
      });
      return ctxResult === undefined ? null : (ctxResult as U | null);
    }
    return this.getSync<U>(key);
  }

  async remove(key: string): Promise<void> {
    if (this.idbStorage) {
      await this.runMiddlewareChain("remove", { key }, async (ctx) => {
        await this.idbStorage!.removeItem(this.namespace + key);
        this.triggerChange(key, null);
      });
      return;
    }
    this.removeSync(key);
  }

  setSync(key: string, value: T, options?: SetOptions): void {
    this.runMiddlewareChainSync("set", { key, value, options }, (ctx) => {
      const data = {
        v: ctx.value,
        e: ctx.options?.expire ? Date.now() + ctx.options.expire : undefined,
      };
      this.storage.setItem(this.namespace + key, this.serialize(data));
      this.triggerChange(key, ctx.value === undefined ? null : ctx.value);
    });
  }

  getSync<U = T>(key: string): U | null {
    let ctxResult: U | null = null;
    const ctx: MiddlewareContext<T> = { key };
    this.runMiddlewareChainSync("get", ctx, (ctx) => {
      const raw = this.storage.getItem(this.namespace + key);
      if (!raw) {
        ctxResult = null;
        ctx.result = ctxResult;
        return;
      }
      try {
        const data = this.deserialize(raw);
        if (data.e && Date.now() > data.e) {
          this.storage.removeItem(this.namespace + key);
          ctxResult = null;
        } else {
          ctxResult = data.v;
        }
      } catch {
        ctxResult = null;
      }
      ctx.result = ctxResult;
    });
    return ctx.result === undefined ? null : (ctx.result as U | null);
  }

  removeSync(key: string): void {
    this.runMiddlewareChainSync("remove", { key }, (ctx) => {
      this.storage.removeItem(this.namespace + key);
      this.triggerChange(key, null);
    });
  }

  // Returns an array of all keys that start with the namespace (removes duplicate Storage iteration).
  private getNamespaceKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; ++i) {
      const k = this.storage.key(i);
      if (k && k.startsWith(this.namespace)) keys.push(k);
    }
    return keys;
  }

  // Removes the namespace prefix from a key (internal utility).
  private stripNamespace(key: string): string {
    return key.startsWith(this.namespace)
      ? key.slice(this.namespace.length)
      : key;
  }

  // Asynchronous clear
  async clear(): Promise<void> {
    if (this.idbStorage) {
      // IndexedDB: clear all keys
      const db = await this.idbStorage["dbPromise"];
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.idbStorage!.getStoreName(), "readwrite");
        const store = tx.objectStore(this.idbStorage!.getStoreName());
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    this.clearSync();
  }

  // Synchronous clear
  clearSync(): void {
    const keys = this.getNamespaceKeys();
    for (const k of keys) {
      this.storage.removeItem(k);
      this.triggerChange(this.stripNamespace(k), null);
    }
  }

  // Asynchronous has
  async has(key: string): Promise<boolean> {
    if (this.idbStorage) {
      return (await this.get(key)) !== null;
    }
    return this.hasSync(key);
  }

  hasSync(key: string): boolean {
    return this.getSync(key) !== null;
  }

  // Asynchronous getAll
  async getAll(): Promise<Record<string, T>> {
    if (this.idbStorage) {
      const db = await this.idbStorage.getDbPromise();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.idbStorage!.getStoreName(), "readonly");
        const store = tx.objectStore(this.idbStorage!.getStoreName());
        const req = store.getAllKeys();
        const result: Record<string, T> = {};
        req.onsuccess = async () => {
          const keys = req.result as string[];
          for (const key of keys) {
            const value = await this.get(key);
            if (value !== null) result[key.replace(this.namespace, "")] = value;
          }
          resolve(result);
        };
        req.onerror = () => reject(req.error);
      });
    }
    return this.getAllSync();
  }

  // Synchronous getAll
  getAllSync(): Record<string, T> {
    const result: Record<string, T> = {};
    const keys = this.getNamespaceKeys();
    for (const k of keys) {
      const key = this.stripNamespace(k);
      const v = this.getSync(key);
      if (v !== null) result[key] = v;
    }
    return result;
  }

  // Asynchronous batchSet
  async batchSet(
    entries: Array<{ key: string; value: T; options?: SetOptions }>
  ): Promise<void> {
    if (this.idbStorage) {
      for (const { key, value, options } of entries) {
        await this.set(key, value, options);
      }
      return;
    }
    this.batchSetSync(entries);
  }

  // Synchronous batchSet
  batchSetSync(
    entries: Array<{ key: string; value: T; options?: SetOptions }>
  ): void {
    for (const { key, value, options } of entries) {
      this.setSync(key, value, options);
    }
  }

  // Asynchronous batchGet
  async batchGet<U = T>(keys: string[]): Promise<(U | null)[]> {
    if (this.idbStorage) {
      const results: (U | null)[] = [];
      for (const key of keys) {
        results.push(await this.get<U>(key));
      }
      return results;
    }
    return this.batchGetSync<U>(keys);
  }

  // Synchronous batchGet
  batchGetSync<U = T>(keys: string[]): (U | null)[] {
    return keys.map((key) => this.getSync<U>(key));
  }

  // Asynchronous batchRemove
  async batchRemove(keys: string[]): Promise<void> {
    if (this.idbStorage) {
      for (const key of keys) {
        await this.remove(key);
      }
      return;
    }
    this.batchRemoveSync(keys);
  }

  // Synchronous batchRemove
  batchRemoveSync(keys: string[]): void {
    for (const key of keys) {
      this.removeSync(key);
    }
  }

  onChange(
    cb: (key: string, value: T | null) => void | Promise<void>
  ): () => void {
    this.onChangeCb = cb;
    return () => {
      this.onChangeCb = undefined;
    };
  }

  // Internal: serialization/deserialization
  private serialize(data: any): string {
    return this.serializeFn(data);
  }
  private deserialize(raw: string): any {
    return this.deserializeFn(raw);
  }

  // Internal: trigger onChange
  private triggerChange(key: string, value: T | null) {
    if (this.onChangeCb) this.onChangeCb(key, value);
  }
}
