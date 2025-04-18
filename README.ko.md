# stosh

미들웨어 기반 브라우저 스토리지 래퍼

stosh는 localStorage, sessionStorage, cookie를 브라우저에서 안전하고 확장성 있게 사용할 수 있도록 공통 인터페이스를 제공하는 TypeScript 라이브러리입니다.

---

## 주요 특징

- localStorage/sessionStorage/cookie 공통 인터페이스 제공
- 네임스페이스(접두사)로 데이터 격리 및 관리
- set 시 만료(expire) 옵션 지원, 만료 데이터 자동 삭제
- 미들웨어 패턴 지원: set/get/remove 동작에 자유롭게 기능 추가 가능
- 타입 안전성(TypeScript 제네릭)
- storage 이벤트 구독(onChange) 지원: 다른 탭/윈도우에서 값 변경 시 콜백 실행
- 커스텀 직렬화/역직렬화 지원(암호화, 압축 등 다양한 포맷 사용 가능)
- 일괄 처리(Batch) API 지원: 여러 키/값을 한 번에 저장·조회·삭제
- 외부 의존성 없음
- 크로스 브라우저(Chrome, Edge, Firefox, Safari 등) 지원

---

## 설치

```
npm install stosh
```

---

## 기본 사용법

```ts
import { Stosh } from "stosh";

const storage = new Stosh({ type: "local", namespace: "myApp" });

// 값 저장/조회/삭제
storage.set("user", { name: "홍길동" }, { expire: 1000 * 60 * 10 });
const user = storage.get<{ name: string }>("user");
storage.remove("user");
storage.clear();

// 키 존재 여부
if (storage.has("user")) {
  // ...
}

// 네임스페이스 내 전체 값 조회
const all = storage.getAll();
```

---

## 만료(expire) 옵션 사용 예시

```ts
// 5초 후 만료되는 값 저장
storage.set("temp", "임시값", { expire: 5000 });
setTimeout(() => {
  console.log(storage.get("temp")); // 5초 후에는 null 반환
}, 6000);
```

---

## 미들웨어 활용 예시

```ts
// set 시 값 암호화
storage.use("set", (ctx, next) => {
  ctx.value = encrypt(ctx.value);
  next();
});

// get 시 값 복호화
storage.use("get", (ctx, next) => {
  next();
  if (ctx.result) ctx.result = decrypt(ctx.result);
});
```

---

## 여러 인스턴스/네임스페이스 분리 예시

```ts
const userStorage = new Stosh({ namespace: "user" });
const cacheStorage = new Stosh({ namespace: "cache", type: "session" });

userStorage.set("profile", { name: "홍길동" });
cacheStorage.set("temp", 123);
```

---

## storage 이벤트 구독 예시

```ts
const storage = new Stosh({ namespace: "sync" });
storage.onChange((key, value) => {
  // 다른 탭에서 변경된 값을 실시간 반영
  console.log("스토리지 변경:", key, value);
});
```

---

## 메모리 폴백(자동 대체) 기능

localStorage나 sessionStorage를 사용할 수 없는 환경(예: 프라이빗 모드, 저장소 제한, 브라우저 미지원 등)에서 자동으로 메모리 스토리지로 전환되어 동작합니다. 이 경우, 데이터는 브라우저를 새로고침하거나 탭을 닫으면 사라집니다.

- 폴백이 발생했는지는 인스턴스의 `isMemoryFallback` 속성으로 확인할 수 있습니다.
- API 사용법은 동일하며, 별도의 예외처리 없이 안전하게 사용할 수 있습니다.

```ts
const storage = new Stosh();
if (storage.isMemoryFallback) {
  console.warn(
    "현재 환경에서는 메모리 스토리지를 사용합니다. 새로고침 시 데이터가 사라집니다."
  );
}
```

---

## 저장소 풀백 우선순위(priority) 체계

여러 저장소를 우선순위대로 시도하여, 사용 가능한 첫 번째 저장소를 자동으로 선택합니다. 기본 우선순위는 `["local", "session", "cookie", "memory"]`이며, 생성자 옵션의 `priority`로 직접 지정할 수 있습니다.

- 예시: localStorage가 불가하면 sessionStorage, 그다음 cookie, 마지막으로 memory 순으로 자동 폴백
- 활용: 다양한 브라우저 환경, 프라이빗 모드, 제한 환경 등에서 일관된 API로 안전하게 데이터 저장

**사용 예시:**

```ts
import { Stosh } from "stosh";

// localStorage → sessionStorage → cookie → memory 순으로 시도
const storage = new Stosh({
  priority: ["local", "session", "cookie", "memory"],
  namespace: "fb",
});

storage.set("foo", "bar");
console.log(storage.get("foo"));
```

---

## SSR(서버사이드 렌더링) 환경 지원

SSR(서버사이드 렌더링, 예: Next.js, Nuxt 등) 환경에서도 안전하게 import 및 인스턴스 생성이 가능합니다.

- SSR 환경(window가 없는 경우)에는 자동으로 메모리 스토리지를 사용하며, 브라우저 전용 이벤트 리스너는 등록하지 않습니다.
- `Stosh.isSSR` 정적 속성으로 현재 환경이 SSR인지 코드에서 확인할 수 있습니다.
- 브라우저 환경에서만 localStorage/sessionStorage가 실제로 동작합니다.

```ts
import { Stosh } from "stosh";

if (Stosh.isSSR) {
  // 서버 환경(SSR)에서만 실행되는 코드
}

const storage = new Stosh();
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

## 커스텀 직렬화/역직렬화 예제 (예: 암호화)

생성자 옵션으로 serialize/deserialize 함수를 지정할 수 있습니다. 이를 활용하면 JSON 이외의 포맷(예: 암호화, 압축 등)이나 외부 포맷을 자유롭게 사용할 수 있습니다.

```ts
// base64로 직렬화/역직렬화 예시
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

## 일괄 처리(Batch) API 예제

batchSet, batchGet, batchRemove 메서드로 여러 키/값을 한 번에 저장·조회·삭제할 수 있어 대량 데이터 처리나 초기화에 매우 유용합니다.

```ts
const storage = new Stosh({ namespace: "batch" });
// 여러 값 한 번에 저장
storage.batchSet([
  { key: "a", value: 1 },
  { key: "b", value: 2 },
  { key: "c", value: 3 },
]);
// 여러 값 한 번에 조회
console.log(storage.batchGet(["a", "b", "c"])); // [1, 2, 3]
// 여러 값 한 번에 삭제
storage.batchRemove(["a", "b"]);
```

---

## 스토리지 타입 선택

Stosh 생성자 옵션(type)으로 localStorage와 sessionStorage 중 원하는 스토리지를 선택할 수 있습니다.

---

## 쿠키 스토리지 지원

생성자 옵션에서 `type: "cookie"`를 지정하면 동일한 API(`set`, `get`, `remove`, `clear` 등)로 쿠키를 사용할 수 있습니다.

- 활용 예시: localStorage/sessionStorage를 사용할 수 없는 환경에서의 폴백, 서버와 공유해야 하는 소규모 데이터 저장 등
- 참고: 쿠키는 도메인당 약 4KB로 용량이 작고, 모든 HTTP 요청에 자동으로 서버로 전송됩니다.

**예시:**

```ts
import { Stosh } from "stosh";

const cookieStorage = new Stosh({ type: "cookie", namespace: "ck" });
cookieStorage.set("foo", "bar");
console.log(cookieStorage.get("foo")); // "bar"
cookieStorage.remove("foo");
```

---

## 타입 안전성

TypeScript 제네릭을 활용해 저장/조회 데이터의 타입을 안전하게 보장합니다.

```ts
const storage = new Stosh<{ name: string }>();
storage.set("user", { name: "홍길동" });
const user = storage.get("user"); // 타입: { name: string } | null
```

---

## 추가 활용 예제

### 동적 네임스페이스(다중 사용자 지원)

```ts
// 사용자별로 네임스페이스를 동적으로 할당
function getUserStorage(userId: string) {
  return new Stosh({ namespace: `user:${userId}` });
}
const user1Storage = getUserStorage("alice");
user1Storage.set("profile", { name: "Alice" });
```

### 미들웨어로 데이터 검증/로깅

```ts
const storage = new Stosh({ namespace: "log" });
storage.use("set", (ctx, next) => {
  if (typeof ctx.value !== "string") throw new Error("Only strings allowed!");
  console.log("Saving:", ctx.key, ctx.value);
  next();
});
storage.set("greeting", "hello"); // 정상
// storage.set('fail', 123); // 예외 발생
```

### 세션 스토리지와 로컬 스토리지 동시 활용

```ts
const local = new Stosh({ type: "local", namespace: "local" });
const session = new Stosh({ type: "session", namespace: "session" });
local.set("foo", 1);
session.set("bar", 2);
```

### 만료(expire)와 미들웨어 조합

```ts
const storage = new Stosh({ namespace: "expire" });
storage.use("set", (ctx, next) => {
  // 모든 값에 1분 만료 자동 적용
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

전체 API 문서는 [API.ko.md](https://github.com/num2k/stosh/blob/main/documents/API.ko.md)에서 확인할 수 있습니다.

---

## 라이선스

MIT
