import { stosh } from "../src/index";

// jsdom 환경에서 indexedDB 모의(mock) 처리
if (typeof window !== "undefined" && typeof window.indexedDB === "undefined") {
  window.indexedDB = {
    open: jest.fn().mockImplementation((dbName, version) => {
      const request: any = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: {
          // Mock IDBDatabase
          objectStoreNames: {
            contains: jest.fn().mockReturnValue(false), // 기본적으로 스토어 없음
          },
          createObjectStore: jest.fn().mockReturnValue({
            // Mock IDBObjectStore
            createIndex: jest.fn(),
          }),
          transaction: jest.fn().mockReturnValue({
            // Mock IDBTransaction
            objectStore: jest.fn().mockReturnValue({
              // Mock IDBObjectStore
              get: jest.fn().mockImplementation((key) => ({
                result: null,
                error: null,
                onsuccess: () => {},
                onerror: () => {},
              })), // Mock IDBRequest
              put: jest.fn().mockImplementation((value, key) => ({
                result: undefined,
                error: null,
                onsuccess: () => {},
                onerror: () => {},
              })),
              delete: jest.fn().mockImplementation((key) => ({
                result: undefined,
                error: null,
                onsuccess: () => {},
                onerror: () => {},
              })),
              clear: jest.fn().mockImplementation(() => ({
                result: undefined,
                error: null,
                onsuccess: () => {},
                onerror: () => {},
              })),
              getAllKeys: jest.fn().mockImplementation(() => ({
                result: [],
                error: null,
                onsuccess: () => {},
                onerror: () => {},
              })),
              getAll: jest.fn().mockImplementation(() => ({
                result: [],
                error: null,
                onsuccess: () => {},
                onerror: () => {},
              })),
              getKey: jest.fn().mockImplementation((key) => ({
                result: undefined,
                error: null,
                onsuccess: () => {},
                onerror: () => {},
              })),
            }),
            oncomplete: null,
            onerror: null,
            onabort: null,
            abort: jest.fn(),
          }),
          close: jest.fn(),
        },
        error: null,
      };
      // 비동기 동작 시뮬레이션
      setTimeout(() => {
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }
        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
      }, 0);
      return request;
    }),
    deleteDatabase: jest.fn().mockImplementation((dbName) => {
      const request: any = {
        onsuccess: null,
        onerror: null,
        result: undefined,
        error: null,
      };
      setTimeout(() => {
        if (request.onsuccess) request.onsuccess({ target: request });
      }, 0);
      return request;
    }),
  } as any; // 타입 에러 방지
}

function getCookieValue(key: string): string | undefined {
  const cookies = document.cookie.split(";").map((c) => c.trim());
  const prefix = key + "=";
  const found = cookies.find((c) => c.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

describe("Stosh 통합 테스트", () => {
  test("localStorage 동작 확인", () => {
    window.localStorage.setItem("foo", "bar");
    expect(window.localStorage.getItem("foo")).toBe("bar");
  });

  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation((message) => {
        if (!message.includes("[stosh]")) {
        }
      });
  });

  afterEach(() => {
    // 모든 스토리지 인스턴스 초기화
    consoleWarnSpy.mockRestore();
  });

  // 동기/비동기 기본 동작
  describe("set/get/remove/has/clear 동작", () => {
    let storage: ReturnType<typeof stosh>;
    beforeEach(() => {
      // Explicitly use 'local' to avoid IDB issues in Jest
      storage = stosh({ type: "local", namespace: "test" });
      storage.clearSync();
    });
    it("동기 set/get/remove/has/clear", () => {
      storage.setSync("foo", 123);
      expect(storage.getSync("foo")).toBe(123);
      expect(storage.hasSync("foo")).toBe(true);
      storage.removeSync("foo");
      expect(storage.getSync("foo")).toBeNull();
      expect(storage.hasSync("foo")).toBe(false);
      storage.setSync("bar", 1);
      storage.clearSync();
      expect(storage.getSync("bar")).toBeNull();
    });
    it("비동기 set/get/remove/has/clear", async () => {
      try {
        await storage.set("foo", 123);
        expect(await storage.get("foo")).toBe(123);
        expect(await storage.has("foo")).toBe(true);
        await storage.remove("foo");
        expect(await storage.get("foo")).toBeNull();
        expect(await storage.has("foo")).toBe(false);
        await storage.set("bar", 1);
        await storage.clear();
        expect(await storage.get("bar")).toBeNull();
      } catch (e) {
        fail(e);
      }
    });
  });

  // 만료(expire)
  it("만료(expire) 옵션 동작", () => {
    const storage = stosh({ type: "local", namespace: "expire" });
    storage.setSync("exp", "bye", { expire: 10 });
    expect(storage.getSync("exp")).toBe("bye");
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 100);
    expect(storage.getSync("exp")).toBeNull();
    (Date.now as any).mockRestore && (Date.now as any).mockRestore();
  });

  // 네임스페이스 격리
  it("네임스페이스 격리", () => {
    const s1 = stosh({ type: "local", namespace: "ns1" });
    const s2 = stosh({ type: "local", namespace: "ns2" });
    s1.setSync("k", 1);
    s2.setSync("k", 2);
    expect(s1.getSync("k")).toBe(1);
    expect(s2.getSync("k")).toBe(2);
    s1.clearSync();
    expect(s1.getSync("k")).toBeNull();
    expect(s2.getSync("k")).toBe(2);
  });

  // 미들웨어 동작
  it("set/get/remove 미들웨어 동작", () => {
    const storage = stosh({ type: "local", namespace: "mw" });
    storage.use("set", (ctx, next) => {
      ctx.value = "m_" + ctx.value;
      next();
    });
    storage.setSync("x", "y");
    expect(storage.getSync("x")).toBe("m_y");
    let removed = "";
    storage.use("remove", (ctx, next) => {
      removed = ctx.key;
      next();
    });
    storage.removeSync("x");
    expect(removed).toBe("x");
    expect(storage.getSync("x")).toBeNull();
  });

  // 미들웨어 예외/next 미호출
  it("set 미들웨어 예외 발생 시 setSync 예외", () => {
    const storage = stosh({ type: "local", namespace: "mwerr" });
    storage.use("set", () => {
      throw new Error("middleware error");
    });
    expect(() => storage.setSync("err", 1)).toThrow("middleware error");
    expect(storage.getSync("err")).toBeNull();
  });
  it("set 미들웨어 next 미호출 시 set 무시", () => {
    const storage = stosh({ type: "local", namespace: "mwnext" });
    storage.use("set", (ctx, next) => {});
    storage.setSync("no", "x");
    expect(storage.getSync("no")).toBeNull();
  });

  // 커스텀 직렬화/역직렬화
  it("커스텀 직렬화/역직렬화 동작", () => {
    const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
    const b64d = (s: string) => decodeURIComponent(escape(atob(s)));
    const storage = stosh({
      type: "local",
      namespace: "enc",
      serialize: (data) => b64(JSON.stringify(data)),
      deserialize: (raw) => JSON.parse(b64d(raw)),
    });
    storage.setSync("foo", { a: 1 });
    expect(storage.getSync("foo")).toEqual({ a: 1 });
    const raw = window.localStorage.getItem("enc:foo");
    expect(raw).not.toContain("{");
  });

  // batch API
  it("batchSet/batchGet/batchRemove 동작", () => {
    const storage = stosh({ type: "local", namespace: "batch" });
    storage.batchSetSync([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
      { key: "c", value: 3 },
    ]);
    expect(storage.batchGetSync(["a", "b", "c"])).toEqual([1, 2, 3]);
    storage.batchRemoveSync(["a", "b"]);
    expect(storage.getSync("a")).toBeNull();
    expect(storage.getSync("b")).toBeNull();
    expect(storage.getSync("c")).toBe(3);
  });

  // getAll
  it("getAll 동작", () => {
    const storage = stosh({ type: "local", namespace: "all" });
    storage.setSync("a", 1);
    storage.setSync("b", 2);
    expect(storage.getAllSync()).toEqual({ a: 1, b: 2 });
  });

  // falsy 값
  it("undefined, null, '', 0, false 저장/조회/삭제", () => {
    const storage = stosh({ type: "local", namespace: "falsy" });
    const falsyValues = [undefined, null, "", 0, false];
    falsyValues.forEach((v, i) => {
      const key = "falsy_" + i;
      storage.setSync(key, v);
      // undefined 저장 시 localStorage 등은 null 반환이 정상
      if (v === undefined) {
        expect(storage.getSync(key)).toBeNull();
      } else {
        expect(storage.getSync(key)).toBe(v);
      }
      storage.removeSync(key);
      expect(storage.getSync(key)).toBeNull();
    });
  });

  // 잘못된 type 예외
  it("지원하지 않는 storage type 예외", () => {
    expect(() => stosh({ type: "notype" as any, namespace: "x" })).toThrow();
  });

  // 순환 참조 객체 저장 시 예외
  it("순환 참조 객체 저장 시 예외", async () => {
    const storage = stosh({ type: "local", namespace: "circular" });
    const a: any = {};
    a.self = a;
    await expect(storage.set("circ", a)).rejects.toThrow();
  });

  // 미들웨어에서 next()를 아예 호출하지 않으면 set 무시
  it("미들웨어에서 next()를 아예 호출하지 않으면 set 무시", () => {
    const storage = stosh({ type: "local", namespace: "mw-no-next" });
    storage.use("set", (ctx, next) => {});
    storage.setSync("foo", 1);
    expect(storage.getSync("foo")).toBeNull();
  });

  // 커스텀 직렬화/역직렬화 함수에서 예외 발생 시 동작
  it("커스텀 직렬화/역직렬화 함수에서 예외 발생 시 getSync는 null 반환", () => {
    const storage = stosh({
      type: "local",
      namespace: "serr",
      serialize: () => {
        throw new Error("serialize error");
      },
      deserialize: () => {
        throw new Error("deserialize error");
      },
    });
    expect(() => storage.setSync("foo", 1)).toThrow("serialize error");
    window.localStorage.setItem("serr:foo", "bad");
    expect(storage.getSync("foo")).toBeNull();
    window.localStorage.removeItem("serr:foo");
  });

  // SSR(window undefined) 환경에서 메모리 폴백 및 API 동작
  it("SSR(window undefined) 환경에서 메모리 폴백 및 API 동작", () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    // @ts-ignore
    global.window = undefined;
    const storage = stosh({ namespace: "ssrtest" });
    expect(storage.isMemoryFallback).toBe(true);
    storage.setSync("foo", 1);
    expect(storage.getSync("foo")).toBe(1);
    storage.removeSync("foo");
    expect(storage.getSync("foo")).toBeNull();
    // 복원
    global.window = originalWindow;
  });

  // 타입 안전성(제네릭 타입 보장)
  it("타입 안전성(제네릭 타입 보장)", async () => {
    const storage = stosh({ type: "local" });
    try {
      await storage.set("user", { name: "홍길동" });
      const user = await storage.get("user");
      expect(user && typeof user.name === "string").toBe(true);
    } catch (e) {
      fail(e);
    }
    // 타입 에러 검증은 실제로는 타입 테스트(예: dtslint)에서 별도로 수행하는 것이 좋음
  });

  // 매우 긴 키/값, 특수문자, 이모지 등 저장/조회
  it("매우 긴 키/값, 특수문자, 이모지 등 저장/조회", () => {
    const storage = stosh({ type: "local", namespace: "edgecase" });
    const longKey = "k".repeat(1000);
    const longVal = "v".repeat(10000);
    const emojiKey = "😀키";
    const emojiVal = "값🚀";
    storage.setSync(longKey, longVal);
    expect(storage.getSync(longKey)).toBe(longVal);
    storage.setSync(emojiKey, emojiVal);
    expect(storage.getSync(emojiKey)).toBe(emojiVal);
    storage.setSync("특수!@#$%^&*()_+|", "!@#$%^&*()_+");
    expect(storage.getSync("특수!@#$%^&*()_+|")).toBe("!@#$%^&*()_+");
  });

  // 여러 인스턴스에서 같은 네임스페이스 사용 시 충돌 여부
  it("여러 인스턴스에서 같은 네임스페이스 사용 시 충돌 여부", () => {
    const s1 = stosh({ type: "local", namespace: "dup" });
    const s2 = stosh({ type: "local", namespace: "dup" });
    s1.setSync("foo", 1);
    expect(s2.getSync("foo")).toBe(1);
    s2.setSync("foo", 2);
    expect(s1.getSync("foo")).toBe(2);
  });

  // 커스텀 serialize/deserialize가 없는 경우와 있는 경우 차이
  it("커스텀 serialize/deserialize가 없는 경우와 있는 경우 차이", () => {
    const s1 = stosh({ type: "local", namespace: "ser1" });
    const s2 = stosh({
      type: "local",
      namespace: "ser2",
      serialize: (d) => btoa(JSON.stringify(d)),
      deserialize: (r) => JSON.parse(atob(r)),
    });
    s1.setSync("foo", { a: 1 });
    s2.setSync("foo", { a: 1 });
    const raw1 = window.localStorage.getItem("ser1:foo");
    const raw2 = window.localStorage.getItem("ser2:foo");
    expect(raw1).toContain("{");
    expect(raw2).not.toContain("{");
  });

  // onChange 콜백 테스트 (같은 인스턴스)
  it("onChange 콜백 동작 (같은 인스턴스)", () => {
    const storage = stosh({ type: "local", namespace: "onchange-same" });
    const changes: { key: string; value: any }[] = [];
    storage.onChange((key, value) => {
      changes.push({ key, value });
    });

    storage.setSync("a", 1);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ key: "a", value: 1 });

    storage.setSync("a", 2); // Update
    expect(changes).toHaveLength(2);
    expect(changes[1]).toEqual({ key: "a", value: 2 });

    storage.removeSync("a");
    expect(changes).toHaveLength(3);
    expect(changes[2]).toEqual({ key: "a", value: null });

    storage.setSync("b", 3);
    storage.clearSync(); // clear는 개별 키에 대한 remove 이벤트를 발생시킴
    // clearSync 자체에 대한 콜백이 필요하다면 별도 설계 필요
    // 현재 구현은 clear 시 개별 remove 이벤트를 발생시킴
    expect(changes).toHaveLength(5); // set b(1) + clear b(1) = 5
    expect(changes[3]).toEqual({ key: "b", value: 3 });
    expect(changes[4]).toEqual({ key: "b", value: null }); // clearSync에 의한 remove 이벤트
    // clearSync 후 get 확인
    expect(storage.getSync("b")).toBeNull();
  });

  // 저장소 폴백 로직 검증 (localStorage 모킹)
  it("localStorage 사용 불가 시 sessionStorage로 폴백", () => {
    const originalLocalStorage = window.localStorage;
    const originalIndexedDB = window.indexedDB; // 원래 indexedDB 저장
    // localStorage 모킹 (getItem 등에서 에러 발생시키거나 null 반환)
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("localStorage disabled");
        },
        setItem: () => {
          throw new Error("localStorage disabled");
        },
        removeItem: () => {
          throw new Error("localStorage disabled");
        },
        clear: () => {
          throw new Error("localStorage disabled");
        },
        key: () => {
          throw new Error("localStorage disabled");
        },
        length: 0,
      },
      writable: true,
    });
    // jsdom 환경에서 indexedDB가 없으므로 undefined로 설정하여 폴백 유도
    Object.defineProperty(window, "indexedDB", {
      value: undefined,
      writable: true,
    });

    // priority 기본값 사용 시 idb 시도(undefined) -> local 시도(mocked error) -> session 시도
    const storage = stosh({ namespace: "fallback-session" });
    // isMemoryFallback이 false여야 sessionStorage 사용 의미
    expect(storage.isMemoryFallback).toBe(false);
    storage.setSync("fb-test", 1);
    expect(storage.getSync("fb-test")).toBe(1);
    // sessionStorage에 저장되었는지 확인 (선택적)
    const raw = window.sessionStorage.getItem("fallback-session:fb-test");
    expect(raw).toContain("1");

    // 원래 localStorage 및 indexedDB 복원
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      writable: true,
    });
    Object.defineProperty(window, "indexedDB", {
      value: originalIndexedDB, // 원래 값으로 복원
      writable: true,
    });
    // 테스트 후 정리
    window.sessionStorage.clear();
  });

  it("localStorage/sessionStorage 사용 불가 시 memory로 폴백", () => {
    const originalLocalStorage = window.localStorage;
    const originalSessionStorage = window.sessionStorage;
    const originalIndexedDB = window.indexedDB; // 원래 indexedDB 저장
    const originalCookie = document.cookie; // 원래 cookie 저장

    // localStorage 모킹
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("localStorage disabled");
        },
        setItem: () => {
          throw new Error("localStorage disabled");
        },
        removeItem: () => {
          throw new Error("localStorage disabled");
        },
        clear: () => {
          throw new Error("localStorage disabled");
        },
        key: () => {
          throw new Error("localStorage disabled");
        },
        length: 0,
      },
      writable: true,
      configurable: true, // configurable 추가
    });
    // sessionStorage 모킹
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: () => {
          throw new Error("sessionStorage disabled");
        },
        setItem: () => {
          throw new Error("sessionStorage disabled");
        },
        removeItem: () => {
          throw new Error("sessionStorage disabled");
        },
        clear: () => {
          throw new Error("sessionStorage disabled");
        },
        key: () => {
          throw new Error("sessionStorage disabled");
        },
        length: 0,
      },
      writable: true,
      configurable: true, // configurable 추가
    });
    // jsdom 환경에서 indexedDB가 없으므로 undefined로 설정하여 폴백 유도
    Object.defineProperty(window, "indexedDB", {
      value: undefined,
      writable: true,
      configurable: true, // configurable 추가
    });
    // cookie 접근 모킹 (에러 발생시키기)
    Object.defineProperty(document, "cookie", {
      get: () => {
        throw new Error("Cookie disabled");
      },
      set: () => {
        throw new Error("Cookie disabled");
      },
      configurable: true, // 재정의 가능하도록 설정
    });

    // idb(undefined) -> local(mocked error) -> session(mocked error) -> cookie(mocked error) -> memory
    const storage = stosh({ namespace: "fallback-memory" });
    expect(storage.isMemoryFallback).toBe(true);
    storage.setSync("fb-mem", 1);
    expect(storage.getSync("fb-mem")).toBe(1);

    // 복원
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: originalSessionStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "indexedDB", {
      value: originalIndexedDB,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, "cookie", {
      value: originalCookie,
      writable: true,
      configurable: true,
    }); // cookie 복원
  });

  // 미들웨어와 Batch API 상호작용
  it("batchSetSync 시 set 미들웨어 적용", () => {
    const storage = stosh({ type: "local", namespace: "batch-mw" });
    storage.use("set", (ctx, next) => {
      ctx.value = `mw_${ctx.value}`;
      next();
    });
    storage.batchSetSync([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);
    expect(storage.getSync("a")).toBe("mw_1");
    expect(storage.getSync("b")).toBe("mw_2");
    expect(storage.batchGetSync(["a", "b"])).toEqual(["mw_1", "mw_2"]);
  });

  // getAll과 미들웨어/만료 상호작용
  it("getAllSync 시 만료된 항목 제외 및 get 미들웨어 적용", () => {
    const storage = stosh({ type: "local", namespace: "getall-mw-exp" });
    storage.setSync("a", 1);
    storage.setSync("b", 2, { expire: 10 }); // 만료될 항목
    storage.setSync("c", 3);

    storage.use("get", (ctx, next) => {
      next();
      if (ctx.result !== null) {
        ctx.result = `get_${ctx.result}`;
      }
    });

    // 만료 시뮬레이션
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 100);

    const all = storage.getAllSync();
    expect(all).toEqual({ a: "get_1", c: "get_3" }); // 만료된 b 제외, get 미들웨어 적용
    expect(storage.getSync("b")).toBeNull(); // 개별 get도 null 확인

    (Date.now as any).mockRestore && (Date.now as any).mockRestore();
  });

  // 명시적 저장소 타입 테스트 (Memory)
  it("MemoryStorage 명시적 사용 시 기본 동작", () => {
    const storage = stosh({ type: "memory", namespace: "mem-explicit" });
    expect(storage.isMemoryFallback).toBe(true); // type: memory는 isMemoryFallback=true
    storage.setSync("m", 1);
    expect(storage.getSync("m")).toBe(1);
    storage.removeSync("m");
    expect(storage.getSync("m")).toBeNull();
  });

  describe("쿠키 스토리지 및 옵션/배치 API 동작", () => {
    beforeEach(() => {
      // 테스트 전 쿠키 초기화
      document.cookie.split(";").forEach((c) => {
        const eq = c.indexOf("=");
        const name = eq > -1 ? c.substr(0, eq).trim() : c.trim();
        if (name)
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
    });

    it("setSync/getSync/removeSync에서 쿠키 옵션이 반영되는지", () => {
      const storage = stosh({ type: "cookie", namespace: "ckopt" });
      storage.setSync("foo", "bar", {
        path: "/",
        secure: true,
        sameSite: "Strict",
      });
      const key = encodeURIComponent("ckopt:foo");
      const value = encodeURIComponent(JSON.stringify({ v: "bar" }));
      expect(getCookieValue(key)).toBe(value);
      storage.removeSync("foo", { path: "/" });
      expect(getCookieValue(key)).toBeFalsy();
    });

    it("set에서 expire 옵션이 반영되어 세션 쿠키/만료 쿠키가 구분되는지", async () => {
      const storage = stosh({ type: "cookie", namespace: "ckexp" });
      await storage.set("temp", "v1", { expire: 100 });
      const key = encodeURIComponent("ckexp:temp");
      expect(getCookieValue(key)).toBeDefined();
      jest.spyOn(Date, "now").mockReturnValue(Date.now() + 200);
      expect(await storage.get("temp")).toBeNull();
      (Date.now as any).mockRestore && (Date.now as any).mockRestore();
    });

    // jsdom 환경에서는 path 옵션이 다른 쿠키의 존재 여부를 신뢰성 있게 검증할 수 없으므로 해당 테스트는 e2e에서만 진행
    // it("batchSet에서 entry별 옵션과 공통 옵션 병합 동작", () => {
    //   const storage = stosh({ type: "cookie", namespace: "batchck" });
    //   storage.batchSetSync([
    //     { key: "a", value: "v1", options: { path: "/a" } },
    //     { key: "b", value: "v2" },
    //   ], { secure: true });
    //   const keyA = encodeURIComponent("batchck:a");
    //   const valueA = encodeURIComponent(JSON.stringify({ v: "v1" }));
    //   const keyB = encodeURIComponent("batchck:b");
    //   const valueB = encodeURIComponent(JSON.stringify({ v: "v2" }));
    //   expect(getCookieValue(keyA)).toBe(valueA);
    //   expect(getCookieValue(keyB)).toBe(valueB);
    // });

    it("batchRemove에서 공통 옵션이 적용되는지", () => {
      const storage = stosh({ type: "cookie", namespace: "batchrm" });
      storage.setSync("x", "1", { path: "/" });
      storage.setSync("y", "2", { path: "/" });
      storage.batchRemoveSync(["x", "y"], { path: "/" });
      const keyX = encodeURIComponent("batchrm:x");
      const keyY = encodeURIComponent("batchrm:y");
      expect(getCookieValue(keyX)).toBeFalsy();
      expect(getCookieValue(keyY)).toBeFalsy();
    });
  });
});
