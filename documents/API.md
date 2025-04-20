# Stosh API Reference

---

## 1. StoshOptions and Storage Types/Priority

- `type`: "idb" | "local" | "session" | "cookie" | "memory" (storage type, default: "idb")
- `priority`: Array<"idb" | "local" | "session" | "cookie" | "memory"> (storage fallback priority)
- `namespace`: string (namespace prefix)
- `serialize`/`deserialize`: custom serialization/deserialization functions

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
})
```

---

## 3. Main Methods and Examples

### set / setSync

- `set(key, value, options?)`: Promise<void> (async)
- `setSync(key, value, options?)`: void (sync)
- options.expire(ms) for expiration

```ts
await storage.set("user", { name: "Alice" }, { expire: 60000 });
storage.setSync("user", { name: "Alice" }, { expire: 60000 });
```

### get / getSync

- `get<T>(key)`: Promise<T | null> (async)
- `getSync<T>(key)`: T | null (sync)

```ts
const user = await storage.get<{ name: string }>("user");
const userSync = storage.getSync<{ name: string }>("user");
```

### remove / removeSync

- `remove(key)`: Promise<void> (async)
- `removeSync(key)`: void (sync)

### clear / clearSync

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

- `batchSet(entries: {key, value, options?}[]): Promise<void>` (async)
- `batchSetSync(entries: {key, value, options?}[]): void` (sync)

### batchGet / batchGetSync

- The result array is in the same order as the input keys array.
- `batchGet(keys: string[]): Promise<any[]>` (async)
- `batchGetSync(keys: string[]): any[]` (sync)

### batchRemove / batchRemoveSync

- `batchRemove(keys: string[]): Promise<void>` (async)
- `batchRemoveSync(keys: string[]): void` (sync)

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

- Add middleware to set/get/remove
- Supports both sync and async middleware

```ts
storage.use("set", async (ctx, next) => {
  ctx.value = await encryptAsync(ctx.value);
  await next();
});
```

### onChange(callback)

- Callback when value changes in another tab/window
- Supports both sync and async callbacks

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

## 8. Environment Notes

- Only browsers support `local`/`session`/`cookie`/`idb` storage
- SSR/Node.js always uses memory storage
- Cookie: 4KB limit, sent to server
- Memory: lost on refresh/tab close
- Namespace collision can cause data overlap
- Storage quota exceeded throws error
- Serialization/deserialization/middleware errors can stop operation
- `onChange` does not fire in the same tab (only other tabs/windows)

---

## 9. Common Error Cases

- localStorage full: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- JSON serialization error: `TypeError: Converting circular structure to JSON`
- Custom serialization/deserialization error: `SyntaxError: Unexpected token ...`
- Accessing in non-browser: `ReferenceError: window is not defined`
