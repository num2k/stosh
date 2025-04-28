# Stosh API Reference

---

## 1. StoshOptions 및 스토리지 종류/우선순위

- `type`: "idb" | "local" | "session" | "cookie" | "memory" (스토리지 종류, 기본값: "idb")
- `priority`: Array<"idb" | "local" | "session" | "cookie" | "memory"> (저장소 폴백 우선순위)
- `namespace`: string (네임스페이스 접두사)
- `serialize`/`deserialize`: 커스텀 직렬화/역직렬화 함수
- `strictSyncFallback`: boolean (동기 API 사용 정책, 기본값: false)
  - IndexedDB(`idb`)가 기본 스토리지일 때만 동작
- **쿠키 전용 옵션 (`StoshOptions`에 상속됨):**
  - `path`: string (쿠키 경로, 기본값: "/")
  - `domain`: string (쿠키 도메인)
  - `secure`: boolean (쿠키 secure 플래그)
  - `sameSite`: "Strict" | "Lax" | "None" (쿠키 SameSite 속성)

### 스토리지 종류

- **idb**: IndexedDB (비동기, 대용량, 권장)
- **local**: localStorage (도메인별 영구 저장)
- **session**: sessionStorage (탭/세션별 저장)
- **cookie**: document.cookie (도메인별, 서버로 전송, 약 4KB 제한)
- **memory**: 메모리 폴백(임시, 새로고침 시 소실)

### 저장소 폴백 우선순위

- 기본: `["idb", "local", "session", "cookie", "memory"]` 순서로 시도
- `priority` 옵션으로 우선순위 지정 가능
- SSR(서버사이드) 환경에서는 항상 메모리 스토리지 사용

**예시:**

```ts
const storage = stosh({
  priority: ["idb", "local", "session", "cookie", "memory"],
  namespace: "fb",
});
```

### 쿠키/메모리/SSR 환경 주의사항

- 쿠키: 브라우저에서만 동작, 4KB 제한, 모든 HTTP 요청에 서버로 전송, SSR/Node.js에서는 자동 메모리 폴백
- 메모리: 새로고침/탭 닫기 시 데이터 소실, SSR/Node.js에서는 항상 사용
- SSR: window가 undefined이면 무조건 메모리 스토리지 사용

---

## 2. 생성자 및 API 시그니처

```ts
stosh(options?: {
  type?: "idb" | "local" | "session" | "cookie" | "memory";
  priority?: Array<"idb" | "local" | "session" | "cookie" | "memory">;
  namespace?: string;
  serialize?: (data: any) => string;
  deserialize?: (raw: string) => any;
  /**
   * IndexedDB가 primary storage일 때 동기 API(setSync 등) 사용 시 에러를 throw할지 여부
   * true면 에러 발생, false면 fallback storage로 동작 (경고만 출력)
   * @default false
   */
  strictSyncFallback?: boolean;
  // 쿠키 전용 옵션
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
})
```

---

## 3. 주요 메서드 및 예시

### set / setSync

- `set(key, value, options?: SetOptions)`: Promise<void> (비동기)
- `setSync(key, value, options?: SetOptions)`: void (동기)
- `SetOptions` 포함 내용:
  - `expire`: number (만료 시간 밀리초)
  - `path`, `domain`, `secure`, `sameSite`: 쿠키 관련 옵션

```ts
await storage.set("user", { name: "홍길동" }, { expire: 60000 });
storage.setSync("user", { name: "홍길동" }, { expire: 60000 });

// 쿠키 옵션 포함
await storage.set("user", { name: "홍길동" }, { expire: 60000, path: "/" });
storage.setSync("user", { name: "홍길동" }, { expire: 60000, secure: true });
```

### get / getSync

- `get<T>(key)`: Promise<T | null> (비동기)
- `getSync<T>(key)`: T | null (동기)

```ts
const user = await storage.get<{ name: string }>("user");
const userSync = storage.getSync<{ name: string }>("user");
```

### remove / removeSync

- 지정된 키-값 쌍을 스토리지에서 제거
- `remove(key, options?: RemoveOptions)`: Promise<void> (비동기)
- `removeSync(key, options?: RemoveOptions)`: void (동기)
- `RemoveOptions` 포함 내용:
  - `path`, `domain`, `secure`, `sameSite`: 쿠키 관련 옵션

```ts
await storage.remove("user");

// 쿠키 옵션 포함
await storage.remove("user", { path: "/" });
storage.removeSync("user", { domain: ".example.com" });
```

### clear / clearSync

- 현재 네임스페이스 내의 모든 키-값 쌍을 스토리지에서 제거
- `clear()`: Promise<void> (비동기)
- `clearSync()`: void (동기)

### has / hasSync

- `has(key)`: Promise<boolean> (비동기)
- `hasSync(key)`: boolean (동기)

### getAll / getAllSync

- `getAll()`: Promise<Record<string, T>> (비동기)
- `getAllSync()`: Record<string, T> (동기)

---

## 4. 일괄 처리(Batch) API

### batchSet / batchSetSync

- 두 번째 인자로 공통 옵션을 받을 수 있으며 각 객체별로 개별 옵션(`options` 필드)을 지정 가능
- 실제 동작 시 각 객체의 개별 옵션과 공통 옵션이 병합되어 적용 (객체별 옵션이 우선, 공통 옵션은 기본값 역할)
- `batchSet(entries: { key: string; value: any, options?: SetOptions }[], options?: SetOptions)`: Promise<void> (비동기)
- `batchSetSync(entries: { key: string; value: any, options?: SetOptions }[], options?: SetOptions)`: void (동기)

```ts
await storage.batchSet(
  [
    { key: "a", value: 1 },
    { key: "b", value: 2 },
  ],
  { expire: 3600000 }
);

// "a"는 expire+path+secure, "b"는 path+secure만 적용됨
await storage.batchSet(
  [
    { key: "a", value: 1, options: { expire: 1000 } },
    { key: "b", value: 2 },
  ],
  { path: "/app", secure: true }
);
```

### batchGet / batchGetSync

- 여러 값을 한 번에 조회. 결과 배열은 입력한 keys 배열의 순서를 유지. 찾을 수 없거나 만료된 키에 대해서는 `null`을 반환
- `batchGet<U = T>(keys: string[])`: Promise<(U | null)[]> (비동기)
- `batchGetSync<U = T>(keys: string[])`: (U | null)[] (동기)

```ts
const values = await storage.batchGet(["a", "b", "c"]); // [1, 2, null]
```

### batchRemove / batchRemoveSync

- 여러 키를 한 번에 삭제. 전달된 `RemoveOptions`(공통 옵션)을 삭제되는 모든 키에 일괄 적용
- `batchRemove(keys: string[], options?: RemoveOptions)`: Promise<void> (비동기)
- `batchRemoveSync(keys: string[], options?: RemoveOptions)`: void (동기)

```ts
storage.batchRemove(["a", "b"]);

// 여러 키를 동일한 쿠키 경로로 삭제
await storage.batchRemove(["a", "b"], { path: "/app" });
storage.batchRemoveSync(["c", "d"], { path: "/app" });

// path: "/app" 경로와 secure 플래그가 모두 일치하는 쿠키만 삭제
await storage.batchRemove(["a", "b", "c"], { path: "/app", secure: true });
```

---

## 5. 주요 속성: isMemoryFallback, isSSR

- `isMemoryFallback`: 인스턴스가 실제로 메모리 스토리지(임시 저장소)로 폴백되었는지 여부 (true면 폴백)
- `stosh.isSSR`: static 속성, SSR(서버사이드) 환경(window가 undefined)인지 여부

```ts
const storage = stosh();
if (storage.isMemoryFallback) {
  console.warn(
    "현재 메모리 스토리지를 사용 중입니다. 새로고침 시 데이터가 사라집니다."
  );
}
if (stosh.isSSR) {
  // SSR 환경에서만 실행되는 코드
}
```

---

## 6. 미들웨어 시스템

### use(method, middleware)

- `use(method: 'get' | 'set' | 'remove', middleware, options?)`
  - `middleware`:  
    - 동기: `(ctx: MiddlewareContext, next: () => void) => void`  
    - 비동기: `(ctx: MiddlewareContext, next: () => Promise<void> | void) => Promise<void> | void`
  - `options?`: `{ prepend?: boolean; append?: boolean // default: true }`  
- 반환값: 해제 함수(unsubscribe)

__미들웨어 생성__

```ts
const storage = stosh({ type: "local" });

const logger = (ctx, next) => {
  console.log("set 호출", ctx);
  next();
};

storage.use("set", logger);
```

__use() 옵션__

- `prepend: true` — 미들웨어 체인의 맨 앞에 추가
- `append: true` — (기본값) 미들웨어 체인의 맨 뒤에 추가

```ts
storage.use("set", logger, { prepend: true });
```

_미들웨어 실행 순서 비교_

```ts
const storage = stosh({ type: "local" });

const mwA = (ctx, next) => { ctx.value += "_A"; next(); };
const mwB = (ctx, next) => { ctx.value += "_B"; next(); };

// append(기본값)로 등록: 등록 순서대로 실행됨
storage.use("set", mwA); // 1번째
storage.use("set", mwB); // 2번째

storage.setSync("foo", "start");
// 실행 순서: mwA → mwB
// 결과: "start_A_B"
console.log(storage.getSync("foo")); // "start_A_B"

// prepend로 등록: 맨 앞에 추가됨
const mwC = (ctx, next) => { ctx.value += "_C"; next(); };
storage.use("set", mwC, { prepend: true }); // 항상 체인 맨 앞

storage.setSync("bar", "start");
// 실행 순서: mwC → mwA → mwB
// 결과: "start_C_A_B"
console.log(storage.getSync("bar")); // "start_C_A_B"
```

- `append: true`는 기본값이지만, 동적으로 미들웨어를 추가할 때 "맨 뒤에 추가"를 명확히 의도하고 싶을 때 명시적으로 사용할 수 있습니다.

  ```ts
  // 항상 마지막에 실행해야 하는 로깅 미들웨어 추가
  storage.use("set", logger, { append: true });
  ```

__중복 등록 정책__

- 동일한 함수 레퍼런스(예: 같은 변수에 담긴 함수)는 중복 등록이 방지됨
  - 이미 등록된 함수와 같은 레퍼런스를 다시 등록하면 경고만 출력되고, 실제로는 추가되지 않음

  ```ts
  const mw = (ctx, next) => next();
  storage.use("set", mw);
  storage.use("set", mw); // 두 번째 등록은 무시됨
  ```

- __다른 함수(새로 선언된 함수)__ 는 내용이 같아도 중복 등록 허용

  ```ts
  storage.use("set", (ctx, next) => next());
  storage.use("set", (ctx, next) => next()); // 둘 다 등록됨
  ```

__해제(등록 취소) 방법__

- `use` 메서드는 해제 함수(unsubscribe)를 반환
- 해제 함수를 호출하면 해당 미들웨어가 체인에서 제거됨

```ts
const mw = (ctx, next) => next();
const unsub = storage.use("set", mw);
unsub(); // mw 미들웨어 해제
```

__예외 및 주의사항__

- 미들웨어 내에서 `next()`를 호출하지 않으면, 이후 체인이 실행되지 않음
- 미들웨어는 동기/비동기 모두 지원하지만, 동기 메서드(setSync 등)에는 동기 미들웨어만 사용
- 잘못된 직렬화/역직렬화 등에서 예외가 발생하면, 콘솔에 에러가 출력되고 해당 동작은 무시됨

__isSync 속성__

`MiddlewareContext`에 포함된 `isSync`는 현재 동작이 동기 API에서 호출된 것인지, 비동기 API에서 호출된 것인지를 구분할 수 있는 플래그임

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
    // 동기 API에서만 실행할 로직
    console.log("Sync set middleware");
  } else {
    // 비동기 API에서만 실행할 로직
    console.log("Async set middleware");
  }
  await next();
});
```

---

## 7. onChange(callback)

- 현재 인스턴스에서 set/remove/clear 등으로 값이 변경될 때 콜백 실행 (모든 스토리지타입 해당)
- **`clear`/`clearSync` 관련 참고**: 이 메서드들은 내부적으로 삭제되는 각 키에 대해 개별적인 `remove` 이벤트를 발생시킴. 따라서 `clear` 또는 `clearSync` 호출 시, 단일 'clear' 이벤트가 아니라 각 키마다 한 번씩, 즉 여러 번 `onChange` 콜백이 실행 됨
- 다른 탭/윈도우에서는 localStorage/sessionStorage 값이 변경될 때 콜백이 실행 (IndexedDB, Cookie 변경은 다른 탭으로 전달되지 않음)
- 동기/비동기 콜백 모두 지원
- 여러 콜백을 등록할 수 있으며 각각 해제 가능

```ts
storage.onChange(async (key, value) => {
  await syncToServer(key, value);
});

// 여러 개 등록 가능
const unsub1 = storage.onChange((key, value) => {});
const unsub2 = storage.onChange((key, value) => {});

// 각각 해제 가능
unsub1();
unsub2();
```

---

## 8. 고급 기능 및 예시

### 타입 안전성

```ts
const storage = stosh<{ name: string }>();
await storage.set("user", { name: "홍길동" });
const user = await storage.get("user"); // 타입: { name: string } | null
```

### 네임스페이스 분리

```ts
const userStorage = stosh({ namespace: "user" });
const cacheStorage = stosh({ namespace: "cache" });
userStorage.set("profile", { name: "홍길동" });
cacheStorage.set("temp", 123);
```

### 커스텀 직렬화/역직렬화

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

### 만료(expire)

```ts
await storage.set("temp", "임시값", { expire: 5000 });
setTimeout(async () => {
  console.log(await storage.get("temp")); // 5초 후 null
}, 6000);
```

---

## 9. 환경별 동작 및 주의사항

- 모든 비동기 메서드(`set`, `get`, `remove`, `clear` 등)는 반드시 `try/catch` 또는 `.then().catch()`로 예외를 처리해야 함
- 동기 메서드(`setSync`, `getSync` 등)는 `try/catch`로 감싸서 예외를 처리해야 함
- 브라우저 환경에서만 `idb`/`local`/`session`/`cookie` 스토리지 사용 가능
- SSR/Node.js 환경에서는 항상 메모리 스토리지 사용
- 쿠키는 도메인당 약 4KB 용량 제한이 있으며, 동일 도메인 요청 시 서버로 자동 전송됨. `path`, `domain`, `secure`, `sameSite` 옵션으로 세부 제어 가능
- 쿠키 전용 옵션 `path`, `domain`, `secure`, `sameSite`은 표준이지만 브라우저/플랫폼/HTTP/HTTPS 환경에 따라 세부 동작(쿠키 저장, 삭제, 전송, 접근 등)이 다를 수 있음
- 메모리 스토리지는 새로고침/탭 닫기 시 데이터 소실
- 네임스페이스 미지정 혹은 중복 시 데이터 충돌(겹침) 가능
- 스토리지 용량 초과 시 `set`에서 예외 발생 (예: localStorage의 `QuotaExceededError`)
- 직렬화/역직렬화/미들웨어 오류 발생 시 해당 작업이 중단되고 예외가 발생할 수 있음
- `onChange` 콜백은 다른 탭/윈도우에서의 변경 감지를 위해 브라우저의 storage 이벤트를 사용하므로, localStorage/sessionStorage 변경 시에만 다른 탭으로 전파됨 (IndexedDB, Cookie는 전파되지 않음)
- `onChange` 콜백에서 비동기 작업을 할 경우, 내부 예외는 전체 동작에 영향을 주지 않으나 콜백 내에서 직접 예외를 처리하는 것이 안전함

---

## 10. 대표 에러 케이스

- localStorage가 가득 찼을 때: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- JSON 직렬화 불가 객체 저장 시: `TypeError: Converting circular structure to JSON`
- 커스텀 직렬화/역직렬화 함수 오류: `SyntaxError: Unexpected token ...` (파싱 실패 등)
- 브라우저가 아닌 환경에서 접근 시: `ReferenceError: window is not defined`
