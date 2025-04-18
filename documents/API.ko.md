# Stosh API Reference

---

## 생성자

```typescript
new Stosh(options?: {
  type?: 'local' | 'session';      // 사용할 스토리지 종류 (기본값: 'local')
  namespace?: string;              // 네임스페이스(접두사)로 데이터 격리
  serialize?: (data: any) => string;   // 커스텀 직렬화 함수
  deserialize?: (raw: string) => any;  // 커스텀 역직렬화 함수
})
```

- `type`: 'local'이면 localStorage, 'session'이면 sessionStorage 사용
- `namespace`: 네임스페이스별로 데이터가 완전히 분리됨
- `serialize`/`deserialize`: JSON 이외의 포맷(암호화, 압축 등)도 자유롭게 적용 가능

---

## 주요 메서드

### set(key, value, options?)

- 지정한 key에 value를 저장
- options.expire(ms)로 만료 시간(밀리초) 지정 가능
- 예시: `storage.set('user', {name: '홍길동'}, {expire: 60000})`

---

## set(key, value, options?) 내부 동작 및 활용법

- 내부적으로 value와 만료(expire) 정보를 객체로 감싸 직렬화하여 저장합니다.
- 만료 옵션이 있으면 현재 시각 + expire(ms)를 e 필드에 저장합니다.
- 미들웨어가 등록되어 있으면 set 미들웨어 체인을 먼저 실행한 뒤 실제 저장이 이뤄집니다.
- 활용: 만료, 암호화, 로깅, 데이터 정제 등 다양한 미들웨어와 조합 가능

---

### get<T>(key): T | null

- key에 저장된 값을 반환 (만료된 값은 null)
- 타입 제네릭으로 타입 안전하게 사용 가능
- 예시: `const user = storage.get<{name: string}>('user')`

---

## get<T>(key) 내부 동작 및 활용법

- 저장된 값을 역직렬화 후, 만료(e 필드)가 있으면 현재 시각과 비교해 만료 여부를 판단합니다.
- 만료된 값은 자동 삭제 후 null 반환, 유효하면 value(v 필드)만 반환합니다.
- get 미들웨어가 등록되어 있으면 미들웨어 체인을 거쳐 최종 결과가 반환됩니다.
- 활용: 복호화, 타입 변환, 접근 로깅 등 다양한 후처리 가능

---

### remove(key)

- key에 해당하는 값을 삭제

### clear()

- 현재 네임스페이스에 저장된 모든 값을 삭제

### has(key): boolean

- key가 존재하는지 여부 반환

### getAll(): Record<string, any>

- 네임스페이스 내 모든 key-value 쌍을 객체로 반환

---

## 미들웨어 및 이벤트

### use(method, middleware)

- set/get/remove 동작에 미들웨어(가로채기 함수)를 추가
- 예시:
  ```ts
  storage.use("set", (ctx, next) => {
    ctx.value = encrypt(ctx.value);
    next();
  });
  ```
- 미들웨어 시그니처:
  ```ts
  (ctx: { key: string; value?: any; options?: any; result?: any }, next: () => void) => void
  ```

---

## use(method, middleware) 활용법

- set/get/remove 동작에 원하는 만큼 미들웨어를 체인 형태로 등록할 수 있습니다.
- 각 미들웨어는 ctx(컨텍스트)와 next()를 인자로 받아, ctx를 가공하거나 next() 호출 전/후에 원하는 로직을 삽입할 수 있습니다.
- 활용 예: 입력값 검증, 자동 만료 부여, 데이터 암호화/복호화, 외부 API 연동 등

---

### onChange(callback)

- 같은 네임스페이스의 값이 다른 탭/윈도우에서 변경될 때 콜백 실행
- 예시:
  ```ts
  storage.onChange((key, value) => {
    console.log(key, value);
  });
  ```

---

## onChange(cb) 내부 동작 및 활용법

- window의 storage 이벤트를 활용해, 같은 네임스페이스 내 값이 다른 탭/윈도우에서 변경될 때 콜백이 실행됩니다.
- 콜백은 (key, value) 형태로 변경된 키와 값을 전달합니다.
- 활용: 실시간 동기화, 협업 앱, 알림 등

---

## 일괄 처리(Batch) API

### batchSet(entries: {key, value, options?}[])

- 여러 key-value를 한 번에 저장
- 예시:
  ```ts
  storage.batchSet([
    { key: "a", value: 1 },
    { key: "b", value: 2 },
  ]);
  ```

### batchGet(keys: string[]): any[]

- 여러 key의 값을 한 번에 배열로 반환
- 예시:
  ```ts
  const values = storage.batchGet(["a", "b"]);
  ```

### batchRemove(keys: string[])

- 여러 key를 한 번에 삭제
- 예시:
  ```ts
  storage.batchRemove(["a", "b"]);
  ```

---

## batchSet/batchGet/batchRemove 내부 동작 및 활용법

- 각각 set/get/remove를 여러 번 반복 호출하는 방식으로 동작합니다.
- 미들웨어, 만료, 직렬화 등 단일 메서드와 동일하게 동작합니다.
- 활용: 대량 데이터 초기화, 동기화, 일괄 삭제 등

---

## 타입 안전성

- TypeScript 제네릭을 활용해 저장/조회 데이터의 타입을 안전하게 보장
- 예시:
  ```ts
  const storage = new Stosh<{ name: string }>();
  storage.set("user", { name: "홍길동" });
  const user = storage.get("user"); // 타입: { name: string } | null
  ```

---

## 네임스페이스

- 생성자에서 지정한 네임스페이스별로 데이터가 완전히 분리되어 저장됨
- 예시:
  ```ts
  const userStorage = new Stosh({ namespace: "user" });
  const cacheStorage = new Stosh({ namespace: "cache" });
  userStorage.set("profile", { name: "홍길동" });
  cacheStorage.set("temp", 123);
  ```

---

## 커스텀 직렬화/역직렬화

- JSON 이외의 포맷(암호화, 압축 등)도 자유롭게 적용 가능
- 예시:
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

## 만료(expire)

- set 시 options.expire(ms)로 만료 시간 지정 가능
- 만료된 값은 get 시 자동 삭제 및 null 반환
- 예시:
  ```ts
  storage.set("temp", "임시값", { expire: 5000 });
  setTimeout(() => {
    console.log(storage.get("temp")); // 5초 후 null
  }, 6000);
  ```

---

## 사용 시 주의사항 및 에러 케이스

### 주의사항

- **브라우저 환경에서만 정상 동작**: localStorage/sessionStorage는 브라우저 환경에서만 사용 가능(SSR/Node.js 환경에서는 직접 사용 시 에러 발생)
- **네임스페이스 중복**: 같은 네임스페이스로 여러 인스턴스를 생성하면 데이터가 겹칠 수 있음
- **스토리지 용량 제한**: 브라우저마다 localStorage/sessionStorage 용량 제한(일반적으로 5MB 내외). 대용량 데이터 저장 시 set에서 예외 발생 가능
- **직렬화/역직렬화 오류**: 순환 참조 객체, JSON으로 변환 불가한 값 저장 시 set에서 에러 발생. 커스텀 serialize/deserialize 함수 사용 시 타입 불일치, 파싱 오류 등 주의
- **만료(expire) 옵션**: 시스템 시간이 변경되면 만료 동작이 예상과 다를 수 있음
- **미들웨어 내 예외 처리**: 미들웨어에서 예외가 발생하면 set/get/remove 전체 동작이 중단될 수 있음
- **onChange 이벤트**: 같은 탭 내 set/remove는 onChange로 감지되지 않음(다른 탭/윈도우에서만 감지)

### 대표 에러 케이스

- localStorage가 가득 찼을 때: `QuotaExceededError: Failed to execute 'setItem' on 'Storage': The quota has been exceeded.`
- JSON 직렬화 불가 객체 저장 시: `TypeError: Converting circular structure to JSON`
- 커스텀 직렬화/역직렬화 함수 오류: `SyntaxError: Unexpected token ...` (파싱 실패 등)
- 브라우저가 아닌 환경에서 접근 시: `ReferenceError: window is not defined`
