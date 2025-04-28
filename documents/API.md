# Stosh API Reference

---

## 1. StoshOptions and Storage Types/Priority

- `type`: "idb" | "local" | "session" | "cookie" | "memory" (storage type, default: "idb")
- `priority`: Array<"idb" | "local" | "session" | "cookie" | "memory"> (storage fallback priority)
- `namespace`: string (namespace prefix)
- `serialize`/`deserialize`: custom serialization/deserialization functions
- `strictSyncFallback`: boolean (Sync API usage policy, default: false)
  - Only applies when IndexedDB (idb) is the primary storage.
- **Cookie Options (inherited by `StoshOptions`):**
  - `path`: string (Cookie path, default: "/")
  - `domain`: string (Cookie domain)
  - `secure`: boolean (Cookie secure flag)
  - `sameSite`: "Strict" | "Lax" | "None" (Cookie SameSite attribute)

### Storage Types

- **idb**: IndexedDB (async, large capacity, recommended)
- **local**: localStorage (persistent per domain)
- **session**: sessionStorage (per tab/session)
- **cookie**: document.cookie (per domain, sent to server, ~4KB limit)
- **memory**: in-memory fallback (temporary, lost on refresh)

### Storage Fallback Priority

- Default: `["idb", "local", "session", "cookie", "memory"]`
- You can set the order with the `priority` option
- In SSR (server-side) environments, always uses memory storage

**Example:**

```ts
const storage = stosh({
  priority: ["idb", "local", "session", "cookie", "memory"],
  namespace: "fb",
});
```

### Cookie/Memory/SSR Environment Notes

- Cookie: works only in browsers, 4KB limit, sent to server, auto memory fallback in SSR/Node.js
- Memory: lost on refresh/tab close, always used in SSR/Node.js
- SSR: uses memory storage if window is undefined

---

## 2. Constructor and API Signature

```ts
stosh(options?: {
  type?: "idb" | "local" | "session" | "cookie" | "memory";
  priority?: Array<"idb" | "local" | "session" | "cookie" | "memory">;
  namespace?: string;
  serialize?: (data: any) => string;
  deserialize?: (raw: string) => any;
  /**
   * Whether to throw an error when using sync APIs (such as setSync) with IndexedDB as the primary storage.
   * If true, an error is thrown; if false, falls back to another storage (only a warning is shown).
   * @default false
   */
  strictSyncFallback?: boolean;
  // Cookie Options
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
})
```

---

## 3. Main Methods and Examples

### set / setSync

- `set(key, value, options?: SetOptions)`: Promise<void> (async)
- `setSync(key, value, options?: SetOptions)`: void (sync)
- `SetOptions` includes:
  - `expire`: number (Expiration time in milliseconds)
  - `path`, `domain`, `secure`, `sameSite`: Cookie specific options

```ts
await storage.set("user", { name: "Alice" }, { expire: 60000 });
storage.setSync("user", { name: "Alice" }, { expire: 60000 });

// include cookie options
await storage.set("user", { name: "Alice" }, { expire: 60000, path: "/" });
storage.setSync("user", { name: "Alice" }, { expire: 60000, secure: true });
```

### get / getSync

- `get<T>(key)`: Promise<T | null> (async)
- `getSync<T>(key)`: T | null (sync)

```ts
const user = await storage.get<{ name: string }>("user");
const userSync = storage.getSync<{ name: string }>("user");
```

### remove / removeSync

- Removes the specified key-value pair from the storage.
- `remove(key, options?: RemoveOptions)`: Promise<void> (async)
- `removeSync(key, options?: RemoveOptions)`: void (sync)
- `RemoveOptions` includes:
  - `path`, `domain`, `secure`, `sameSite`: Cookie specific options

```ts
await storage.remove("user");

// include cookie options
await storage.remove("user", { path: "/" });
storage.removeSync("user", { domain: ".example.com" });
```

### clear / clearSync

- Removes all key-value pairs within the current namespace from the storage.
- `clear()`: Promise<void> (async)
- `clearSync()`: void (sync)

### has / hasSync

- `has(key)`: Promise<boolean> (async)
- `hasSync(key)`: boolean (sync)

### getAll / getAllSync

- `getAll()`: Promise<Record<string, T>> (async)
- `getAllSync()`: Record<string, T> (sync)

---

## 4. Batch API

### batchSet / batchSetSync

- You can provide a common option as the second argument, and also specify individual options for each entry using the `options` field.
- At runtime, each entry’s individual options are merged with the common options (entry-specific options take precedence, while common options serve as defaults).
- `batchSet(entries: { key: string; value: any, options?: SetOptions }[], options?: SetOptions)`: Promise<void> (async)
- `batchSetSync(entries: { key: string; value: any, options?: SetOptions }[], options?: SetOptions)`: void (sync)

```ts
await storage.batchSet(
  [
    { key: "a", value: 1 },
    { key: "b", value: 2 },
  ],
  { expire: 3600000 }
);

// "a" will have expire, path, and secure applied, while "b" will have only path and secure applied
await storage.batchSet(
  [
    { key: "a", value: 1, options: { expire: 1000 } },
    { key: "b", value: 2 },
  ],
  { path: "/app", secure: true }
);
```

### batchGet / batchGetSync

- Retrieves multiple values at once. The result array maintains the order of the input keys array. Returns `null` for keys that are not found or expired.
- `batchGet<U = T>(keys: string[])`: Promise<(U | null)[]> (async)
- `batchGetSync<U = T>(keys: string[])`: (U | null)[] (sync)

```ts
const values = await storage.batchGet(["a", "b", "c"]); // [1, 2, null]
```

### batchRemove / batchRemoveSync

- Removes multiple keys at once. The provided `RemoveOptions`(common options) are applied to all keys being removed.
- `batchRemove(keys: string[], options?: RemoveOptions)`: Promise<void> (async)
- `batchRemoveSync(keys: string[], options?: RemoveOptions)`: void (sync)

```ts
storage.batchRemove(["a", "b"]);

// Remove multiple keys with the same cookie path
await storage.batchRemove(["a", "b"], { path: "/app" });
storage.batchRemoveSync(["c", "d"], { path: "/app" });

// Only cookies that match both the path "/app" and the secure flag will be deleted
await storage.batchRemove(["a", "b", "c"], { path: "/app", secure: true });
```

---

## 5. Properties: isMemoryFallback, isSSR

- `isMemoryFallback`: whether the instance is actually using memory storage (true = fallback)
- `stosh.isSSR`: static property, true if running in SSR (window is undefined)

```ts
const storage = stosh();
if (storage.isMemoryFallback) {
  console.warn(
    "Memory storage is being used. Data will be lost on refresh or tab close."
  );
}
if (stosh.isSSR) {
  // SSR-only code
}
```

---

## 6. Middleware System

### use(method, middleware)

- `use(method: 'get' | 'set' | 'remove', middleware, options?)`
  - `middleware`:  
    - Synchronous: `(ctx: MiddlewareContext, next: () => void) => void`  
    - Asynchronous: `(ctx: MiddlewareContext, next: () => Promise<void> | void) => Promise<void> | void`
  - `options?`: `{ prepend?: boolean; append?: boolean // default: true }`  
- Returns: Unsubscribe function

__Creating Middleware__

```ts
const storage = stosh({ type: "local" });

const logger = (ctx, next) => {
  console.log("set called", ctx);
  next();
};

storage.use("set", logger);
```

__use() options__

```ts
storage.use("set", logger, { prepend: true });
```

_Middleware Execution Order Example_

```ts
const storage = stosh({ type: "local" });

const mwA = (ctx, next) => { ctx.value += "_A"; next(); };
const mwB = (ctx, next) => { ctx.value += "_B"; next(); };

// Registered with append (default): executed in registration order
storage.use("set", mwA); // 1st
storage.use("set", mwB); // 2nd

storage.setSync("foo", "start");
// Execution order: mwA → mwB
// Result: "start_A_B"
console.log(storage.getSync("foo")); // "start_A_B"

// Registered with prepend: always added to the front
const mwC = (ctx, next) => { ctx.value += "_C"; next(); };
storage.use("set", mwC, { prepend: true }); // always at the front

storage.setSync("bar", "start");
// Execution order: mwC → mwA → mwB
// Result: "start_C_A_B"
console.log(storage.getSync("bar")); // "start_C_A_B"
```

- `append: true` is the default, but you can specify it explicitly when you want to make it clear that the middleware should be added to the end of the chain (e.g., for dynamic or conditional middleware registration).

  ```ts
  // Always add logging middleware at the end
  storage.use("set", logger, { append: true });
  ```

__Duplicate Registration Policy__

- The same function reference (e.g., a function stored in the same variable) cannot be registered more than once.
  - If you try to register the same function reference again, a warning is shown and it will not actually be added.

  ```ts
  const mw = (ctx, next) => next();
  storage.use("set", mw);
  storage.use("set", mw); // Duplicate registration is ignored
  ```

- __Different functions__ (even if their code is identical) are allowed to be registered together.

  ```ts
  storage.use("set", (ctx, next) => next());
  storage.use("set", (ctx, next) => next()); // Both are registered
  ```

__Unsubscribing (Removing Middleware)__
- The `use` method returns an unsubscribe function.
- Calling the unsubscribe function removes the middleware from the chain.

```ts
const mw = (ctx, next) => next();
const unsub = storage.use("set", mw);
unsub(); // mw middleware is removed
```

__Notes and Caveats__

- If you do not call `next()` within a middleware, the rest of the chain will not be executed.
- Both synchronous and asynchronous middleware are supported, but only synchronous middleware should be used with synchronous methods (like `setSync`).
- If an error occurs during serialization/deserialization, it will be logged to the console and the operation will be ignored.

__isSync Property__

The `isSync` property included in `MiddlewareContext` is a flag that indicates whether the current operation was called from a synchronous API or an asynchronous API.

```ts
MiddlewareContext<T>: {
  key: string
  value: T
  options: SetOptions
  result: any
  isSync: boolean
}

storage.use("set", async (ctx, next) => {
  if (ctx.isSync) {
    // Logic to be executed only in synchronous API
    console.log("Sync set middleware");
  } else {
    // Logic to be executed only in Asynchronous API
    console.log("Async set middleware");
  }
  await next();
});
```

---

## 7. onChange(callback)

- The callback is executed when a value is changed within the current instance using methods like `set`/`remove`/`clear` (applies to all storage types).
- **Note on `clear`/`clearSync`**: These methods internally trigger individual `remove` events for each key being deleted. Therefore, the `onChange` callback might be executed multiple times (once per key) when `clear` or `clearSync` is called, rather than a single 'clear' event.
- The callback is also executed when a `localStorage` or `sessionStorage` value is changed in other tabs/windows (Changes in IndexedDB and Cookie are not propagated to other tabs).
- Supports both synchronous and asynchronous callbacks.
- You can register multiple callbacks and unsubscribe each one individually.

```ts
storage.onChange(async (key, value) => {
  await syncToServer(key, value);
});

// Multiple subscriptions are allowed
const unsub1 = storage.onChange((key, value) => {});
const unsub2 = storage.onChange((key, value) => {});

// Each subscription can be unsubscribed separately
unsub1();
unsub2();
```

---

## 8. Advanced Features and Examples

### Type Safety

```ts
const storage = stosh<{ name: string }>();
await storage.set("user", { name: "Alice" });
const user = await storage.get("user"); // type: { name: string } | null
```

### Namespace Isolation

```ts
const userStorage = stosh({ namespace: "user" });
const cacheStorage = stosh({ namespace: "cache" });
userStorage.set("profile", { name: "Alice" });
cacheStorage.set("temp", 123);
```

### Custom Serialization/Deserialization

```ts
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const b64d = (s: string) => decodeURIComponent(escape(atob(s)));
const storage = stosh({
  namespace: "enc",
  serialize: (data) => b64(JSON.stringify(data)),
  deserialize: (raw) => JSON.parse(b64d(raw)),
});
await storage.set("foo", { a: 1 });
console.log(await storage.get("foo")); // { a: 1 }
```

### Expiration (expire)

```ts
await storage.set("temp", "temporary", { expire: 5000 });
setTimeout(async () => {
  console.log(await storage.get("temp")); // null after 5 seconds
}, 6000);
```

---

## 9. Environment-Specific Behavior and Notes

- All async methods (`set`, `get`, `remove`, `clear`, etc.) always return a Promise. You must use `try/catch` or `.then().catch()` to handle errors.
- Sync methods (`setSync`, `getSync`, etc.) should be wrapped in `try/catch` for error handling.
- Browser storage (`idb`, `local`, `session`, `cookie`) is only available in browser environments
- Always uses memory storage in SSR/Node.js environments
- Cookies have a ~4KB limit per domain and are automatically sent with requests to the same domain. Use path, domain, secure, sameSite options for fine-grained control.
- The cookie-specific options `path`, `domain`, `secure`, and `sameSite` are standardized, but their detailed behavior (such as cookie storage, deletion, transmission, and access) may vary depending on the browser, platform, and whether the environment is HTTP or HTTPS.
- Memory storage data is lost on page refresh or tab/window close
- Not specifying or using duplicate namespaces can cause data collisions (overlap)
- `set` throws an exception when storage quota is exceeded (e.g., `QuotaExceededError` for localStorage)
- Serialization/deserialization or middleware errors can interrupt the operation and cause exceptions
- The `onChange` callback uses the browser's `storage` event for cross-tab change detection, so only `localStorage`/`sessionStorage` changes are propagated to other tabs (IndexedDB, Cookie changes are not propagated)
- If you use async logic in `onChange` callbacks, handle errors inside the callback to avoid silent failures.

---

## 10. Common Error Cases

- localStorage full: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- JSON serialization error: `TypeError: Converting circular structure to JSON`
- Custom serialization/deserialization error: `SyntaxError: Unexpected token ...`
- Accessing in non-browser: `ReferenceError: window is not defined`
