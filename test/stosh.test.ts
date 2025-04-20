import { stosh } from "../src/index";

describe("Stosh 통합 테스트", () => {
  // 동기/비동기 기본 동작
  describe("set/get/remove/has/clear 동작", () => {
    let storage: ReturnType<typeof stosh>;
    beforeEach(() => {
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
      await storage.set("foo", 123);
      expect(await storage.get("foo")).toBe(123);
      expect(await storage.has("foo")).toBe(true);
      await storage.remove("foo");
      expect(await storage.get("foo")).toBeNull();
      expect(await storage.has("foo")).toBe(false);
      await storage.set("bar", 1);
      await storage.clear();
      expect(await storage.get("bar")).toBeNull();
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
    const storage = stosh({ namespace: "batch" });
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
    const storage = stosh({ namespace: "all" });
    storage.setSync("a", 1);
    storage.setSync("b", 2);
    expect(storage.getAllSync()).toEqual({ a: 1, b: 2 });
  });

  // falsy 값
  it("undefined, null, '', 0, false 저장/조회/삭제", () => {
    const storage = stosh({ namespace: "falsy" });
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
  it("순환 참조 객체 저장 시 예외", () => {
    const storage = stosh({ namespace: "circular" });
    const a: any = {};
    a.self = a;
    expect(() => storage.setSync("circ", a)).toThrow();
  });

  // 미들웨어에서 next()를 아예 호출하지 않으면 set 무시
  it("미들웨어에서 next()를 아예 호출하지 않으면 set 무시", () => {
    const storage = stosh({ namespace: "mw-no-next" });
    storage.use("set", (ctx, next) => {});
    storage.setSync("foo", 1);
    expect(storage.getSync("foo")).toBeNull();
  });

  // 커스텀 직렬화/역직렬화 함수에서 예외 발생 시 동작
  it("커스텀 직렬화/역직렬화 함수에서 예외 발생 시 getSync는 null 반환", () => {
    const storage = stosh({
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
    const storage = stosh();
    await storage.set("user", { name: "홍길동" });
    const user = await storage.get("user");
    expect(user && typeof user.name === "string").toBe(true);
    // 타입 에러 검증은 실제로는 타입 테스트(예: dtslint)에서 별도로 수행하는 것이 좋음
  });

  // 매우 긴 키/값, 특수문자, 이모지 등 저장/조회
  it("매우 긴 키/값, 특수문자, 이모지 등 저장/조회", () => {
    const storage = stosh({ namespace: "edgecase" });
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
    const s1 = stosh({ namespace: "dup" });
    const s2 = stosh({ namespace: "dup" });
    s1.setSync("foo", 1);
    expect(s2.getSync("foo")).toBe(1);
    s2.setSync("foo", 2);
    expect(s1.getSync("foo")).toBe(2);
  });

  // 커스텀 serialize/deserialize가 없는 경우와 있는 경우 차이
  it("커스텀 serialize/deserialize가 없는 경우와 있는 경우 차이", () => {
    const s1 = stosh({ namespace: "ser1" });
    const s2 = stosh({
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
});
