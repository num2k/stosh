# Stosh API Reference

---

## 1. StoshOptions 및 스토리지 종류/우선순위

- `type`: "local" | "session" | "cookie" (스토리지 종류, 기본값: "local")
- `priority`: Array<"local" | "session" | "cookie" | "memory"> (저장소 풀백 우선순위)
- `namespace`: string (네임스페이스 접두사)
- `serialize`/`deserialize`: 커스텀 직렬화/역직렬화 함수

### 스토리지 종류

- **local**: localStorage (도메인별 영구 저장)
- **session**: sessionStorage (탭/세션별 저장)
- **cookie**: document.cookie (도메인별, 서버로 전송, 약 4KB 제한)
- **memory**: 메모리 폴백(임시, 새로고침 시 소실)

### 저장소 풀백 우선순위

- 기본: ["local", "session", "cookie", "memory"] 순서로 시도
- `priority` 옵션으로 우선순위 지정 가능
- SSR(서버사이드) 환경에서는 항상 메모리 스토리지 사용

**예시:**

```ts
const storage = new Stosh({
  priority: ["local", "session", "cookie", "memory"],
  namespace: "fb",
});
```

### 쿠키/메모리/SSR 환경 주의사항

- 쿠키: 브라우저에서만 동작, 4KB 제한, 모든 HTTP 요청에 서버로 전송, SSR/Node.js에서는 자동 메모리 폴백
- 메모리: 새로고침/탭 닫기 시 데이터 소실, SSR/Node.js에서는 항상 사용
- SSR: window가 없으면 무조건 메모리 스토리지 사용

---

## 2. 생성자 및 API 시그니처

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

## 3. 주요 메서드 및 예시

### set(key, value, options?)

- 값 저장, options.expire(ms)로 만료 지정 가능

```ts
storage.set("user", { name: "홍길동" }, { expire: 60000 });
```

### get<T>(key): T | null

- 값 조회, 만료 시 null 반환

```ts
const user = storage.get<{ name: string }>("user");
```

### remove(key)

- 값 삭제

### clear()

- 네임스페이스 내 전체 값 삭제

### has(key): boolean

- 키 존재 여부 반환

### getAll(): Record<string, any>

- 네임스페이스 내 모든 값 반환

---

## 4. 주요 속성: isMemoryFallback, isSSR

- `isMemoryFallback`: 인스턴스가 실제로 메모리 스토리지(임시 저장소)로 폴백되었는지 여부를 나타내는 속성입니다.
  - true면 현재 환경에서 local/session/cookie 스토리지를 사용할 수 없어 메모리 스토리지를 사용 중임을 의미합니다.
  - 예시:
    ```ts
    const storage = new Stosh();
    if (storage.isMemoryFallback) {
      console.warn(
        "현재 메모리 스토리지를 사용 중입니다. 새로고침 시 데이터가 사라집니다."
      );
    }
    ```
- `Stosh.isSSR`: 현재 환경이 SSR(서버사이드)인지 여부를 반환하는 static 속성입니다.
  - window가 undefined인 경우 true를 반환합니다.
  - 예시:
    ```ts
    if (Stosh.isSSR) {
      // 서버 환경(SSR)에서만 실행되는 코드
    }
    ```

---

## 5. 미들웨어 및 이벤트

### use(method, middleware)

- set/get/remove 동작에 미들웨어 추가

```ts
storage.use("set", (ctx, next) => {
  ctx.value = encrypt(ctx.value);
  next();
});
```

### onChange(callback)

- 다른 탭/윈도우에서 값 변경 시 콜백 실행

```ts
storage.onChange((key, value) => {
  console.log(key, value);
});
```

---

## 6. 일괄 처리(Batch) API

### batchSet(entries: {key, value, options?}[])

- 여러 값 한 번에 저장

### batchGet(keys: string[]): any[]

- 여러 값 한 번에 조회

### batchRemove(keys: string[])

- 여러 값 한 번에 삭제

---

## 7. 고급 기능 및 예시

### 타입 안전성

```ts
const storage = new Stosh<{ name: string }>();
storage.set("user", { name: "홍길동" });
const user = storage.get("user"); // 타입: { name: string } | null
```

### 네임스페이스 분리

```ts
const userStorage = new Stosh({ namespace: "user" });
const cacheStorage = new Stosh({ namespace: "cache" });
userStorage.set("profile", { name: "홍길동" });
cacheStorage.set("temp", 123);
```

### 커스텀 직렬화/역직렬화

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

### 만료(expire)

```ts
storage.set("temp", "임시값", { expire: 5000 });
setTimeout(() => {
  console.log(storage.get("temp")); // 5초 후 null
}, 6000);
```

---

## 8. 환경별 동작 및 주의사항

- 브라우저 환경에서만 local/session/cookie 스토리지 사용 가능
- SSR/Node.js 환경에서는 항상 메모리 스토리지 사용
- 쿠키는 4KB 제한, 서버로 자동 전송
- 메모리 스토리지는 새로고침/탭 닫기 시 데이터 소실
- 네임스페이스 중복 시 데이터 겹침 가능
- 스토리지 용량 초과 시 set에서 예외 발생
- 직렬화/역직렬화 오류, 미들웨어 예외 등은 전체 동작 중단 가능
- onChange는 같은 탭 내에서는 동작하지 않음(다른 탭/윈도우에서만 동작)

---

## 9. 대표 에러 케이스

- localStorage가 가득 찼을 때: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- JSON 직렬화 불가 객체 저장 시: `TypeError: Converting circular structure to JSON`
- 커스텀 직렬화/역직렬화 함수 오류: `SyntaxError: Unexpected token ...` (파싱 실패 등)
- 브라우저가 아닌 환경에서 접근 시: `ReferenceError: window is not defined`
