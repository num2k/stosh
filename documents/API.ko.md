# Stosh API Reference

---

## 1. StoshOptions 및 스토리지 종류/우선순위

- `type`: "idb" | "local" | "session" | "cookie" | "memory" (스토리지 종류, 기본값: "idb")
- `priority`: Array<"idb" | "local" | "session" | "cookie" | "memory"> (저장소 폴백 우선순위)
- `namespace`: string (네임스페이스 접두사)
- `serialize`/`deserialize`: 커스텀 직렬화/역직렬화 함수

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
})
```

---

## 3. 주요 메서드 및 예시

### set / setSync

- `set(key, value, options?)`: Promise<void> (비동기)
- `setSync(key, value, options?)`: void (동기)
- options.expire(ms)로 만료 지정 가능

```ts
await storage.set("user", { name: "홍길동" }, { expire: 60000 });
storage.setSync("user", { name: "홍길동" }, { expire: 60000 });
```

### get / getSync

- `get<T>(key)`: Promise<T | null> (비동기)
- `getSync<T>(key)`: T | null (동기)

```ts
const user = await storage.get<{ name: string }>("user");
const userSync = storage.getSync<{ name: string }>("user");
```

### remove / removeSync

- `remove(key)`: Promise<void> (비동기)
- `removeSync(key)`: void (동기)

### clear / clearSync

- `clear()`: Promise<void> (비동기)
- `clearSync()`: void (동기)

### has / hasSync

- `has(key)`: Promise<boolean> (비동기)
- `hasSync(key)`: boolean (동기)

### getAll / getAllSync

- `getAll()`: Promise<Record<string, any>> (비동기)
- `getAllSync()`: Record<string, any> (동기)

---

## 4. 일괄 처리(Batch) API

### batchSet / batchSetSync

- `batchSet(entries: {key, value, options?}[]): Promise<void>` (비동기)
- `batchSetSync(entries: {key, value, options?}[]): void` (동기)

### batchGet / batchGetSync

- 입력한 keys 배열의 순서대로 결과 배열이 반환됩니다.
- `batchGet(keys: string[]): Promise<any[]>` (비동기)
- `batchGetSync(keys: string[]): any[]` (동기)

### batchRemove / batchRemoveSync

- `batchRemove(keys: string[]): Promise<void>` (비동기)
- `batchRemoveSync(keys: string[]): void` (동기)

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

## 6. 미들웨어 및 이벤트

### use(method, middleware)

- set/get/remove 동작에 미들웨어 추가
- 동기/비동기 미들웨어 모두 지원

```ts
storage.use("set", async (ctx, next) => {
  ctx.value = await encryptAsync(ctx.value);
  await next();
});
```

### onChange(callback)

- 현재 인스턴스에서 set/remove/clear 등으로 값이 변경될 때 콜백 실행 (모든 스토리지타입 해당)
- 다른 탭/윈도우에서는 localStorage/sessionStorage 값이 변경될 때 콜백이 실행 (IndexedDB, Cookie 변경은 다른 탭으로 전달되지 않음)
- 동기/비동기 콜백 모두 지원

```ts
storage.onChange(async (key, value) => {
  await syncToServer(key, value);
});
```

---

## 7. 고급 기능 및 예시

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

## 8. 환경별 동작 및 주의사항

- 브라우저 환경에서만 `idb`/`local`/`session`/`cookie` 스토리지 사용 가능
- SSR/Node.js 환경에서는 항상 메모리 스토리지 사용
- 쿠키는 도메인당 약 4KB 용량 제한이 있으며, 동일 도메인 요청 시 서버로 자동 전송됨
- 메모리 스토리지는 새로고침/탭 닫기 시 데이터 소실
- 네임스페이스 미지정 혹은 중복 시 데이터 충돌(겹침) 가능
- 스토리지 용량 초과 시 `set`에서 예외 발생 (예: localStorage의 `QuotaExceededError`)
- 직렬화/역직렬화/미들웨어 오류 발생 시 해당 작업이 중단되고 예외가 발생할 수 있음
- `onChange` 콜백은 다른 탭/윈도우에서의 변경 감지를 위해 브라우저의 storage 이벤트를 사용하므로, localStorage/sessionStorage 변경 시에만 다른 탭으로 전파됨 (IndexedDB, Cookie는 전파되지 않음)

---

## 9. 대표 에러 케이스

- localStorage가 가득 찼을 때: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- JSON 직렬화 불가 객체 저장 시: `TypeError: Converting circular structure to JSON`
- 커스텀 직렬화/역직렬화 함수 오류: `SyntaxError: Unexpected token ...` (파싱 실패 등)
- 브라우저가 아닌 환경에서 접근 시: `ReferenceError: window is not defined`
