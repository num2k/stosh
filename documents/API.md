# Stosh API Reference

---

## 1. StoshOptions & Storage Types/Priority

- `type`: "local" | "session" | "cookie" (storage type, default: "local")
- `priority`: Array<"local" | "session" | "cookie" | "memory"> (storage fallback priority order)
- `namespace`: string (namespace prefix)
- `serialize`/`deserialize`: custom serialization/deserialization functions

### Storage Types

- **local**: localStorage (persistent, per domain)
- **session**: sessionStorage (per tab/session)
- **cookie**: document.cookie (per domain, sent to server, ~4KB limit)
- **memory**: in-memory fallback (temporary, lost on refresh)

### Storage Fallback Priority

- Default: tries ["local", "session", "cookie", "memory"] in order
- You can specify the order with the `priority` option
- In SSR (server-side) environments, always uses memory storage

**Example:**

```ts
const storage = new Stosh({
  priority: ["local", "session", "cookie", "memory"],
  namespace: "fb",
});
```

### Cookie/Memory/SSR Environment Notes

- Cookie: browser only, ~4KB limit, sent to server, falls back to memory in SSR/Node.js
- Memory: lost on refresh/tab close, always used in SSR/Node.js
- SSR: if window is undefined, always uses memory storage

---

## 2. Constructor & API Signature

```ts
new Stosh(options?: {
  type?: "local" | "session" | "cookie";
  priority?: Array<"local" | "session" | "cookie" | "memory">;
  namespace?: string;
  serialize?: (data: any) => string;
  deserialize?: (raw: string) => any;
})
```

---

## 3. Main Methods & Examples

### set(key, value, options?)

- Store a value, optionally with options.expire (ms)

```ts
storage.set("user", { name: "Alice" }, { expire: 60000 });
```

### get<T>(key): T | null

- Retrieve a value, returns null if expired

```ts
const user = storage.get<{ name: string }>("user");
```

### remove(key)

- Remove a value

### clear()

- Remove all values in the namespace

### has(key): boolean

- Returns whether the key exists

### getAll(): Record<string, any>

- Returns all key-value pairs in the namespace

---

## 4. Key Properties: isMemoryFallback, isSSR

- `isMemoryFallback`: An instance property indicating whether the storage has actually fallen back to in-memory storage (temporary storage).
  - If true, it means local/session/cookie storage is unavailable and memory storage is being used.
  - Example:
    ```ts
    const storage = new Stosh();
    if (storage.isMemoryFallback) {
      console.warn(
        "Memory storage is being used. Data will be lost on refresh or tab close."
      );
    }
    ```
- `Stosh.isSSR`: A static property that returns true if the current environment is SSR (server-side).
  - Returns true if window is undefined.
  - Example:
    ```ts
    if (Stosh.isSSR) {
      // Code that runs only in SSR (server-side) environments
    }
    ```

---

## 5. Middleware & Events

### use(method, middleware)

- Add middleware to set/get/remove operations

```ts
storage.use("set", (ctx, next) => {
  ctx.value = encrypt(ctx.value);
  next();
});
```

### onChange(callback)

- Callback when a value is changed from another tab/window

```ts
storage.onChange((key, value) => {
  console.log(key, value);
});
```

---

## 6. Batch API

### batchSet(entries: {key, value, options?}[])

- Store multiple values at once

### batchGet(keys: string[]): any[]

- Retrieve multiple values at once

### batchRemove(keys: string[])

- Remove multiple values at once

---

## 7. Advanced Features & Examples

### Type Safety

```ts
const storage = new Stosh<{ name: string }>();
storage.set("user", { name: "Alice" });
const user = storage.get("user"); // type: { name: string } | null
```

### Namespace Isolation

```ts
const userStorage = new Stosh({ namespace: "user" });
const cacheStorage = new Stosh({ namespace: "cache" });
userStorage.set("profile", { name: "Alice" });
cacheStorage.set("temp", 123);
```

### Custom Serialization/Deserialization

```ts
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const b64d = (s: string) => decodeURIComponent(escape(atob(s)));
const storage = new Stosh({
  namespace: "enc",
  serialize: (data) => b64(JSON.stringify(data)),
  deserialize: (raw) => JSON.parse(b64d(raw)),
});
storage.set("foo", { a: 1 });
console.log(storage.get("foo")); // { a: 1 }
```

### Expiration (expire)

```ts
storage.set("temp", "temporary", { expire: 5000 });
setTimeout(() => {
  console.log(storage.get("temp")); // null after 5 seconds
}, 6000);
```

---

## 8. Environment Behavior & Notes

- Only local/session/cookie storage is available in browsers
- Always uses memory storage in SSR/Node.js
- Cookie: ~4KB limit, sent to server
- Memory: lost on refresh/tab close
- Namespace collision can cause data overlap
- Storage quota exceeded throws in set
- Serialization/deserialization/middleware errors abort the operation
- onChange does not trigger in the same tab (only across tabs/windows)

---

## 9. Common Error Cases

- When localStorage is full: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- Storing non-serializable objects: `TypeError: Converting circular structure to JSON`
- Custom serialization/deserialization errors: `SyntaxError: Unexpected token ...` (parsing failure, etc)
- Accessing in non-browser environments: `ReferenceError: window is not defined`
