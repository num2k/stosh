/**
 * StoshOptions: Storage type, namespace, and custom serialization settings
 */
export interface StoshOptions {
  /**
   * Storage type priority order. Example: ["local", "session", "cookie", "memory"]
   * If not set, uses [type] or default fallback order.
   */
  priority?: Array<"local" | "session" | "cookie" | "memory">;
  type?: "local" | "session" | "cookie";
  namespace?: string;
  serialize?: (data: any) => string;
  deserialize?: (raw: string) => any;
}

// Internal memory storage fallback implementation
class MemoryStorage implements Storage {
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

// Internal cookie storage implementation
class CookieStorage implements Storage {
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

/**
 * SetOptions: Options for set method (e.g., expiration)
 */
export interface SetOptions {
  expire?: number; // Expiration time in milliseconds
}

/**
 * Middleware context and type definitions
 */
export type MiddlewareContext<T = any> = {
  key: string;
  value?: T;
  options?: SetOptions;
  result?: any;
};
export type Middleware<T = any> = (
  ctx: MiddlewareContext<T>,
  next: () => void
) => void;

/**
 * Stosh: Middleware-based storage wrapper
 */
export class Stosh<T = any> {
  private storage: Storage;
  private namespace: string;
  private serializeFn: (data: any) => string;
  private deserializeFn: (raw: string) => any;
  private middlewares: {
    get: Middleware<T>[];
    set: Middleware<T>[];
    remove: Middleware<T>[];
  } = { get: [], set: [], remove: [] };
  private onChangeCb?: (key: string, value: T | null) => void;
  /** Indicates if memory fallback is active */
  readonly isMemoryFallback: boolean;
  /** Indicates if running in SSR environment */
  static get isSSR(): boolean {
    return typeof window === "undefined";
  }

  constructor(options?: StoshOptions) {
    let storage: Storage | null = null;
    let fallback = false;
    const priority =
      options?.priority ||
      (options?.type
        ? [options.type]
        : ["local", "session", "cookie", "memory"]);
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
        if (type === "local") {
          storage = window.localStorage;
        } else if (type === "session") {
          storage = window.sessionStorage;
        } else if (type === "cookie") {
          storage = new CookieStorage();
        } else if (type === "memory") {
          storage = new MemoryStorage();
        }
        // Test write/read (except memory)
        if (storage && type !== "memory") {
          const testKey = "__stosh_test__" + Math.random();
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

  use(method: "get" | "set" | "remove", mw: Middleware<T>): void {
    this.middlewares[method].push(mw);
  }

  set(key: string, value: T, options?: SetOptions): void {
    this.runMiddleware("set", { key, value, options }, (ctx) => {
      const data = {
        v: ctx.value, // Use value processed by middleware
        e: ctx.options?.expire ? Date.now() + ctx.options.expire : undefined,
      };
      this.storage.setItem(this.namespace + key, this.serialize(data));
      this.triggerChange(key, ctx.value === undefined ? null : ctx.value);
    });
  }

  get<U = T>(key: string): U | null {
    let ctxResult: U | null = null;
    const ctx: MiddlewareContext<T> = { key };
    this.runMiddleware("get", ctx, (ctx) => {
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

  remove(key: string): void {
    this.runMiddleware("remove", { key }, (ctx) => {
      this.storage.removeItem(this.namespace + key);
      this.triggerChange(key, null);
    });
  }

  clear(): void {
    const keys = Object.keys(this.storage).filter((k) =>
      k.startsWith(this.namespace)
    );
    for (const k of keys) {
      this.storage.removeItem(k);
      this.triggerChange(k.replace(this.namespace, ""), null);
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  getAll(): Record<string, T> {
    const result: Record<string, T> = {};
    for (const k in this.storage) {
      if (k.startsWith(this.namespace)) {
        const key = k.replace(this.namespace, "");
        const v = this.get(key);
        if (v !== null) result[key] = v;
      }
    }
    return result;
  }

  batchSet(
    entries: Array<{ key: string; value: T; options?: SetOptions }>
  ): void {
    for (const { key, value, options } of entries) {
      this.set(key, value, options);
    }
  }

  batchGet<U = T>(keys: string[]): (U | null)[] {
    return keys.map((key) => this.get<U>(key));
  }

  batchRemove(keys: string[]): void {
    for (const key of keys) {
      this.remove(key);
    }
  }

  onChange(cb: (key: string, value: T | null) => void): void {
    this.onChangeCb = cb;
  }

  // Internal: serialization/deserialization
  private serialize(data: any): string {
    return this.serializeFn(data);
  }
  private deserialize(raw: string): any {
    return this.deserializeFn(raw);
  }

  // Internal: run middleware
  private runMiddleware(
    method: "get" | "set" | "remove",
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => void
  ) {
    const mws = this.middlewares[method];
    let i = -1;
    const next = () => {
      i++;
      if (i < mws.length) mws[i](ctx, next);
      else last(ctx);
    };
    next();
  }

  // Internal: trigger onChange
  private triggerChange(key: string, value: T | null) {
    if (this.onChangeCb) this.onChangeCb(key, value);
  }
}
