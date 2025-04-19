import { Stosh } from "../src/index";

describe("Stosh 기본 동작", () => {
  let storage: Stosh<any>;
  beforeEach(() => {
    storage = new Stosh({ type: "local", namespace: "test" });
    storage.clear();
  });

  it("set/get/remove/has 동작", () => {
    storage.set("foo", 123);
    expect(storage.get("foo")).toBe(123);
    expect(storage.has("foo")).toBe(true);
    storage.remove("foo");
    expect(storage.get("foo")).toBeNull();
    expect(storage.has("foo")).toBe(false);
  });

  it("존재하지 않는 키 get/remove/has", () => {
    expect(storage.get("nope")).toBeNull();
    expect(storage.has("nope")).toBe(false);
    storage.remove("nope"); // 에러 없이 통과해야 함
  });

  it("객체/배열 자동 직렬화", () => {
    const obj = { a: 1 };
    const arr = [1, 2, 3];
    storage.set("obj", obj);
    storage.set("arr", arr);
    expect(storage.get("obj")).toEqual(obj);
    expect(storage.get("arr")).toEqual(arr);
  });

  it("만료(expire) 옵션 동작", () => {
    storage.set("exp", "bye", { expire: 10 });
    expect(storage.get("exp")).toBe("bye");
    // 강제로 만료 시뮬레이션
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 100);
    expect(storage.get("exp")).toBeNull();
    (Date.now as any).mockRestore && (Date.now as any).mockRestore();
  });

  it("만료된 값 getAll에서 제외", () => {
    storage.set("a", 1, { expire: 1 });
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 10);
    expect(storage.getAll()).toEqual({});
    (Date.now as any).mockRestore && (Date.now as any).mockRestore();
  });

  it("네임스페이스 격리", () => {
    const s1 = new Stosh({ type: "local", namespace: "ns1" });
    const s2 = new Stosh({ type: "local", namespace: "ns2" });
    s1.set("k", 1);
    s2.set("k", 2);
    expect(s1.get("k")).toBe(1);
    expect(s2.get("k")).toBe(2);
    s1.clear();
    expect(s1.get("k")).toBeNull();
    expect(s2.get("k")).toBe(2);
  });

  it("getAll 동작", () => {
    storage.set("a", 1);
    storage.set("b", 2);
    expect(storage.getAll()).toEqual({ a: 1, b: 2 });
  });

  it("batchSet/batchRemove 빈 배열", () => {
    storage.batchSet([]);
    storage.batchRemove([]);
    expect(storage.getAll()).toEqual({});
  });

  it("batchSet 중복 키", () => {
    storage.batchSet([
      { key: "dup", value: 1 },
      { key: "dup", value: 2 },
    ]);
    expect(storage.get("dup")).toBe(2);
  });

  it("미들웨어 동작", () => {
    storage.use("set", (ctx, next) => {
      ctx.value = "m_" + ctx.value;
      next();
    });
    storage.set("x", "y");
    expect(storage.get("x")).toBe("m_y");
  });

  it("get 미들웨어(복호화) 동작", () => {
    storage.use("set", (ctx, next) => {
      ctx.value = btoa(ctx.value as string);
      next();
    });
    storage.use("get", (ctx, next) => {
      next();
      if (ctx.result) ctx.result = atob(ctx.result);
    });
    storage.set("secret", "plain");
    expect(storage.get("secret")).toBe("plain");
    // 실제 저장된 값은 인코딩된 값이어야 함
    const raw = window.localStorage.getItem("test:secret");
    expect(raw).toContain(btoa("plain"));
  });

  it("remove 미들웨어 동작", () => {
    let removedKey = "";
    storage.use("remove", (ctx, next) => {
      removedKey = ctx.key;
      next();
    });
    storage.set("foo", 1);
    storage.remove("foo");
    expect(removedKey).toBe("foo");
    expect(storage.get("foo")).toBeNull();
  });

  it("만료 옵션 + 미들웨어 조합", () => {
    storage.use("set", (ctx, next) => {
      ctx.options = { ...ctx.options, expire: 1 };
      next();
    });
    storage.set("autoExpire", "bye");
    expect(storage.get("autoExpire")).toBe("bye");
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 10);
    expect(storage.get("autoExpire")).toBeNull();
    (Date.now as any).mockRestore && (Date.now as any).mockRestore();
  });
});

describe("Stosh 확장 기능", () => {
  it("커스텀 직렬화/역직렬화(암호화) 사용", () => {
    // 예시: 간단한 base64 인코딩/디코딩
    const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
    const b64d = (s: string) => decodeURIComponent(escape(atob(s)));
    const storage = new Stosh({
      namespace: "enc",
      serialize: (data) => b64(JSON.stringify(data)),
      deserialize: (raw) => JSON.parse(b64d(raw)),
    });
    storage.set("foo", { a: 1 });
    expect(storage.get("foo")).toEqual({ a: 1 });
    // 실제 저장된 값이 암호화된 형태인지 확인
    const raw = window.localStorage.getItem("enc:foo");
    expect(raw).not.toContain("{");
  });

  it("커스텀 직렬화 함수 에러", () => {
    const badStorage = new Stosh({
      namespace: "err",
      serialize: () => {
        throw new Error("직렬화 실패");
      },
    });
    expect(() => badStorage.set("x", 1)).toThrow("직렬화 실패");
  });

  it("커스텀 역직렬화 함수 에러", () => {
    const badStorage = new Stosh({
      namespace: "err2",
      deserialize: () => {
        throw new Error("역직렬화 실패");
      },
    });
    badStorage.set("x", 1);
    expect(badStorage.get("x")).toBeNull(); // 예외가 아니라 null 반환을 기대
  });

  it("batchSet, batchGet, batchRemove 동작", () => {
    const storage = new Stosh({ namespace: "batch" });
    storage.batchSet([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
      { key: "c", value: 3 },
    ]);
    expect(storage.batchGet(["a", "b", "c"])).toEqual([1, 2, 3]);
    storage.batchRemove(["a", "b"]);
    expect(storage.get("a")).toBeNull();
    expect(storage.get("b")).toBeNull();
    expect(storage.get("c")).toBe(3);
  });
});

describe("Stosh 메모리 폴백 및 SSR 지원", () => {
  it("localStorage 사용 불가 시 메모리 폴백 동작", () => {
    // window.localStorage를 임시로 undefined로 만듦
    const originalLocalStorage = window.localStorage;
    // @ts-ignore
    delete window.localStorage;
    // @ts-ignore
    window.localStorage = undefined;
    const storage = new Stosh({ namespace: "memfb" });
    expect(storage.isMemoryFallback).toBe(true);
    // 복원
    window.localStorage = originalLocalStorage;
  });

  it("SSR 환경에서 isSSR, isMemoryFallback 동작", () => {
    // window가 undefined인 환경을 시뮬레이션
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    // @ts-ignore
    global.window = undefined;
    expect(Stosh.isSSR).toBe(true);
    const storage = new Stosh({ namespace: "ssr" });
    expect(storage.isMemoryFallback).toBe(true);
    // 복원
    global.window = originalWindow;
  });
});

describe("Stosh 쿠키 스토리지 지원", () => {
  it("쿠키 스토리지 set/get/remove 동작", () => {
    const storage = new Stosh({ type: "cookie", namespace: "cktest" });
    storage.set("foo", "bar");
    expect(storage.get("foo")).toBe("bar");
    storage.remove("foo");
    expect(storage.get("foo")).toBeNull();
  });
});

describe("Stosh 저장소 우선순위(priority) 및 폴백/환경별 동작", () => {
  it("priority 옵션에 따라 local → session → cookie → memory 순으로 폴백", () => {
    // localStorage, sessionStorage, cookie 모두 임시로 비활성화(메모리 폴백 유도)
    const originalLocal = window.localStorage;
    const originalSession = window.sessionStorage;
    // @ts-ignore
    delete window.localStorage;
    // @ts-ignore
    window.localStorage = undefined;
    // @ts-ignore
    delete window.sessionStorage;
    // @ts-ignore
    window.sessionStorage = undefined;
    const storage = new Stosh({
      priority: ["local", "session", "cookie", "memory"],
      namespace: "prio",
    });
    expect(storage.isMemoryFallback).toBe(true);
    // 복원
    window.localStorage = originalLocal;
    window.sessionStorage = originalSession;
  });

  it("priority 옵션에 따라 sessionStorage 우선 사용", () => {
    const storage = new Stosh({
      priority: ["session", "local", "cookie", "memory"],
      namespace: "prio2",
    });
    storage.set("foo", "bar");
    expect(sessionStorage.getItem("prio2:foo")).toBeTruthy();
  });

  it("isMemoryFallback, isSSR 다양한 환경에서 동작", () => {
    // SSR 환경 시뮬레이션
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    // @ts-ignore
    global.window = undefined;
    expect(Stosh.isSSR).toBe(true);
    const storage = new Stosh({ namespace: "ssr2" });
    expect(storage.isMemoryFallback).toBe(true);
    // 복원
    global.window = originalWindow;
  });

  it("쿠키 스토리지 폴백 동작 (브라우저 환경에서만)", () => {
    const storage = new Stosh({ type: "cookie", namespace: "ckfb" });
    storage.set("foo", "bar");
    expect(storage.get("foo")).toBe("bar");
    storage.remove("foo");
    expect(storage.get("foo")).toBeNull();
  });
});
