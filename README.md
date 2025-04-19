# stosh

Middleware-based browser storage wrapper

## Introduction

stosh provides a unified, type-safe interface for localStorage and sessionStorage, with middleware support for extensible data processing (encryption, logging, validation, etc). It supports namespaces, expiration, batch operations, custom serialization, and storage event subscription—all in a lightweight TypeScript library.

No external dependencies. Objects/arrays are automatically (de)serialized as JSON by default.

## Features

- Unified interface for localStorage/sessionStorage
- Namespace support for data isolation
- Expiration (expire) option for set, with auto-removal of expired data
- Middleware pattern: freely extend set/get/remove with custom logic
- Type safety (TypeScript generics)
- Storage event subscription (onChange): react to changes from other tabs/windows
- Custom serialization/deserialization (encryption, compression, etc)
- Batch API: set/get/remove multiple keys at once
- No dependencies, lightweight (<6KB)
- Supports all modern browsers (Chrome, Edge, Firefox, Safari, etc)

## Installation

```
npm install stosh
```

## Basic Usage

```ts
import { Stosh } from "stosh";

const storage = new Stosh({ type: "local", namespace: "myApp" });

// Set, get, remove, clear
storage.set("user", { name: "Alice" }, { expire: 1000 * 60 * 10 });
const user = storage.get<{ name: string }>("user");
storage.remove("user");
storage.clear();

// Check if key exists
if (storage.has("user")) {
  // ...
}

// Get all values in namespace
const all = storage.getAll();
```

## Expiration Example

```ts
// Store a value that expires in 5 seconds
storage.set("temp", "temporary", { expire: 5000 });
setTimeout(() => {
  console.log(storage.get("temp")); // null after 5 seconds
}, 6000);
```

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

## Multiple Instances / Namespaces

```ts
const userStorage = new Stosh({ namespace: "user" });
const cacheStorage = new Stosh({ namespace: "cache", type: "session" });

userStorage.set("profile", { name: "Alice" });
cacheStorage.set("temp", 123);
```

### Real-time Sync with onChange

```ts
const storage = new Stosh({ namespace: "sync" });
storage.onChange((key, value) => {
  // Reflect changes from other tabs in real time
  console.log("Changed:", key, value);
});
```

## Automatic (De)serialization

Objects and arrays are automatically serialized/deserialized as JSON. You can store and retrieve complex data structures without extra code.

## Custom Serialization/Deserialization Example (e.g. Encryption)

You can provide custom serialize/deserialize functions in the constructor for encryption, compression, or other formats.

```ts
// Example: base64 encode/decode
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

## Batch API Example

Batch methods let you set, get, or remove multiple keys at once—useful for bulk operations or initialization.

```ts
const storage = new Stosh({ namespace: "batch" });
// Set multiple values
storage.batchSet([
  { key: "a", value: 1 },
  { key: "b", value: 2 },
  { key: "c", value: 3 },
]);
// Get multiple values
console.log(storage.batchGet(["a", "b", "c"])); // [1, 2, 3]
// Remove multiple values
storage.batchRemove(["a", "b"]);
```

## Storage Type Selection

Choose localStorage or sessionStorage via the type option in the constructor.

## Memory Fallback (Automatic Replacement)

stosh automatically falls back to in-memory storage if localStorage or sessionStorage is unavailable (e.g., private browsing, storage quota exceeded, browser restrictions, or non-browser environments). In this case, data will be lost when the browser is refreshed or the tab is closed.

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

## SSR (Server-Side Rendering) Support

stosh is safe to import and instantiate in SSR (Server-Side Rendering) environments such as Next.js and Nuxt.

- In SSR environments (when `window` is not defined), stosh automatically uses in-memory storage and does not register browser-only event listeners.
- You can check if the current environment is SSR using the static property `Stosh.isSSR`.
- Only in browser environments will localStorage/sessionStorage actually persist data.

```ts
import { Stosh } from "stosh";

if (Stosh.isSSR) {
  // Code that runs only in server (SSR) environments
}

const storage = new Stosh();
if (storage.isMemoryFallback) {
  console.warn(
    "Memory storage is being used. Data will be lost on refresh or tab close."
  );
}
```

## Type Safety

TypeScript generics ensure type-safe storage and retrieval.

```ts
const storage = new Stosh<{ name: string }>();
storage.set("user", { name: "Alice" });
const user = storage.get("user"); // type: { name: string } | null
```

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

### Expire Option with Middleware

```ts
const storage = new Stosh({ namespace: "expire" });
storage.use("set", (ctx, next) => {
  // Automatically set 1 minute expiration for all values
  ctx.options = { ...ctx.options, expire: 60000 };
  next();
});
storage.set("temp", "data");
```

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

See the full API documentation in [API.md](https://github.com/num2k/stosh/blob/main/documents/API.md).

## License

MIT
