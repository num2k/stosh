import {
  StoshOptions,
  SetOptions,
  MiddlewareContext,
  RemoveOptions,
  MiddlewareFn,
  StoredData,
} from "./types";
import {
  MemoryStorage,
  CookieStorage,
  IndexedDBStorage,
} from "./storage-drivers";
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
import { runMiddlewareChain, runMiddlewareChainSync } from "./utils/middleware";
import { getNamespaceKeys, stripNamespace } from "./utils/namespace";
import { selectSyncStorage } from "./utils/storage";
import { mergeOptions } from "./utils/option";

/**
 * Stosh: Middleware-based storage wrapper
 */
export class Stosh<T = any> {
  private storage: Storage;
  private namespace: string;
  private serializeFn: (data: StoredData<T>) => string;
  private deserializeFn: (raw: string) => StoredData<T>;
  private strictSyncFallback: boolean;
  private middleware: Record<
    MiddlewareMethod,
    MiddlewareFn<MiddlewareContext<T>>[]
  > = {
    get: [],
    set: [],
    remove: [],
  };
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

    if (Stosh.isSSR) {
      fallback = true;
      this.storage = new MemoryStorage();
      this.isMemoryFallback = true;
      this.namespace = options?.namespace ? options.namespace + ":" : "";
      this.strictSyncFallback = options?.strictSyncFallback ?? false;
      this.serializeFn = options?.serialize || JSON.stringify;
      this.deserializeFn = options?.deserialize || JSON.parse;
      this.middleware = {
        get: [],
        set: [],
        remove: [],
      };
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
          storage = selectSyncStorage(syncPriority);
          break;
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

    if (!storage) {
      storage = new MemoryStorage();
      fallback = true;
    }

    this.storage = storage!;
    this.isMemoryFallback = fallback;
    this.namespace = options?.namespace ? options.namespace + ":" : "";
    this.strictSyncFallback = options?.strictSyncFallback ?? false; 
    this.serializeFn = options?.serialize || JSON.stringify;
    this.deserializeFn = options?.deserialize || JSON.parse;
    this.middleware = {
      get: [],
      set: [],
      remove: [],
    };

    if (!Stosh.isSSR && window.addEventListener) {
      if (
        this.storage === window.localStorage ||
        this.storage === window.sessionStorage
      ) {
        window.addEventListener("storage", (e) => {
          if (e.key && e.key.startsWith(this.namespace) && this.onChangeCb) {
            const key = stripNamespace(e.key, this.namespace);
            let value: T | null = null;
            if (e.newValue) {
              try {
                const data = this.deserializeFn(e.newValue);
                if (!data.e || Date.now() <= data.e) {
                  value = data.v;
                }
              } catch (err) {
                console.error('[stosh] Failed to deserialize storage event value:', err);
              }
            }
            this.triggerChange(key, value);
          }
        });
      }
    }
  }

  use(method: MiddlewareMethod, mw: MiddlewareFn<MiddlewareContext<T>>) {
    this.middleware[method].push(mw);
  }

  private async runMiddleware(
    method: MiddlewareMethod,
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => Promise<void> | void
  ) {
    ctx.isSync = false;
    await runMiddlewareChain(this.middleware[method], ctx, last);
  }

  private runMiddlewareSync(
    method: MiddlewareMethod,
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => void
  ) {
    ctx.isSync = true;
    runMiddlewareChainSync(this.middleware[method], ctx, last);
  }

  private async _getInternal<U = T>(key: string): Promise<U | null> {
    const ctx: MiddlewareContext<T> = { key };
    let result: T | null = null;

    await this.runMiddleware(MIDDLEWARE_METHOD_GET, ctx, async (finalCtx) => {
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
            result = data.v;
          }
        } catch (err) {
          console.error('[stosh] Failed to deserialize storage value:', err);
          result = null;
        }
      }
      finalCtx.result = result;
    });

    return ctx.result === undefined ? null : (ctx.result as U | null);
  }

  private _getInternalSync<U = T>(key: string): U | null {
    const ctx: MiddlewareContext<T> = { key };
    let result: T | null = null;

    this.runMiddlewareSync(MIDDLEWARE_METHOD_GET, ctx, (finalCtx) => {
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
            result = data.v;
          }
        } catch (err) {
          console.error('[stosh] Failed to deserialize storage value:', err);
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

    await this.runMiddleware(MIDDLEWARE_METHOD_SET, ctx, async (finalCtx) => {
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

      if (this.storage instanceof CookieStorage) {
        this.storage.setItem(namespacedKey, serializedData, finalCtx.options);
      } else if (this.idbStorage) {
        await this.idbStorage.setItem(namespacedKey, serializedData);
      } else {
        this.storage.setItem(namespacedKey, serializedData);
      }
      this.triggerChange(finalCtx.key, finalCtx.value);
    });
  }

  private _setInternalSync(key: string, value: T, options?: SetOptions): void {
    const ctx: MiddlewareContext<T> = { key, value, options };

    this.runMiddlewareSync(MIDDLEWARE_METHOD_SET, ctx, (finalCtx) => {
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
      const namespacedKey = this.namespace + finalCtx.key;
      const serializedData = this.serializeFn(data);
      if (this.storage instanceof CookieStorage) {
        this.storage.setItem(namespacedKey, serializedData, finalCtx.options);
      } else {
        this.storage.setItem(namespacedKey, serializedData);
      }
      this.triggerChange(finalCtx.key, finalCtx.value);
    });
  }

  private async _removeInternal(
    key: string,
    options?: SetOptions
  ): Promise<void> {
    const ctx: MiddlewareContext<T> = { key, options };

    await this.runMiddleware(
      MIDDLEWARE_METHOD_REMOVE,
      ctx,
      async (finalCtx) => {
        const namespacedKey = this.namespace + finalCtx.key;
        if (this.storage instanceof CookieStorage) {
          this.storage.removeItem(namespacedKey, finalCtx.options);
        } else if (this.idbStorage) {
          await this.idbStorage.removeItem(namespacedKey);
        } else {
          this.storage.removeItem(namespacedKey);
        }
        this.triggerChange(finalCtx.key, null);
      }
    );
  }

  private _removeInternalSync(key: string, options?: SetOptions): void {
    const ctx: MiddlewareContext<T> = { key, options };

    this.runMiddlewareSync(MIDDLEWARE_METHOD_REMOVE, ctx, (finalCtx) => {
      const namespacedKey = this.namespace + finalCtx.key;
      if (this.storage instanceof CookieStorage) {
        this.storage.removeItem(namespacedKey, finalCtx.options);
      } else {
        this.storage.removeItem(namespacedKey);
      }
      this.triggerChange(finalCtx.key, null);
    });
  }

  async set(key: string, value: T, options?: SetOptions): Promise<void> {
    if (this.idbStorage) {
      await this._setInternal(key, value, options);
    } else {
      return Promise.resolve().then(() =>
        this._setInternalSync(key, value, options)
      );
    }
  }

  async get<U = T>(key: string): Promise<U | null> {
    if (this.idbStorage) {
      return this._getInternal<U>(key);
    }
    return Promise.resolve().then(() => this._getInternalSync<U>(key));
  }

  async remove(key: string, options?: RemoveOptions): Promise<void> {
    if (this.idbStorage) {
      await this._removeInternal(key, options);
    } else {
      return Promise.resolve().then(() =>
        this._removeInternalSync(key, options)
      );
    }
  }

  setSync(key: string, value: T, options?: SetOptions): void {
    if (this.idbStorage && this.strictSyncFallback) {
      throw new Error("[stosh] setSync is not supported with IndexedDB storage.");
    } else if (this.idbStorage) {
      console.warn("[stosh] setSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
    }
    this._setInternalSync(key, value, options);
  }

  getSync<U = T>(key: string): U | null {
    if (this.idbStorage && this.strictSyncFallback) {
      throw new Error("[stosh] getSync is not supported with IndexedDB storage.");
    } else if (this.idbStorage) {
      console.warn("[stosh] getSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
    }
    return this._getInternalSync<U>(key);
  }

  removeSync(key: string, options?: RemoveOptions): void {
    if (this.idbStorage && this.strictSyncFallback) {
      throw new Error("[stosh] removeSync is not supported with IndexedDB storage.");
    } else if (this.idbStorage) {
      console.warn("[stosh] removeSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
    }
    this._removeInternalSync(key, options);
  }

  clearSync(): void {
    if (this.idbStorage) {
      if (this.strictSyncFallback) {
        throw new Error("[stosh] clearSync is not supported with IndexedDB storage.");
      } else {
        console.warn("[stosh] clearSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
      }
    }
    const keys = getNamespaceKeys(this.storage, this.namespace);
    keys.forEach((k) => {
      this._removeInternalSync(stripNamespace(k, this.namespace));
    });
  }

  async clear(): Promise<void> {
    if (this.idbStorage) {
      const keysToNotify = (await this.idbStorage.getAllKeys())
        .filter((k) => k.startsWith(this.namespace))
        .map((k) => stripNamespace(k, this.namespace));

      await this.idbStorage.clear();

      keysToNotify.forEach((key) => this.triggerChange(key, null));
      return;
    }
    return Promise.resolve().then(() => this.clearSync());
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  hasSync(key: string): boolean {
    if (this.idbStorage) {
      if (this.strictSyncFallback) {
        throw new Error("[stosh] hasSync is not supported with IndexedDB storage.");
      } else {
        console.warn("[stosh] hasSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
      }
    }
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
              const originalKey = stripNamespace(namespacedKey, this.namespace);
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
              } catch (err) {
                console.error('[stosh] Failed to deserialize storage value:', err);
                value = null;
              }

              const ctx: MiddlewareContext<T> = {
                key: originalKey,
                result: value,
              };
              await this.runMiddleware(
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
    return Promise.resolve().then(() => this.getAllSync());
  }

  getAllSync(): Record<string, T> {
    if (this.idbStorage) {
      if (this.strictSyncFallback) {
        throw new Error("[stosh] getAllSync is not supported with IndexedDB storage.");
      } else {
        console.warn("[stosh] getAllSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
      }
    }
    const result: Record<string, T> = {};
    const keys = getNamespaceKeys(this.storage, this.namespace);
    keys.forEach((k) => {
      const key = stripNamespace(k, this.namespace);
      const v = this._getInternalSync<T>(key);
      if (v !== null) {
        result[key] = v;
      }
    });
    return result;
  }

  async batchSet(
    entries: Array<{ key: string; value: T; options?: SetOptions }>,
    options?: SetOptions
  ): Promise<void> {
    if (this.idbStorage) {
      const processedEntries: Array<{ key: string; value: string }> = [];
      for (const { key, value, options: entryOptions } of entries) {
        const mergedOptions = mergeOptions(options, entryOptions);
        const ctx: MiddlewareContext<T> = {
          key,
          value,
          options: mergedOptions,
        };
        await this.runMiddleware(
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
    return Promise.resolve().then(() => this.batchSetSync(entries, options));
  }

  batchSetSync(
    entries: Array<{ key: string; value: T; options?: SetOptions }>,
    options?: SetOptions
  ): void {
    if (this.idbStorage) {
      if (this.strictSyncFallback) {
        throw new Error("[stosh] batchSetSync is not supported with IndexedDB storage.");
      } else {
        console.warn("[stosh] batchSetSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
      }
    }
    entries.forEach(({ key, value, options: entryOptions }) => {
      const mergedOptions = mergeOptions(options, entryOptions);
      this._setInternalSync(key, value, mergedOptions);
    });
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
          } catch (err) {
            console.error('[stosh] Failed to deserialize storage value:', err);
            deserializedValue = null;
          }
        }

        const ctx: MiddlewareContext<T> = { key, result: deserializedValue };
        await this.runMiddleware(
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
    return Promise.resolve().then(() => this.batchGetSync<U>(keys));
  }

  batchGetSync<U = T>(keys: string[]): (U | null)[] {
    if (this.idbStorage) {
      if (this.strictSyncFallback) {
        throw new Error("[stosh] batchGetSync is not supported with IndexedDB storage.");
      } else {
        console.warn("[stosh] batchGetSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
      }
    }
    return keys.map((key) => this._getInternalSync<U>(key));
  }

  async batchRemove(keys: string[], options?: SetOptions): Promise<void> {
    if (this.idbStorage) {
      const keysToRemove: string[] = [];
      for (const key of keys) {
        const ctx: MiddlewareContext<T> = { key, options };
        await this.runMiddleware(
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
    return Promise.resolve().then(() => this.batchRemoveSync(keys, options));
  }

  batchRemoveSync(keys: string[], options?: RemoveOptions): void {
    if (this.idbStorage) {
      if (this.strictSyncFallback) {
        throw new Error("[stosh] batchRemoveSync is not supported with IndexedDB storage.");
      } else {
        console.warn("[stosh] batchRemoveSync called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).");
      }
    }
    keys.forEach((key) => {
      this._removeInternalSync(key, options);
    });
  }

  onChange(
    cb: (key: string, value: T | null) => void | Promise<void>
  ): () => void {
    this.onChangeCb = cb;
    return () => {
      this.onChangeCb = undefined;
    };
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
