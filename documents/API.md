# Stosh API Reference

---

## 1. StoshOptions and Storage Types/Priority

- `type`: "idb" | "local" | "session" | "cookie" | "memory" (storage type, default: "idb")
- `priority`: Array<"idb" | "local" | "session" | "cookie" | "memory"> (storage fallback priority)
- `namespace`: string (namespace prefix)
- `serialize`/`deserialize`: custom serialization/deserialization functions
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

- `getAll()`: Promise<Record<string, any>> (async)
- `getAllSync()`: Record<string, any> (sync)

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
- `batchGet(keys: string[])`: Promise<(any | null)[]> (async)
- `batchGetSync(keys: string[])`: (any | null)[] (sync)

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

## 6. Middleware and Events

### use(method, middleware)

- Add middleware to 'get', 'set' or 'remove' operations.
- Supports both sync and async middleware.
- `method`: 'get' | 'set' | 'remove'
- `middleware`: `(ctx: MiddlewareContext, next: () => Promise<void> | void) => Promise<void> | void`

```ts
storage.use("set", async (ctx, next) => {
  ctx.value = await encryptAsync(ctx.value);
  await next();
});
```

### onChange(callback)

- The callback is executed when a value is changed within the current instance using methods like `set`/`remove`/`clear` (applies to all storage types).
- **Note on `clear`/`clearSync`**: These methods internally trigger individual `remove` events for each key being deleted. Therefore, the `onChange` callback might be executed multiple times (once per key) when `clear` or `clearSync` is called, rather than a single 'clear' event.
- The callback is also executed when a `localStorage` or `sessionStorage` value is changed in other tabs/windows (Changes in IndexedDB and Cookie are not propagated to other tabs).
- Supports both synchronous and asynchronous callbacks.

```ts
storage.onChange(async (key, value) => {
  await syncToServer(key, value);
});
```

---

## 7. Advanced Features and Examples

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

## 8. Environment-Specific Behavior and Notes

- Browser storage (`idb`, `local`, `session`, `cookie`) is only available in browser environments
- Always uses memory storage in SSR/Node.js environments
- Cookies have a ~4KB limit per domain and are automatically sent with requests to the same domain. Use path, domain, secure, sameSite options for fine-grained control.
- The cookie-specific options `path`, `domain`, `secure`, and `sameSite` are standardized, but their detailed behavior (such as cookie storage, deletion, transmission, and access) may vary depending on the browser, platform, and whether the environment is HTTP or HTTPS.
- Memory storage data is lost on page refresh or tab/window close
- Not specifying or using duplicate namespaces can cause data collisions (overlap)
- `set` throws an exception when storage quota is exceeded (e.g., `QuotaExceededError` for localStorage)
- Serialization/deserialization or middleware errors can interrupt the operation and cause exceptions
- The `onChange` callback uses the browser's `storage` event for cross-tab change detection, so only `localStorage`/`sessionStorage` changes are propagated to other tabs (IndexedDB, Cookie changes are not propagated)

---

## 9. Common Error Cases

- localStorage full: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- JSON serialization error: `TypeError: Converting circular structure to JSON`
- Custom serialization/deserialization error: `SyntaxError: Unexpected token ...`
- Accessing in non-browser: `ReferenceError: window is not defined`
