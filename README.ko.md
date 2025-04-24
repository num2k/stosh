# stosh

미들웨어 기반 브라우저 스토리지 래퍼

stosh는 IndexedDB, localStorage, sessionStorage, cookie를 브라우저에서 안전하고 확장성 있게 사용할 수 있도록 공통 인터페이스를 제공하는 TypeScript 라이브러리입니다.

---

## 주요 특징

- IndexedDB/localStorage/sessionStorage/cookie 공통 인터페이스 제공
- 네임스페이스(접두사)로 데이터 격리 및 관리
- set 시 만료(expire) 옵션 지원, 만료 데이터 자동 삭제
- 미들웨어 패턴 지원: set/get/remove 동작에 자유롭게 기능 추가 가능
- 타입 안전성(TypeScript 제네릭)
- 스토리지 이벤트 구독(onChange) 지원: 스토리지 값 변경 시 콜백 실행
- 커스텀 직렬화/역직렬화 지원(암호화, 압축 등 다양한 포맷 사용 가능)
- 일괄 처리(Batch) API 지원: 여러 키/값을 한 번에 저장·조회·삭제
- 외부 의존성 없음, 경량화 번들사이즈 4kB(gzip) 이하
- 크로스 브라우저(Chrome, Edge, Firefox, Safari 등) 지원
- 모든 JS/TS 프로젝트(React, Vue, Next, 순수 HTML+JS 등)에서 호환

---

## 설치

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

**순수 HTML에서 CDN 사용:**
아래와 같이 `script` 태그를 추가하면, stosh를 전역 함수(`window.stosh`)로 바로 사용할 수 있습니다.

```html
<script src="https://cdn.jsdelivr.net/gh/num2k/stosh@latest/standalone/stosh.js"></script>
<script>
  const storage = stosh({ namespace: "demo" });
  storage.setSync("foo", 123);
  console.log(storage.getSync("foo")); // 123
</script>
```

---

## 기본 사용법

stosh의 기본 API(set/get/remove 등)는 모두 `Promise` 기반의 비동기 함수입니다. `await` 또는 `.then()`으로 사용하세요.

```ts
import { stosh } from "stosh";

const storage = stosh({ namespace: "myApp" });

// 값 저장/조회/삭제
await storage.set("user", { name: "홍길동" }, { expire: 1000 * 60 * 10 });
const user = await storage.get<{ name: string }>("user");
await storage.remove("user");
await storage.clear();

// 키 존재 여부
if (await storage.has("user")) {
  // ...
}

// 네임스페이스 내 전체 값 조회
const all = await storage.getAll();
```

---

## 동기 API 사용법

동기 API가 필요한 경우 `setSync`/`getSync`/`removeSync` 등 `Sync` 접미사 메서드를 사용하세요.
IndexedDB(비동기 저장소)만 제외하면 localStorage, sessionStorage, cookie, memory와 모든 기능(만료, 네임스페이스, 미들웨어, batch, 커스텀 직렬화 등)을 지원합니다.

```ts
const storage = stosh({ namespace: "myApp" });
storage.setSync("foo", 1);
const v = storage.getSync("foo");
storage.removeSync("foo");
storage.clearSync();
```

---

## 만료(expire) 옵션 사용 예시

```ts
await storage.set("temp", "임시값", { expire: 5000 });
setTimeout(async () => {
  console.log(await storage.get("temp")); // 5초 후에는 null 반환
}, 6000);
```

---

## 미들웨어 활용 예시

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

## 여러 인스턴스/네임스페이스 분리 예시

```ts
const userStorage = stosh({ namespace: "user" });
const cacheStorage = stosh({ namespace: "cache", type: "session" });

await userStorage.set("profile", { name: "홍길동" });
await cacheStorage.set("temp", 123);
```

---

## 스토리지 이벤트 구독 예시

- 현재 인스턴스에서 `set`/`remove`/`clear` 등으로 값이 변경될 때 콜백이 즉시 실행됩니다.
- **`clear`/`clearSync` 관련 참고**: 이 메서드들은 내부적으로 삭제되는 각 키에 대해 개별적인 `remove` 이벤트를 발생시킵니다. 따라서 `clear` 또는 `clearSync` 호출 시, 단일 'clear' 이벤트가 아니라 각 키마다 한 번씩, 즉 여러 번 `onChange` 콜백이 실행될 수 있습니다.
- 다른 탭/윈도우에서는 **localStorage 또는 sessionStorage** 값 변경시에만 콜백이 실행됩니다.

```ts
storage.onChange(async (key, value) => {
  await syncToServer(key, value);
});
```

---

## 스토리지 타입 선택

stosh 생성자 옵션(`type`)으로 IndexedDB, localStorage, sessionStorage, cookie 중 원하는 스토리지를 선택할 수 있습니다.

**사용 예시:**

```ts
const storage = stosh({
  type: "local", // localStorage 사용
  namespace: "fb",
});
```

---

## 저장소 폴백 우선순위(priority) 체계

여러 저장소를 우선순위대로 시도하여, 사용 가능한 첫 번째 저장소를 자동으로 적용합니다.
기본 우선순위는 `["idb", "local", "session", "cookie", "memory"]`이며 동기 API(`*Sync`) 사용 시에는 IndexedDB(`idb`)가 비동기 전용이므로, 기본 우선순위에서 `idb`를 제외하고 `local`부터 적용됩니다.
생성자 옵션의 `priority`로 직접 순서를 변경할 수 있습니다.

- 예시: IndexedDB가 불가하면 localStorage, 그다음 sessionStorage, cookie, 마지막으로 memory 순으로 자동 폴백
- 활용: 다양한 브라우저 환경, 프라이빗 모드, 제한 환경 등에서 일관된 API로 안전하게 데이터 저장

**사용 예시:**

```ts
const storage = stosh({
  namespace: "fb",
});
await storage.set("foo", "bar"); // idb(IndexedDB)에 최우선 저장 시도
console.log(await storage.get("foo"));

// 동기 API
storage.setSync("foo", "bar"); // local(localStorage)에 최우선 저장 시도
console.log(storage.getSync("foo"));

// 우선순위 커스텀
const storage2 = stosh({
  priority: ["cookie", "local", "session", "idb", "memory"],
  namespace: "fb",
});
await storage2.set("foo", "bar"); // cookie에 최우선 저장 시도
```

**`priority`와 `type` 옵션 간의 상호작용**

- `priority`를 지정하면 `type`은 무시되고, `priority` 배열에 명시된 순서대로 시도합니다.
- `priority`가 없고 `type`이 지정되면 해당 타입만 사용됩니다. (폴백은 사용되지 않습니다)
- 두 옵션 모두 없으면 기본 우선순위대로 자동 적용됩니다.

---

## 쿠키 스토리지 지원

생성자 옵션에서 `type: "cookie"`를 지정하면 동일한 API로 쿠키를 사용할 수 있습니다.

- 활용 예시: IndexedDB를/localStorage/sessionStorage 사용할 수 없는 환경에서의 폴백, 서버와 공유해야 하는 소규모 데이터 저장 등
- 참고:
  - 쿠키는 도메인당 약 4KB로 용량이 작고, 모든 HTTP 요청에 자동으로 서버로 전송됩니다.
  - 쿠키 전용 옵션 `path`, `domain`, `secure`, `sameSite`은 표준이지만 브라우저/플랫폼/HTTP/HTTPS 환경에 따라 세부 동작(쿠키 저장, 삭제, 전송, 접근 등)이 다를 수 있습니다.

**예시:**

```ts
const cookieStorage = stosh({ type: "cookie", namespace: "ck" });
await cookieStorage.set("foo", "bar");
console.log(await cookieStorage.get("foo")); // "bar"
await cookieStorage.remove("foo");

// 쿠키 옵션 사용
const advancedCookieStorage = stosh({
  type: "cookie",
  namespace: "advancedCk",
  path: "/app", // 이 인스턴스에서 생성되는 모든 쿠키의 기본 경로
  secure: true, // 기본 secure 플래그
});

// 기본 옵션으로 설정
advancedCookieStorage.setSync("user", "Alice");

// 특정 옵션으로 설정 (기본 경로 덮어쓰기, 만료 시간 추가)
advancedCookieStorage.setSync("session", "xyz", {
  path: "/", // 기본 경로 덮어쓰기
  expire: 1000 * 60 * 30, // 30분 만료
});

// 특정 경로로 삭제
advancedCookieStorage.removeSync("user", { path: "/app" });
```

---

## SSR(서버사이드 렌더링) 환경 지원

SSR(서버사이드 렌더링, 예: Next.js, Nuxt 등) 환경에서도 안전하게 import 및 인스턴스 생성이 가능합니다.

- SSR 환경(window가 없는 경우)에는 자동으로 메모리 스토리지를 사용하며, 브라우저 전용 이벤트 리스너는 등록하지 않습니다.
- `stosh.isSSR` 정적 속성으로 현재 환경이 SSR인지 코드에서 확인할 수 있습니다.

```ts
if (stosh.isSSR) {
  // 서버 환경(SSR)에서만 실행되는 코드
}
```

---

## 메모리 폴백(자동 대체) 기능

브라우저 스토리지(IndexedDB, localStorage, sessionStorage, cookie)를 사용할 수 없는 환경(예: SSR, 프라이빗 모드, 저장소 제한, 브라우저 미지원 등)에서 자동으로 메모리 스토리지로 전환되어 동작합니다. 이 경우, 데이터는 브라우저를 새로고침하거나 탭을 닫으면 사라집니다.

- 폴백이 발생했는지는 인스턴스의 `isMemoryFallback` 속성으로 확인할 수 있습니다.
- API 사용법은 동일하며, 별도의 예외처리 없이 안전하게 사용할 수 있습니다.

```ts
const storage = stosh();
if (storage.isMemoryFallback) {
  console.warn(
    "현재 환경에서는 메모리 스토리지를 사용합니다. 새로고침 시 데이터가 사라집니다."
  );
}
```

---

## 객체/배열 자동 직렬화/역직렬화

객체, 배열 등 비원시값을 저장할 때 자동으로 JSON.stringify/parse를 적용하므로 별도의 처리 없이 안전하게 데이터를 저장하고 불러올 수 있습니다.

---

## 커스텀 직렬화/역직렬화 예제

생성자 옵션으로 serialize/deserialize 함수를 지정할 수 있습니다. 이를 활용하면 JSON 이외의 포맷(예: 암호화, 압축 등)이나 외부 포맷을 자유롭게 사용할 수 있습니다.

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

## 일괄 처리(Batch) API 예제

`batchSet`, `batchSetSync`, `batchRemove`, `batchRemoveSync` 메서드는 두 번째 인자로 공통 옵션을 받을 수 있습니다.
`batchSet`, `batchSetSync` 메서드는 각 객체별로 개별 옵션(`options` 필드)을 지정할 수도 있습니다.
실제 동작 시, 각 객체의 개별 옵션과 공통 옵션이 병합되어 적용됩니다. (객체별 옵션이 우선, 공통 옵션은 기본값 역할)

```ts
const storage = stosh({ namespace: "batch" });
// 여러 값 한 번에 저장
await storage.batchSet([
  { key: "a", value: 1 },
  { key: "b", value: 2 },
  { key: "c", value: 3 },
]);

// 여러 값 한 번에 조회
console.log(await storage.batchGet(["a", "b", "c"])); // [1, 2, 3]

// 여러 값 한 번에 삭제
await storage.batchRemove(["a", "b"]);

// "a"는 expire, path, secure, "b"는 path, secure만 적용됨
await storage.batchSet(
  [
    { key: "a", value: 1, options: { expire: 1000 } },
    { key: "b", value: 2 },
  ],
  { path: "/app", secure: true }
);
```

---

## 타입 안전성

TypeScript 제네릭을 활용해 저장/조회 데이터의 타입을 안전하게 보장합니다.

```ts
const storage = stosh<{ name: string }>();
await storage.set("user", { name: "홍길동" });
const user = await storage.get("user"); // 타입: { name: string } | null
```

---

## 추가 활용 예제

### 동적 네임스페이스(다중 사용자 지원)

```ts
function getUserStorage(userId: string) {
  return stosh({ namespace: `user:${userId}` });
}
const user1Storage = getUserStorage("alice");
await user1Storage.set("profile", { name: "Alice" });
```

### 미들웨어로 데이터 검증/로깅

```ts
const storage = stosh({ namespace: "log" });

storage.use("set", async (ctx, next) => {
  if (typeof ctx.value !== "string") throw new Error("Only strings allowed!");
  await logToServer(ctx.key, ctx.value);
  await next();
});
await storage.set("greeting", "hello"); // 정상
// await storage.set('fail', 123); // 예외 발생
```

### 만료(expire)와 미들웨어 조합

```ts
const storage = stosh({ namespace: "expire" });
storage.use("set", async (ctx, next) => {
  // 모든 값에 1분 만료 자동 적용
  ctx.options = { ...ctx.options, expire: 60000 };
  await next();
});
await storage.set("temp", "data");
```

---

## API

- `stosh(options?: StoshOptions)`
  - `StoshOptions`: `type`, `priority`, `namespace`, `serialize`, `deserialize`, and _`Cookie Options`_ (`path`, `domain`, `secure`, `sameSite`)
- `set(key, value, options?: SetOptions): Promise<void>`
  - `SetOptions`: `expire` and _`Cookie Options`_
- `get<T>(key): Promise<T | null>`
- `remove(key, options?: RemoveOptions): Promise<void>`
  - `RemoveOptions`: _`Cookie Options`_
- `clear(): Promise<void>`
- `has(key): Promise<boolean>`
- `getAll(): Promise<Record<string, any>>`
- `setSync(key, value, options?: SetOptions): void`
- `getSync<T>(key): T | null`
- `removeSync(key, options?: RemoveOptions): void`
- `clearSync(): void`
- `hasSync(key): boolean`
- `getAllSync(): Record<string, any>`
- `batchSet(entries: { key: string; value: any, options?: SetOptions }[], options?: SetOptions): Promise<void>`
  - Applies `SetOptions` (like `expire`, cookie options) to all entries being set.
- `batchGet(keys: string[]): Promise<(any | null)[]>`
- `batchRemove(keys: string[], options?: RemoveOptions): Promise<void>`
  - Applies `RemoveOptions` (cookie options) to all keys being removed.
- `batchSetSync(entries: { key: string; value: any, options?: SetOptions }[], options?: SetOptions): void`
- `batchGetSync(keys: string[]): (any | null)[]`
- `batchRemoveSync(keys: string[], options?: RemoveOptions): void`
- `use(method: 'get' | 'set' | 'remove', middleware: Middleware)`
- `onChange(cb: (key: string | null, value: any | null) => void)`

전체 API 문서는 [API.ko.md](https://github.com/num2k/stosh/blob/main/documents/API.ko.md)에서 확인할 수 있습니다.

---

## 라이선스

MIT
