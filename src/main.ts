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
import {
  STORAGE_TYPE_IDB,
  STORAGE_TYPE_LOCAL,
  STORAGE_TYPE_SESSION,
  STORAGE_TYPE_COOKIE,
  STORAGE_TYPE_MEMORY,
  DEFAULT_PRIORITY,
  DEFAULT_PRIORITY_SYNC,
  MIDDLEWARE_METHOD_GET,
  MIDDLEWARE_METHOD_SET,
  MIDDLEWARE_METHOD_REMOVE,
  MiddlewareMethod,
  StorageType,
} from "./constants";

/**
 * Stosh: Middleware-based storage wrapper
 */
export class Stosh<T = any> {
  private storage: Storage;
  private namespace: string;
  private serializeFn: (data: any) => string;
  private deserializeFn: (raw: string) => any;
  private middlewares: Map<MiddlewareMethod, Middleware<T>[]> = new Map([
    [MIDDLEWARE_METHOD_GET, []],
    [MIDDLEWARE_METHOD_SET, []],
    [MIDDLEWARE_METHOD_REMOVE, []],
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
    const validTypes: StorageType[] = [
      STORAGE_TYPE_IDB,
      STORAGE_TYPE_LOCAL,
      STORAGE_TYPE_SESSION,
      STORAGE_TYPE_COOKIE,
      STORAGE_TYPE_MEMORY,
    ];
    if (options?.type && !validTypes.includes(options.type)) {
      throw new Error(`Unsupported storage type: ${options.type}`);
    }

    const requiresSync =
      options?.type && options.type !== STORAGE_TYPE_IDB
        ? true
        : options?.priority
        ? options.priority.every((t) => t !== STORAGE_TYPE_IDB)
        : false;

    let priority: StorageType[] =
      options?.priority ||
      (options?.type
        ? [options.type]
        : requiresSync
        ? DEFAULT_PRIORITY_SYNC
        : DEFAULT_PRIORITY);

    if (typeof window === "undefined") {
      fallback = true;
      this.storage = new MemoryStorage();
      this.isMemoryFallback = true;
      this.namespace = options?.namespace ? options.namespace + ":" : "";
      this.serializeFn = options?.serialize || JSON.stringify;
      this.deserializeFn = options?.deserialize || JSON.parse;
      return;
    }

    for (const type of priority) {
      try {
        if (type === STORAGE_TYPE_IDB && !requiresSync) {
          // Pass only the namespace to the IndexedDBStorage constructor
          this.idbStorage = new IndexedDBStorage(
            options?.namespace || "stosh_default" // Use provided namespace or a default
          );
          // Find synchronous fallback storage
          const syncPriority = priority.filter((t) => t !== STORAGE_TYPE_IDB);
          for (const syncType of syncPriority) {
            try {
              let syncCandidate: Storage | null = null;
              if (syncType === STORAGE_TYPE_LOCAL)
                syncCandidate = window.localStorage;
              else if (syncType === STORAGE_TYPE_SESSION)
                syncCandidate = window.sessionStorage;
              else if (syncType === STORAGE_TYPE_COOKIE)
                syncCandidate = new CookieStorage();
              else if (syncType === STORAGE_TYPE_MEMORY)
                syncCandidate = new MemoryStorage();

              if (syncCandidate && syncType !== STORAGE_TYPE_MEMORY) {
                const testKey = "__stosh_test_key__" + Math.random();
                syncCandidate.setItem(testKey, "1");
                syncCandidate.removeItem(testKey);
              }
              if (syncCandidate) {
                storage = syncCandidate; // Assign the found sync storage
                break; // Found a working sync fallback
              }
            } catch {
              continue; // Try next sync type if current one fails
            }
          }
          if (!storage) storage = new MemoryStorage(); // Ensure fallback storage exists if no sync one worked
          break; // Exit main loop once IDB (and its sync fallback) is set up
        } else if (type === STORAGE_TYPE_LOCAL) {
          storage = window.localStorage;
        } else if (type === STORAGE_TYPE_SESSION) {
          storage = window.sessionStorage;
        } else if (type === STORAGE_TYPE_COOKIE) {
          storage = new CookieStorage();
        } else if (type === STORAGE_TYPE_MEMORY) {
          storage = new MemoryStorage();
        }

        if (
          storage &&
          type !== STORAGE_TYPE_MEMORY &&
          type !== STORAGE_TYPE_IDB
        ) {
          const testKey = "__stosh_test_key__" + Math.random();
          storage.setItem(testKey, "1");
          storage.removeItem(testKey);
        }

        if (storage) {
          fallback = type === STORAGE_TYPE_MEMORY;
          break;
        }
      } catch {
        storage = null;
        continue;
      }
    }

    if (!storage && !this.idbStorage) {
      storage = new MemoryStorage();
      fallback = true;
    } else if (!storage && this.idbStorage) {
      storage = new MemoryStorage();
      fallback = true;
    }

    this.storage = storage!;
    this.isMemoryFallback = fallback;
    this.namespace = options?.namespace ? options.namespace + ":" : "";
    this.serializeFn = options?.serialize || JSON.stringify;
    this.deserializeFn = options?.deserialize || JSON.parse;

    if (!Stosh.isSSR && window.addEventListener) {
      if (
        this.storage === window.localStorage ||
        this.storage === window.sessionStorage
      ) {
        window.addEventListener("storage", (e) => {
          if (e.key && e.key.startsWith(this.namespace) && this.onChangeCb) {
            const key = this.stripNamespace(e.key);
            let value: T | null = null;
            if (e.newValue) {
              try {
                const data = this.deserializeFn(e.newValue);
                if (!data.e || Date.now() <= data.e) {
                  value = data.v;
                }
              } catch {}
            }
            this.triggerChange(key, value);
          }
        });
      }
    }
  }

  use(method: MiddlewareMethod, mw: Middleware<T>): void {
    if (!this.middlewares.has(method)) {
      throw new Error(`Invalid middleware method: ${method}`);
    }
    const arr = this.middlewares.get(method);
    if (arr) arr.push(mw);
  }

  private async runMiddlewareChain(
    method: MiddlewareMethod,
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => Promise<void> | void
  ) {
    await runMiddleware(this.middlewares.get(method) ?? [], ctx, last);
  }

  private runMiddlewareChainSync(
    method: MiddlewareMethod,
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => void
  ) {
    runMiddlewareSync(this.middlewares.get(method) ?? [], ctx, last);
  }

  private async _getInternal<U = T>(key: string): Promise<U | null> {
    const ctx: MiddlewareContext<T> = { key };
    let result: U | null = null;

    await this.runMiddlewareChain(
      MIDDLEWARE_METHOD_GET,
      ctx,
      async (finalCtx) => {
        const namespacedKey = this.namespace + finalCtx.key;
        let raw: string | null = null;

        if (this.idbStorage) {
          raw = await this.idbStorage.getItem(namespacedKey);
        } else {
          raw = this.storage.getItem(namespacedKey);
        }

        if (!raw) {
          result = null;
        } else {
          try {
            const data = this.deserializeFn(raw);
            if (data.e && Date.now() > data.e) {
              if (this.idbStorage) {
                this.idbStorage.removeItem(namespacedKey).catch(console.error);
              } else {
                this.storage.removeItem(namespacedKey);
              }
              result = null;
            } else {
              result = data.v as U;
            }
          } catch {
            result = null;
          }
        }
        finalCtx.result = result;
      }
    );

    return ctx.result === undefined ? null : (ctx.result as U | null);
  }

  private _getInternalSync<U = T>(key: string): U | null {
    const ctx: MiddlewareContext<T> = { key };
    let result: U | null = null;

    this.runMiddlewareChainSync(MIDDLEWARE_METHOD_GET, ctx, (finalCtx) => {
      const namespacedKey = this.namespace + finalCtx.key;
      const raw = this.storage.getItem(namespacedKey);

      if (!raw) {
        result = null;
      } else {
        try {
          const data = this.deserializeFn(raw);
          if (data.e && Date.now() > data.e) {
            this.storage.removeItem(namespacedKey);
            result = null;
          } else {
            result = data.v as U;
          }
        } catch {
          result = null;
        }
      }
      finalCtx.result = result;
    });

    return ctx.result === undefined ? null : (ctx.result as U | null);
  }

  private async _setInternal(
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<void> {
    const ctx: MiddlewareContext<T> = { key, value, options };

    await this.runMiddlewareChain(
      MIDDLEWARE_METHOD_SET,
      ctx,
      async (finalCtx) => {
        if (finalCtx.value === undefined) {
          await this._removeInternal(finalCtx.key);
          return;
        }

        const data = {
          v: finalCtx.value,
          e: finalCtx.options?.expire
            ? Date.now() + finalCtx.options.expire
            : undefined,
        };
        const serializedData = this.serializeFn(data);
        const namespacedKey = this.namespace + finalCtx.key;

        if (this.idbStorage) {
          await this.idbStorage.setItem(namespacedKey, serializedData);
        } else {
          this.storage.setItem(namespacedKey, serializedData);
        }
        this.triggerChange(finalCtx.key, finalCtx.value);
      }
    );
  }

  private _setInternalSync(key: string, value: T, options?: SetOptions): void {
    const ctx: MiddlewareContext<T> = { key, value, options };

    this.runMiddlewareChainSync(MIDDLEWARE_METHOD_SET, ctx, (finalCtx) => {
      if (finalCtx.value === undefined) {
        this._removeInternalSync(finalCtx.key);
        return;
      }

      const data = {
        v: finalCtx.value,
        e: finalCtx.options?.expire
          ? Date.now() + finalCtx.options.expire
          : undefined,
      };
      this.storage.setItem(
        this.namespace + finalCtx.key,
        this.serializeFn(data)
      );
      this.triggerChange(finalCtx.key, finalCtx.value);
    });
  }

  private async _removeInternal(key: string): Promise<void> {
    const ctx: MiddlewareContext<T> = { key };

    await this.runMiddlewareChain(
      MIDDLEWARE_METHOD_REMOVE,
      ctx,
      async (finalCtx) => {
        const namespacedKey = this.namespace + finalCtx.key;
        if (this.idbStorage) {
          await this.idbStorage.removeItem(namespacedKey);
        } else {
          this.storage.removeItem(namespacedKey);
        }
        this.triggerChange(finalCtx.key, null);
      }
    );
  }

  private _removeInternalSync(key: string): void {
    const ctx: MiddlewareContext<T> = { key };

    this.runMiddlewareChainSync(MIDDLEWARE_METHOD_REMOVE, ctx, (finalCtx) => {
      this.storage.removeItem(this.namespace + finalCtx.key);
      this.triggerChange(finalCtx.key, null);
    });
  }

  async set(key: string, value: T, options?: SetOptions): Promise<void> {
    await this._setInternal(key, value, options);
  }

  async get<U = T>(key: string): Promise<U | null> {
    return this._getInternal<U>(key);
  }

  async remove(key: string): Promise<void> {
    await this._removeInternal(key);
  }

  setSync(key: string, value: T, options?: SetOptions): void {
    if (this.idbStorage) {
      console.warn(
        "[stosh] setSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory)."
      );
    }
    this._setInternalSync(key, value, options);
  }

  getSync<U = T>(key: string): U | null {
    if (this.idbStorage) {
      console.warn(
        "[stosh] getSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory)."
      );
    }
    return this._getInternalSync<U>(key);
  }

  removeSync(key: string): void {
    if (this.idbStorage) {
      console.warn(
        "[stosh] removeSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory)."
      );
    }
    this._removeInternalSync(key);
  }

  private getNamespaceKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; ++i) {
      const k = this.storage.key(i);
      if (k && k.startsWith(this.namespace)) keys.push(k);
    }
    return keys;
  }

  private stripNamespace(key: string): string {
    return key.startsWith(this.namespace)
      ? key.slice(this.namespace.length)
      : key;
  }

  async clear(): Promise<void> {
    if (this.idbStorage) {
      const keysToNotify = (await this.idbStorage.getAllKeys())
        .filter((k) => k.startsWith(this.namespace))
        .map((k) => this.stripNamespace(k));

      await this.idbStorage.clear();

      keysToNotify.forEach((key) => this.triggerChange(key, null));
      return;
    }
    this.clearSync();
  }

  clearSync(): void {
    const keys = this.getNamespaceKeys();
    for (const k of keys) {
      this._removeInternalSync(this.stripNamespace(k));
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  hasSync(key: string): boolean {
    return this.getSync(key) !== null;
  }

  async getAll(): Promise<Record<string, T>> {
    if (this.idbStorage) {
      const db = await this.idbStorage.getDbPromise();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.idbStorage!.getStoreName(), "readonly");
        const store = tx.objectStore(this.idbStorage!.getStoreName());
        const req = store.openCursor();
        const result: Record<string, T> = {};
        req.onsuccess = async (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            const namespacedKey = cursor.key as string;
            if (namespacedKey.startsWith(this.namespace)) {
              const originalKey = this.stripNamespace(namespacedKey);
              const rawValue = cursor.value as string;
              let value: T | null = null;
              try {
                const data = this.deserializeFn(rawValue);
                if (data.e && Date.now() > data.e) {
                  this.idbStorage!.removeItem(namespacedKey).catch(
                    console.error
                  );
                  value = null;
                } else {
                  value = data.v;
                }
              } catch {
                value = null;
              }

              const ctx: MiddlewareContext<T> = {
                key: originalKey,
                result: value,
              };
              await this.runMiddlewareChain(
                MIDDLEWARE_METHOD_GET,
                ctx,
                async (finalCtx) => {
                  if (
                    finalCtx.result !== null &&
                    finalCtx.result !== undefined
                  ) {
                    result[originalKey] = finalCtx.result as T;
                  }
                }
              );
            }
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      });
    }
    return this.getAllSync();
  }

  getAllSync(): Record<string, T> {
    const result: Record<string, T> = {};
    const keys = this.getNamespaceKeys();
    for (const k of keys) {
      const key = this.stripNamespace(k);
      const v = this._getInternalSync<T>(key);
      if (v !== null) {
        result[key] = v;
      }
    }
    return result;
  }

  async batchSet(
    entries: Array<{ key: string; value: T; options?: SetOptions }>
  ): Promise<void> {
    if (this.idbStorage) {
      const processedEntries: Array<{ key: string; value: string }> = [];
      for (const { key, value, options } of entries) {
        const ctx: MiddlewareContext<T> = { key, value, options };
        await this.runMiddlewareChain(
          MIDDLEWARE_METHOD_SET,
          ctx,
          async (finalCtx) => {
            if (finalCtx.value === undefined) {
              this.triggerChange(finalCtx.key, null);
            } else {
              const data = {
                v: finalCtx.value,
                e: finalCtx.options?.expire
                  ? Date.now() + finalCtx.options.expire
                  : undefined,
              };
              processedEntries.push({
                key: this.namespace + finalCtx.key,
                value: this.serializeFn(data),
              });
              this.triggerChange(finalCtx.key, finalCtx.value);
            }
          }
        );
      }
      if (processedEntries.length > 0) {
        await this.idbStorage.batchSet(processedEntries);
      }
      const keysToRemove = entries
        .filter((entry) => entry.value === undefined)
        .map((entry) => this.namespace + entry.key);
      if (keysToRemove.length > 0) {
        await this.idbStorage.batchRemove(keysToRemove);
      }
      return;
    }
    this.batchSetSync(entries);
  }

  batchSetSync(
    entries: Array<{ key: string; value: T; options?: SetOptions }>
  ): void {
    for (const { key, value, options } of entries) {
      this._setInternalSync(key, value, options);
    }
  }

  async batchGet<U = T>(keys: string[]): Promise<(U | null)[]> {
    if (this.idbStorage) {
      const namespacedKeys = keys.map((key) => this.namespace + key);
      const rawResults = await this.idbStorage.batchGet(namespacedKeys);
      const finalResults: (U | null)[] = new Array(keys.length).fill(null);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const raw = rawResults[i];
        let deserializedValue: T | null = null;

        if (raw) {
          try {
            const data = this.deserializeFn(raw);
            if (data.e && Date.now() > data.e) {
              this.idbStorage!.removeItem(namespacedKeys[i]).catch(
                console.error
              );
              deserializedValue = null;
            } else {
              deserializedValue = data.v;
            }
          } catch {
            deserializedValue = null;
          }
        }

        const ctx: MiddlewareContext<T> = { key, result: deserializedValue };
        await this.runMiddlewareChain(
          MIDDLEWARE_METHOD_GET,
          ctx,
          async (finalCtx) => {
            finalResults[i] =
              finalCtx.result === undefined
                ? null
                : (finalCtx.result as U | null);
          }
        );
      }
      return finalResults;
    }
    return this.batchGetSync<U>(keys);
  }

  batchGetSync<U = T>(keys: string[]): (U | null)[] {
    return keys.map((key) => this._getInternalSync<U>(key));
  }

  async batchRemove(keys: string[]): Promise<void> {
    if (this.idbStorage) {
      const keysToRemove: string[] = [];
      for (const key of keys) {
        const ctx: MiddlewareContext<T> = { key };
        await this.runMiddlewareChain(
          MIDDLEWARE_METHOD_REMOVE,
          ctx,
          async (finalCtx) => {
            keysToRemove.push(this.namespace + finalCtx.key);
            this.triggerChange(finalCtx.key, null);
          }
        );
      }
      if (keysToRemove.length > 0) {
        await this.idbStorage.batchRemove(keysToRemove);
      }
      return;
    }
    this.batchRemoveSync(keys);
  }

  batchRemoveSync(keys: string[]): void {
    for (const key of keys) {
      this._removeInternalSync(key);
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

  private serialize(data: any): string {
    return this.serializeFn(data);
  }
  private deserialize(raw: string): any {
    return this.deserializeFn(raw);
  }

  private triggerChange(key: string, value: T | null) {
    if (this.onChangeCb) {
      try {
        const result = this.onChangeCb(key, value);
        if (result instanceof Promise) {
          result.catch((err) =>
            console.error("[stosh] Error in onChange callback:", err)
          );
        }
      } catch (err) {
        console.error("[stosh] Error in onChange callback:", err);
      }
    }
  }
}
