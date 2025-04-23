# stosh

Middleware-based browser storage wrapper

stosh is a TypeScript library that provides a unified interface for IndexedDB, localStorage, sessionStorage, and cookie in the browser, with a focus on safety and extensibility.

---

## Features

- Unified interface for IndexedDB/localStorage/sessionStorage/cookie
- Namespace (prefix) for data isolation and management
- Expiration (expire) option for set, with auto-removal of expired data
- Middleware pattern: freely extend set/get/remove with custom logic
- Type safety (TypeScript generics)
- Storage event subscription (onChange): Executes callback when storage value changes
- Custom serialization/deserialization (encryption, compression, etc)
- Batch API: set/get/remove multiple keys at once
- No dependencies, lightweight bundle size under 4kB (gzipped)
- Cross-browser support (Chrome, Edge, Firefox, Safari, etc)
- Compatible with all JS/TS projects (React, Vue, Next, plain HTML+JS, etc.)

---

## Installation

**npm**:

```bash
npm install stosh
```

**yarn**:

```bash
yarn add stosh
```

**pnpm**:

```bash
pnpm add stosh
```

**CDN Usage in Plain HTML**:
Just add the following `script` tag, and stosh will be available as a global function (`window.stosh`):

```html
<script src="https://cdn.jsdelivr.net/gh/num2k/stosh@latest/standalone/stosh.js"></script>
<script>
  const storage = stosh({ namespace: "demo" });
  storage.setSync("foo", 123);
  console.log(storage.getSync("foo")); // 123
</script>
```

---

## Basic Usage

All main APIs (set/get/remove, etc.) are Promise-based async functions. Use with await or .then().

```ts
import { stosh } from "stosh";

const storage = stosh({ namespace: "myApp" });

// Store/retrieve/remove/clear
await storage.set("user", { name: "Alice" }, { expire: 1000 * 60 * 10 });
const user = await storage.get<{ name: string }>("user");
await storage.remove("user");
await storage.clear();

// Check if a key exists
if (await storage.has("user")) {
  // ...
}

// Get all values in the namespace
const all = await storage.getAll();
```

---

## Synchronous API Usage

If you need synchronous APIs, use setSync/getSync/removeSync, etc. (Sync suffix). All features (expiration, namespace, middleware, batch, custom serialization, etc.) are supported except for IndexedDB (async storage).

```ts
const storage = stosh({ namespace: "myApp" });
storage.setSync("foo", 1);
const v = storage.getSync("foo");
storage.removeSync("foo");
storage.clearSync();
```

---

## Expiration (expire) Option Example

```ts
await storage.set("temp", "temporary value", { expire: 5000 });
setTimeout(async () => {
  console.log(await storage.get("temp")); // Returns null after 5 seconds
}, 6000);
```

---

## Middleware Usage Example

```ts
storage.use("set", async (ctx, next) => {
  ctx.value = await encryptAsync(ctx.value);
  await next();
});

storage.use("get", async (ctx, next) => {
  await next();
  if (ctx.result) ctx.result = await decryptAsync(ctx.result);
});
```

---

## Multiple Instances / Namespace Isolation Example

```ts
const userStorage = stosh({ namespace: "user" });
const cacheStorage = stosh({ namespace: "cache", type: "session" });

await userStorage.set("profile", { name: "Bob" });
await cacheStorage.set("temp", 123);
```

---

## Storage Event Subscription Example

- The callback is triggered immediately when values are changed via `set`, `remove`, or `clear` on the current instance.
- **Note on `clear`/`clearSync`**: These methods internally trigger individual `remove` events for each key being deleted. Therefore, the `onChange` callback might be executed multiple times (once per key) when `clear` or `clearSync` is called, rather than a single 'clear' event.
- In other tabs or windows, the callback is only triggered when **localStorage** or **sessionStorage** values are changed.

```ts
storage.onChange(async (key, value) => {
  await syncToServer(key, value);
});
```

---

## Storage Type Selection

You can select the desired storage type (IndexedDB, localStorage, sessionStorage, cookie) using the `type` option in the stosh function.

**Example:**

```ts
const storage = stosh({
  type: "local", // use localStorage
  namespace: "fb",
});
```

---

## Storage Fallback Priority System

Multiple storages are tried in order of priority, and the first available storage is automatically selected.
The default priority is `["idb", "local", "session", "cookie", "memory"]`.
When using synchronous APIs (`*Sync`), IndexedDB (`idb`) is excluded because it's asynchronous-only, so the effective priority starts from `local`.
You can customize the order with the `priority` option.

- Example: If IndexedDB is unavailable, it automatically falls back to localStorage, then sessionStorage, cookie, and finally memory.
- Use case: Ensures safe and consistent data storage across various browser environments, private mode, or restricted environments.

**Example:**

```ts
const storage = stosh({
  namespace: "fb",
});
await storage.set("foo", "bar"); // Tries to store in idb (IndexedDB) first
console.log(await storage.get("foo"));

// Synchronous API
storage.setSync("foo", "bar"); // Tries to store in localStorage first
console.log(storage.getSync("foo"));

// Custom priority
const storage2 = stosh({
  priority: ["cookie", "local", "session", "idb", "memory"],
  namespace: "fb",
});
await storage2.set("foo", "bar"); // Tries to store in cookie first
```

**Interaction between `priority` and `type` options:**

- If `priority` is specified, the `type` option is ignored. Storages are attempted in the order defined by the `priority` array.
- If `priority` is not specified but `type` is, only the specified `type` will be used (no fallback).
- If neither `priority` nor `type` is specified, the default priority (`["idb", "local", ...]`) is applied.

---

## Cookie Storage Support

By specifying `type: "cookie"` in the function options, you can use the same API for cookies.

- Use case: fallback for environments where IndexedDB/localStorage/sessionStorage is unavailable, or for small data that needs to be shared with the server.
- Note: Cookies have a size limit (~4KB per domain) and are sent to the server with every HTTP request.

**Example:**

```ts
const cookieStorage = stosh({ type: "cookie", namespace: "ck" });
await cookieStorage.set("foo", "bar");
console.log(await cookieStorage.get("foo")); // "bar"
await cookieStorage.remove("foo");
```

---

## SSR (Server-Side Rendering) Support

stosh can be safely imported and instantiated in SSR (Server-Side Rendering, e.g., Next.js, Nuxt) environments.

- In SSR environments (when window is undefined), stosh automatically uses memory storage and does not register browser-only event listeners.
- You can check if the current environment is SSR using the static property `stosh.isSSR`.

```ts
if (stosh.isSSR) {
  // Code that runs only in SSR (server-side) environments
}
```

---

## Memory Fallback (Automatic Replacement)

If browser storage (IndexedDB, localStorage, sessionStorage, cookie) cannot be used (e.g., SSR, private mode, storage restriction, unsupported browser, etc.), stosh automatically falls back to memory storage. In this case, data will be lost when the browser is refreshed or the tab is closed.

- You can check if fallback occurred via the instance's `isMemoryFallback` property.
- The API remains the same, so you can use stosh safely without extra error handling.

```ts
const storage = stosh();
if (storage.isMemoryFallback) {
  console.warn(
    "Memory storage is being used. Data will be lost on refresh or tab close."
  );
}
```

---

## Automatic Serialization/Deserialization of Objects/Arrays

Objects, arrays, and other non-primitive values are automatically serialized/deserialized using JSON.stringify/parse, so you can safely store and retrieve data without extra handling.

---

## Custom Serialization/Deserialization Example

You can specify serialize/deserialize functions in the function options. This allows you to use formats other than JSON (e.g., encryption, compression, etc.).

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

---

## Batch API Example

```ts
const storage = stosh({ namespace: "batch" });
// Store multiple values at once
await storage.batchSet([
  { key: "a", value: 1 },
  { key: "b", value: 2 },
  { key: "c", value: 3 },
]);
// Retrieve multiple values at once
console.log(await storage.batchGet(["a", "b", "c"])); // [1, 2, 3]
// Remove multiple values at once
await storage.batchRemove(["a", "b"]);
```

---

## Type Safety

TypeScript generics ensure type safety for stored/retrieved data.

```ts
const storage = stosh<{ name: string }>();
await storage.set("user", { name: "Alice" });
const user = await storage.get("user"); // type: { name: string } | null
```

---

## Additional Usage Examples

### Dynamic Namespace (Multi-user Support)

```ts
function getUserStorage(userId: string) {
  return stosh({ namespace: `user:${userId}` });
}
const user1Storage = getUserStorage("alice");
await user1Storage.set("profile", { name: "Alice" });
```

### Data Validation/Logging with Middleware

```ts
const storage = stosh({ namespace: "log" });

storage.use("set", async (ctx, next) => {
  if (typeof ctx.value !== "string") throw new Error("Only strings allowed!");
  await logToServer(ctx.key, ctx.value);
  await next();
});
await storage.set("greeting", "hello"); // OK
// await storage.set('fail', 123); // Throws error
```

### Expiration with Middleware

```ts
const storage = stosh({ namespace: "expire" });
storage.use("set", async (ctx, next) => {
  // Automatically apply 1-minute expiration to all values
  ctx.options = { ...ctx.options, expire: 60000 };
  await next();
});
await storage.set("temp", "data");
```

---

## API

- `stosh(options?: { type?: 'idb' | 'local' | 'session' | 'cookie'; namespace?: string })`
- `set(key, value, options?: { expire?: number }): Promise<void>`
- `get<T>(key): Promise<T | null>`
- `remove(key): Promise<void>`
- `clear(): Promise<void>`
- `has(key): Promise<boolean>`
- `getAll(): Promise<Record<string, any>>`
- `setSync/getSync/removeSync/clearSync/hasSync/getAllSync`
- `batchSet(entries: { key: string; value: any }[]): Promise<void>`
- `batchGet(keys: string[]): Promise<any[]>`
- `batchRemove(keys: string[]): Promise<void>`
- `batchSetSync/batchGetSync/batchRemoveSync`
- `use(method, middleware)`
- `onChange(cb)`

See the full API reference in [API.md](https://github.com/num2k/stosh/blob/main/documents/API.md).

---

## License

MIT
