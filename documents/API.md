# Stosh API Reference (English)

---

## Constructor

```typescript
new Stosh(options?: {
  type?: 'local' | 'session';      // Storage type (default: 'local')
  namespace?: string;              // Namespace (prefix) for data isolation
  serialize?: (data: any) => string;   // Custom serialization function
  deserialize?: (raw: string) => any;  // Custom deserialization function
})
```

- `type`: Use localStorage if 'local', sessionStorage if 'session'
- `namespace`: Data is fully isolated by namespace
- `serialize`/`deserialize`: You can use formats other than JSON (encryption, compression, etc)

---

## Main Methods

### set(key, value, options?)

- Stores the value for the given key
- You can specify expiration in ms with options.expire
- Example: `storage.set('user', {name: 'Alice'}, {expire: 60000})`

---

## set(key, value, options?) Internal Behavior & Usage

- Internally wraps value and expiration info in an object and serializes it
- If expire is set, stores current time + expire(ms) in the `e` field
- If middleware is registered, runs the set middleware chain before actual storage
- Use cases: expiration, encryption, logging, data normalization, etc

---

### get<T>(key): T | null

- Returns the value for the key (returns null if expired)
- Type-safe with TypeScript generics
- Example: `const user = storage.get<{name: string}>('user')`

---

## get<T>(key) Internal Behavior & Usage

- Deserializes the stored value, checks expiration (`e` field) against current time
- If expired, deletes and returns null; if valid, returns value (`v` field)
- If get middleware is registered, passes through the middleware chain
- Use cases: decryption, type conversion, access logging, etc

---

### remove(key)

- Removes the value for the key

### clear()

- Removes all values in the current namespace

### has(key): boolean

- Returns whether the key exists

### getAll(): Record<string, any>

- Returns all key-value pairs in the namespace as an object

---

## Middleware & Events

### use(method, middleware)

- Add middleware (interceptor) to set/get/remove operations
- Example:
  ```ts
  storage.use("set", (ctx, next) => {
    ctx.value = encrypt(ctx.value);
    next();
  });
  ```
- Middleware signature:
  ```ts
  (ctx: { key: string; value?: any; options?: any; result?: any }, next: () => void) => void
  ```

---

## use(method, middleware) Usage

- You can register any number of middleware in a chain for set/get/remove
- Each middleware receives ctx (context) and next(), and can modify ctx or run logic before/after next()
- Use cases: input validation, auto-expiration, encryption/decryption, external API integration, etc

---

### onChange(callback)

- Callback is triggered when a value in the same namespace is changed from another tab/window
- Example:
  ```ts
  storage.onChange((key, value) => {
    console.log(key, value);
  });
  ```

---

## onChange(cb) Internal Behavior & Usage

- Uses the window storage event; callback is triggered when a value in the same namespace is changed from another tab/window
- Callback receives (key, value) of the changed item
- Use cases: real-time sync, collaboration apps, notifications, etc

---

## Batch API

### batchSet(entries: {key, value, options?}[])

- Stores multiple key-value pairs at once
- Example:
  ```ts
  storage.batchSet([
    { key: "a", value: 1 },
    { key: "b", value: 2 },
  ]);
  ```

### batchGet(keys: string[]): any[]

- Returns an array of values for the given keys
- Example:
  ```ts
  const values = storage.batchGet(["a", "b"]);
  ```

### batchRemove(keys: string[])

- Removes multiple keys at once
- Example:
  ```ts
  storage.batchRemove(["a", "b"]);
  ```

---

## batchSet/batchGet/batchRemove Internal Behavior & Usage

- Each method simply calls set/get/remove repeatedly
- Middleware, expiration, serialization, etc. work the same as single methods
- Use cases: bulk initialization, sync, batch deletion, etc

---

## Type Safety

- TypeScript generics ensure type-safe storage and retrieval
- Example:
  ```ts
  const storage = new Stosh<{ name: string }>();
  storage.set("user", { name: "Alice" });
  const user = storage.get("user"); // type: { name: string } | null
  ```

---

## Namespace

- Data is fully isolated by namespace specified in the constructor
- Example:
  ```ts
  const userStorage = new Stosh({ namespace: "user" });
  const cacheStorage = new Stosh({ namespace: "cache" });
  userStorage.set("profile", { name: "Alice" });
  cacheStorage.set("temp", 123);
  ```

---

## Custom Serialization/Deserialization

- You can use formats other than JSON (encryption, compression, etc)
- Example:
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

---

## Expiration (expire)

- You can specify expiration in ms with options.expire in set
- Expired values are automatically deleted and return null on get
- Example:
  ```ts
  storage.set("temp", "temporary", { expire: 5000 });
  setTimeout(() => {
    console.log(storage.get("temp")); // null after 5 seconds
  }, 6000);
  ```

---

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

---

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

---

## Usage Notes & Error Cases

### Notes

- **Works only in browser environments**: localStorage/sessionStorage are only available in browsers (will throw in SSR/Node.js)
- **Namespace collision**: Creating multiple instances with the same namespace can cause data overlap
- **Storage quota limits**: Browsers limit localStorage/sessionStorage size (typically ~5MB); set may throw if exceeded
- **Serialization/Deserialization errors**: Storing circular references or non-JSON-serializable values will throw; custom serialize/deserialize may cause type or parsing errors
- **Expiration (expire) option**: If system time changes, expiration may behave unexpectedly
- **Middleware exceptions**: If a middleware throws, the entire set/get/remove operation will be aborted
- **onChange event**: set/remove in the same tab does not trigger onChange (only works across tabs/windows)

### Common Error Cases

- When localStorage is full: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- Storing non-serializable objects: `TypeError: Converting circular structure to JSON`
- Custom serialization/deserialization errors: `SyntaxError: Unexpected token ...` (parsing failure, etc)
- Accessing in non-browser environments: `ReferenceError: window is not defined`
