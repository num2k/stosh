# stosh

Middleware-based browser storage wrapper

stosh is an extensible TypeScript library that provides a unified interface for localStorage, sessionStorage, and cookie storage in the browser.

---

## Features

- Unified interface for localStorage, sessionStorage, and cookie
- Namespace support for data isolation
- Expiration (expire) option for set, with auto-removal of expired data
- Middleware pattern: freely extend set/get/remove with custom logic
- Type safety (TypeScript generics)
- Storage event subscription (onChange): react to changes from other tabs/windows
- Custom serialization/deserialization (encryption, compression, etc)
- Batch API: set/get/remove multiple keys at once
- No dependencies
- Cross-browser support (Chrome, Edge, Firefox, Safari, etc)

---

## Installation

```
npm install stosh
```

---

## Quick Start

```ts
import { Stosh } from "stosh";

const storage = new Stosh({ type: "local", namespace: "myApp" });

// Store/retrieve/remove/clear values
storage.set("user", { name: "Alice" }, { expire: 1000 * 60 * 10 });
const user = storage.get<{ name: string }>("user");
storage.remove("user");
storage.clear();

// Check if a key exists
if (storage.has("user")) {
  // ...
}

// Get all values in the namespace
const all = storage.getAll();
```

---

## Expiration (expire) Example

```ts
// Store a value that expires after 5 seconds
storage.set("temp", "temporary", { expire: 5000 });
setTimeout(() => {
  console.log(storage.get("temp")); // null after 5 seconds
}, 6000);
```

---

## Middleware Example

```ts
// Encrypt value on set
storage.use("set", (ctx, next) => {
  ctx.value = encrypt(ctx.value);
  next();
});

// Decrypt value on get
storage.use("get", (ctx, next) => {
  next();
  if (ctx.result) ctx.result = decrypt(ctx.result);
});
```

---

## Multiple Instances / Namespace Isolation Example

```ts
const userStorage = new Stosh({ namespace: "user" });
const cacheStorage = new Stosh({ namespace: "cache", type: "session" });

userStorage.set("profile", { name: "Alice" });
cacheStorage.set("temp", 123);
```

---

## Storage Event Subscription Example

```ts
const storage = new Stosh({ namespace: "sync" });
storage.onChange((key, value) => {
  // React to changes from other tabs/windows
  console.log("Storage changed:", key, value);
});
```

---

## Memory Fallback (Automatic Replacement)

If localStorage or sessionStorage is unavailable (e.g., private mode, storage quota, unsupported browser), stosh automatically falls back to in-memory storage. In this case, data will be lost when the browser is refreshed or the tab is closed.

- You can check if fallback occurred via the instance's `isMemoryFallback` property.
- The API remains the same, so you can use stosh safely without extra error handling.

```ts
const storage = new Stosh();
if (storage.isMemoryFallback) {
  console.warn(
    "Memory storage is being used. Data will be lost on refresh or tab close."
  );
}
```

---

## Storage Fallback Priority System

stosh tries multiple storage backends in the order of priority and automatically selects the first available one. The default priority is `["local", "session", "cookie", "memory"]`, but you can specify your own order with the `priority` option in the constructor.

- Example: If localStorage is unavailable, it tries sessionStorage, then cookie, and finally memory.
- Use case: Ensures safe and consistent data storage across various browser environments, private mode, or restricted environments.

**Usage Example:**

```ts
import { Stosh } from "stosh";

// Try localStorage → sessionStorage → cookie → memory in order
const storage = new Stosh({
  priority: ["local", "session", "cookie", "memory"],
  namespace: "fb",
});

storage.set("foo", "bar");
console.log(storage.get("foo"));
```

---

## SSR (Server-Side Rendering) Support

stosh is safe to import and instantiate in SSR (Server-Side Rendering, e.g., Next.js, Nuxt) environments.

- In SSR environments (when `window` is not defined), stosh automatically uses in-memory storage and does not register browser-only event listeners.
- You can check if the current environment is SSR using the static property `Stosh.isSSR`.
- Only in browser environments will localStorage/sessionStorage actually persist data.

```ts
import { Stosh } from "stosh";

if (Stosh.isSSR) {
  // Code that runs only in SSR (server-side) environments
}

const storage = new Stosh();
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

## Custom Serialization/Deserialization Example (e.g., Encryption)

You can specify serialize/deserialize functions in the constructor options. This allows you to use formats other than JSON (e.g., encryption, compression, etc.).

```ts
// Example: base64 serialization/deserialization
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

---

## Batch API Example

batchSet, batchGet, and batchRemove methods allow you to store, retrieve, and remove multiple key-value pairs at once, which is useful for bulk data operations or initialization.

```ts
const storage = new Stosh({ namespace: "batch" });
// Store multiple values at once
storage.batchSet([
  { key: "a", value: 1 },
  { key: "b", value: 2 },
  { key: "c", value: 3 },
]);
// Retrieve multiple values at once
console.log(storage.batchGet(["a", "b", "c"])); // [1, 2, 3]
// Remove multiple values at once
storage.batchRemove(["a", "b"]);
```

---

## Storage Type Selection

You can select the desired storage type (localStorage, sessionStorage, or cookie) using the `type` option in the Stosh constructor.

---

## Cookie Storage Support

By specifying `type: "cookie"` in the constructor options, you can use the same API (`set`, `get`, `remove`, `clear`, etc.) for cookies.

- Use case: fallback for environments where localStorage/sessionStorage is unavailable, or for small data that needs to be shared with the server.
- Note: Cookies have a size limit (~4KB per domain) and are sent to the server with every HTTP request.

**Example:**

```ts
import { Stosh } from "stosh";

const cookieStorage = new Stosh({ type: "cookie", namespace: "ck" });
cookieStorage.set("foo", "bar");
console.log(cookieStorage.get("foo")); // "bar"
cookieStorage.remove("foo");
```

---

## Type Safety

TypeScript generics ensure type safety for stored/retrieved data.

```ts
const storage = new Stosh<{ name: string }>();
storage.set("user", { name: "Alice" });
const user = storage.get("user"); // type: { name: string } | null
```

---

## Additional Usage Examples

### Dynamic Namespace (Multi-user Support)

```ts
// Assign namespace dynamically per user
function getUserStorage(userId: string) {
  return new Stosh({ namespace: `user:${userId}` });
}
const user1Storage = getUserStorage("alice");
user1Storage.set("profile", { name: "Alice" });
```

### Data Validation/Logging with Middleware

```ts
const storage = new Stosh({ namespace: "log" });
storage.use("set", (ctx, next) => {
  if (typeof ctx.value !== "string") throw new Error("Only strings allowed!");
  console.log("Saving:", ctx.key, ctx.value);
  next();
});
storage.set("greeting", "hello"); // OK
// storage.set('fail', 123); // Throws error
```

### Using Both Session and Local Storage

```ts
const local = new Stosh({ type: "local", namespace: "local" });
const session = new Stosh({ type: "session", namespace: "session" });
local.set("foo", 1);
session.set("bar", 2);
```

### Expiration with Middleware

```ts
const storage = new Stosh({ namespace: "expire" });
storage.use("set", (ctx, next) => {
  // Automatically apply 1-minute expiration to all values
  ctx.options = { ...ctx.options, expire: 60000 };
  next();
});
storage.set("temp", "data");
```

---

## API

- `constructor(options?: { type?: 'local' | 'session'; namespace?: string })`
- `set(key, value, options?: { expire?: number })`
- `get<T>(key): T | null`
- `remove(key)`
- `clear()`
- `has(key)`
- `getAll()`
- `use(method, middleware)`
- `onChange(cb)`
- `batchSet(entries: { key: string; value: any }[])`
- `batchGet(keys: string[]): any[]`
- `batchRemove(keys: string[])`

See the full API reference in [API.md](https://github.com/num2k/stosh/blob/main/documents/API.md).

---

## License

MIT
