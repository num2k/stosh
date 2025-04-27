import { stosh } from "../src/index";

describe("strictSyncFallback 옵션 동작", () => {
  it("IndexedDB + sync API + strictSyncFallback: true → 에러 발생 (mock 환경)", () => {
    const storage = stosh({
      type: "idb",
      strictSyncFallback: true,
      namespace: "strict-err"
    });
    // jsdom/mock 환경에서는 실제 idbStorage가 undefined이므로 정책 검증만 강제 수행
    (storage as any).idbStorage = true;
    expect(() => storage.setSync("foo", 1)).toThrow();
    expect(() => storage.getSync("foo")).toThrow();
    expect(() => storage.removeSync("foo")).toThrow();
  });

  it("IndexedDB + sync API + strictSyncFallback: false → 경고 후 fallback (mock 환경)", () => {
    const storage = stosh({
      type: "idb",
      strictSyncFallback: false,
      namespace: "strict-warn"
    });
    // jsdom/mock 환경에서는 실제 idbStorage가 undefined이므로 정책 검증만 강제 수행
    (storage as any).idbStorage = true;
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    storage.setSync("foo", 123);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[stosh]"));
    expect(storage.getSync("foo")).toBe(123);
    storage.removeSync("foo");
    expect(storage.getSync("foo")).toBeNull();
    warnSpy.mockRestore();
  });
});

describe("batchSet value any 타입 허용", () => {
  it("여러 타입의 value를 batchSet/batchSetSync로 저장/조회", async () => {
    const storage = stosh({ type: "local", namespace: "batch-any" });
    const entries = [
      { key: "num", value: 1 },
      { key: "str", value: "abc" },
      { key: "obj", value: { a: 1 } },
      { key: "arr", value: [1, 2, 3] },
      { key: "nul", value: null }
    ];
    await storage.batchSet(entries);
    const [num, str, obj, arr, nul] = await storage.batchGet(["num", "str", "obj", "arr", "nul"]);
    expect(num).toBe(1);
    expect(str).toBe("abc");
    expect(obj).toEqual({ a: 1 });
    expect(arr).toEqual([1, 2, 3]);
    expect(nul).toBeNull();

    // Sync 버전도 동일하게
    storage.batchSetSync(entries);
    const [num2, str2, obj2, arr2, nul2] = storage.batchGetSync(["num", "str", "obj", "arr", "nul"]);
    expect(num2).toBe(1);
    expect(str2).toBe("abc");
    expect(obj2).toEqual({ a: 1 });
    expect(arr2).toEqual([1, 2, 3]);
    expect(nul2).toBeNull();
  });
});
