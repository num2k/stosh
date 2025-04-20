declare global {
  interface Window {
    stosh: any;
    storage: any;
  }
}

import { test, expect } from "@playwright/test";

test.describe("Stosh E2E 기본 동작", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/build/public/index.html");
  });

  test("localStorage set/get/remove/has 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "e2e" });
      window.storage.setSync("foo", 123);
    });
    const value = await page.evaluate(() => window.storage.getSync("foo"));
    expect(value).toBe(123);

    await page.evaluate(() => window.storage.removeSync("foo"));
    const removed = await page.evaluate(() => window.storage.getSync("foo"));
    expect(removed).toBeNull();
  });

  test("만료(expire) 옵션 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "e2e_expire" });

      window.storage.setSync("exp", "bye", { expire: 10 });
    });
    const value = await page.evaluate(() => {
      return window.storage.getSync("exp");
    });
    expect(value).toBe("bye");
    // 만료 시뮬레이션 (실제 시간 경과 필요)
    await page.waitForTimeout(20);
    const expired = await page.evaluate(() => {
      return window.storage.getSync("exp");
    });
    expect(expired).toBeNull();
  });

  test("동기/비동기 set/get/remove/has/clear 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "e2e_sync" });
      window.storage.setSync("foo", 1);
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(1);
    await page.evaluate(() => window.storage.removeSync("foo"));
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBeNull();
    await page.evaluate(() => window.storage.setSync("bar", 2));
    await page.evaluate(() => window.storage.clearSync());
    expect(await page.evaluate(() => window.storage.getSync("bar"))).toBeNull();

    // 비동기
    await page.evaluate(async () => {
      window.storage = window.stosh({ type: "local", namespace: "e2e_async" });
      await window.storage.set("foo", 1);
    });
    expect(
      await page.evaluate(async () => await window.storage.get("foo"))
    ).toBe(1);
    await page.evaluate(async () => await window.storage.remove("foo"));
    expect(
      await page.evaluate(async () => await window.storage.get("foo"))
    ).toBeNull();
    await page.evaluate(async () => await window.storage.set("bar", 2));
    await page.evaluate(async () => await window.storage.clear());
    expect(
      await page.evaluate(async () => await window.storage.get("bar"))
    ).toBeNull();
  });

  test("네임스페이스 격리", async ({ page }) => {
    await page.evaluate(() => {
      window.ns1 = window.stosh({ type: "local", namespace: "ns1" });
      window.ns2 = window.stosh({ type: "local", namespace: "ns2" });
      window.ns1.setSync("k", 1);
      window.ns2.setSync("k", 2);
    });
    expect(await page.evaluate(() => window.ns1.getSync("k"))).toBe(1);
    expect(await page.evaluate(() => window.ns2.getSync("k"))).toBe(2);
    await page.evaluate(() => window.ns1.clearSync());
    expect(await page.evaluate(() => window.ns1.getSync("k"))).toBeNull();
    expect(await page.evaluate(() => window.ns2.getSync("k"))).toBe(2);
  });

  test("batchSet/batchGet/batchRemove 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "batch" });
      window.storage.batchSetSync([
        { key: "a", value: 1 },
        { key: "b", value: 2 },
        { key: "c", value: 3 },
      ]);
    });
    // 미들웨어가 없는 경우 [1, 2]가 정상, 미들웨어가 있으면 [2, 3] 등으로 바뀔 수 있음
    const result = await page.evaluate(
      async () => await window.storage.batchGet(["a", "b"])
    );
    expect(result).toEqual([1, 2]);
    await page.evaluate(() => window.storage.batchRemoveSync(["a", "b"]));
    expect(await page.evaluate(() => window.storage.getSync("a"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("b"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("c"))).toBe(3);
  });

  test("미들웨어 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "mw" });
      window.storage.use("set", (ctx, next) => {
        ctx.value = "m_" + ctx.value;
        next();
      });
      window.storage.setSync("x", "y");
    });
    expect(await page.evaluate(() => window.storage.getSync("x"))).toBe("m_y");
    await page.evaluate(() => {
      window.storage.use("remove", (ctx, next) => {
        window.removed = ctx.key;
        next();
      });
      window.storage.removeSync("x");
    });
    expect(await page.evaluate(() => window.removed)).toBe("x");
    expect(await page.evaluate(() => window.storage.getSync("x"))).toBeNull();
  });

  test("커스텀 직렬화/역직렬화 동작", async ({ page }) => {
    await page.evaluate(() => {
      const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
      const b64d = (s) => decodeURIComponent(escape(atob(s)));
      window.storage = window.stosh({
        namespace: "enc",
        serialize: (data) => b64(JSON.stringify(data)),
        deserialize: (raw) => JSON.parse(b64d(raw)),
      });
      window.storage.setSync("foo", { a: 1 });
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toEqual({
      a: 1,
    });
    const raw = await page.evaluate(() =>
      window.localStorage.getItem("enc:foo")
    );
    expect(raw).not.toContain("{");
  });

  test("falsy 값 저장/조회/삭제", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "falsy" });
      const falsyValues = [undefined, null, "", 0, false];
      falsyValues.forEach((v, i) => {
        const key = "falsy_" + i;
        window.storage.setSync(key, v);
      });
    });
    for (let i = 0; i < 5; ++i) {
      const key = `falsy_${i}`;
      const v = await page.evaluate((key) => window.storage.getSync(key), key);
      if (i === 0) expect(v).toBeNull(); // undefined 저장 시 null 반환
      else expect([null, "", 0, false]).toContain(v);
      await page.evaluate((key) => window.storage.removeSync(key), key);
      expect(
        await page.evaluate((key) => window.storage.getSync(key), key)
      ).toBeNull();
    }
  });

  test("지원하지 않는 storage type 예외", async ({ page }) => {
    const error = await page.evaluate(() => {
      try {
        window.stosh({ type: "notype", namespace: "x" });
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).not.toBeNull();
  });

  test("onChange 콜백 동작 (storage 이벤트, 멀티탭)", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/e2e/build/public/index.html");
    await page2.goto("/e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.storage = window.stosh({ namespace: "chg" });
      window.changedKey = "";
      window.changedValue = null;
      window.storage.onChange((key, value) => {
        window.changedKey = key;
        window.changedValue = value;
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "chg" });
      window.storage.setSync("foo", 123);
    });
    // storage 이벤트는 비동기이므로 약간 대기
    await page1.waitForTimeout(100);
    expect(await page1.evaluate(() => window.changedKey)).toBe("foo");
    expect(
      await page1.evaluate(() => {
        const v = window.changedValue;
        return typeof v === "object" && v !== null && "v" in v ? v.v : v;
      })
    ).toBe(123);
    await page1.close();
    await page2.close();
  });

  test("getAll 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "all" });
      window.storage.setSync("a", 1);
      window.storage.setSync("b", 2);
    });
    expect(await page.evaluate(() => window.storage.getAllSync())).toEqual({
      a: 1,
      b: 2,
    });
  });

  test("쿠키 스토리지 set/get/remove 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "cookie", namespace: "cktest" });
      window.storage.setSync("foo", "bar");
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(
      "bar"
    );
    await page.evaluate(() => window.storage.removeSync("foo"));
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBeNull();
  });

  test("priority 옵션에 따라 local → session → cookie → memory 순으로 폴백", async ({
    page,
  }) => {
    // 실제 환경에서는 local/session/cookie가 모두 사용 가능하므로, memory 폴백은 강제 모킹이 필요함
    // 여기서는 우선순위 배열이 정상적으로 적용되는지만 확인
    await page.evaluate(() => {
      window.storage = window.stosh({
        priority: ["local", "session", "cookie", "memory"],
        namespace: "prio",
      });
      window.storage.setSync("foo", "bar");
    });
    expect(
      await page.evaluate(() => {
        const raw = window.localStorage.getItem("prio:foo");
        return raw ? JSON.parse(raw).v : null;
      })
    ).toBe("bar");
  });

  test("priority 옵션에 따라 sessionStorage 우선 사용", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({
        priority: ["session", "local", "cookie", "memory"],
        namespace: "prio2",
      });
      window.storage.setSync("foo", "bar");
    });
    expect(
      await page.evaluate(() => {
        const raw = window.sessionStorage.getItem("prio2:foo");
        return raw ? JSON.parse(raw).v : null;
      })
    ).toBe("bar");
  });

  test("localStorage 용량 초과 시 예외 발생", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "quota" });
    });
    let threw = false;
    try {
      await page.evaluate(() => {
        // 5MB 이상 채우기 시도 (브라우저마다 다름, 실제로는 quota에 따라 다름)
        let big = "x".repeat(1024 * 1024);
        for (let i = 0; i < 10; ++i) {
          window.storage.setSync("big" + i, big);
        }
      });
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("여러 탭에서 동시에 set/remove 시 onChange 콜백 일관성", async ({
    context,
  }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/e2e/build/public/index.html");
    await page2.goto("/e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.storage = window.stosh({ namespace: "multi" });
      window.changes = [];
      window.storage.onChange((key, value) => {
        window.changes.push({ key, value });
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "multi" });
      window.storage.setSync("foo", 1);
      window.storage.removeSync("foo");
    });
    await page1.waitForTimeout(100);
    const changes = await page1.evaluate(() => window.changes);
    expect(
      changes.some(
        (c) => c.key === "foo" && (c.value === 1 || c.value === null)
      )
    ).toBe(true);
    await page1.close();
    await page2.close();
  });

  test("StorageEvent의 key/newValue/oldValue 등 필드 검증", async ({
    context,
  }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/e2e/build/public/index.html");
    await page2.goto("/e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.eventInfo = null;
      window.addEventListener("storage", (e) => {
        window.eventInfo = {
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
        };
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "evt" });
      window.storage.setSync("foo", 123);
    });
    await page1.waitForTimeout(100);
    const info = await page1.evaluate(() => window.eventInfo);
    expect(info.key).toContain("evt:foo");
    expect(info.newValue).toContain("123");
    await page1.close();
    await page2.close();
  });

  test("idb 타입 비동기 동작 및 batch/만료/네임스페이스/미들웨어", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "idb", namespace: "idbtest" });
    });
    await page.evaluate(async () => {
      await window.storage.set("foo", 1);
      await window.storage.set("bar", 2, { expire: 10 });
      window.storage.use("set", (ctx, next) => {
        ctx.value = ctx.value + 1;
        next();
      });
      await window.storage.set("baz", 10);
      await window.storage.batchSet([
        { key: "a", value: 1 },
        { key: "b", value: 2 },
      ]);
    });
    expect(
      await page.evaluate(async () => await window.storage.get("foo"))
    ).toBe(1);
    expect(
      await page.evaluate(async () => await window.storage.get("baz"))
    ).toBe(11);
    // 미들웨어로 인해 실제 저장값이 [2, 3]이 됨
    expect(
      await page.evaluate(async () => await window.storage.batchGet(["a", "b"]))
    ).toEqual([2, 3]);
    await page.waitForTimeout(20);
    expect(
      await page.evaluate(async () => await window.storage.get("bar"))
    ).toBeNull();
  });

  test("쿠키 만료, path, 도메인 옵션, 용량 초과", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "cookie", namespace: "ckopt" });
    });
    const big = "x".repeat(4096);
    await page.evaluate((big) => {
      window.storage.setSync("big", big);
    }, big);
    const stored = await page.evaluate(() => window.storage.getSync("big"));
    expect(
      stored === null || (typeof stored === "string" && stored.length <= 4096)
    ).toBe(true);
    await page.evaluate(() => {
      window.storage.setSync("foo", "bar");
      // 만료 10ms
      window.storage.setSync("exp", "bye", { expire: 10 });
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(
      "bar"
    );
    await page.waitForTimeout(20);
    expect(await page.evaluate(() => window.storage.getSync("exp"))).toBeNull();
    // 용량 초과(쿠키는 4KB 제한, 실제로는 브라우저마다 다름, 예외 발생 여부 대신 실제 저장 결과로 검증)
    let overStored = null;
    try {
      await page.evaluate(() => {
        let big = "x".repeat(4096);
        for (let i = 0; i < 10; ++i) {
          window.storage.setSync("big" + i, big);
        }
      });
      overStored = await page.evaluate(() => window.storage.getSync("big0"));
    } catch (e) {
      overStored = null;
    }
    expect(
      overStored === null ||
        (typeof overStored === "string" && overStored.length <= 4096)
    ).toBe(true);
  });

  test("매우 긴 키/값, 특수문자, 이모지 등 저장/조회(브라우저 환경)", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "edgecase2" });
      const longKey = "k".repeat(1000);
      const longVal = "v".repeat(10000);
      const emojiKey = "😀키";
      const emojiVal = "값🚀";
      window.storage.setSync(longKey, longVal);
      window.storage.setSync(emojiKey, emojiVal);
      window.storage.setSync("특수!@#$%^&*()_+|", "!@#$%^&*()_+");
    });
    expect(
      await page.evaluate(() => window.storage.getSync("k".repeat(1000)))
    ).toBe("v".repeat(10000));
    expect(await page.evaluate(() => window.storage.getSync("😀키"))).toBe(
      "값🚀"
    );
    expect(
      await page.evaluate(() => window.storage.getSync("특수!@#$%^&*()_+|"))
    ).toBe("!@#$%^&*()_+");
  });

  test("batch API와 일반 API 혼합 사용 시 일관성", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "batchmix" });
      window.storage.setSync("a", 1);
      window.storage.setSync("b", 2);
      window.storage.batchSetSync([
        { key: "c", value: 3 },
        { key: "d", value: 4 },
      ]);
      window.storage.removeSync("a");
      window.storage.batchRemoveSync(["b", "c"]);
    });
    expect(await page.evaluate(() => window.storage.getSync("a"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("b"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("c"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("d"))).toBe(4);
  });

  test("StorageEvent oldValue/newValue 필드 정확성", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/e2e/build/public/index.html");
    await page2.goto("/e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.eventInfo = null;
      window.addEventListener("storage", (e) => {
        window.eventInfo = {
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
        };
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "evt2" });
      window.storage.setSync("foo", "bar1");
      window.storage.setSync("foo", "bar2");
      window.storage.removeSync("foo");
    });
    await page1.waitForTimeout(100);
    const info = await page1.evaluate(() => window.eventInfo);
    expect(info.key).toContain("evt2:foo");
    expect(info.oldValue).toContain("bar2");
    expect(info.newValue).toBeNull();
    await page1.close();
    await page2.close();
  });

  test("onChange 콜백 내에서 비동기 작업/예외 발생 시 전체 동작 영향 없음", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "chg-async" });
      window.flag = false;
      window.storage.onChange(async (key, value) => {
        await new Promise((r) => setTimeout(r, 10));
        window.flag = true;
        throw new Error("onChange error");
      });
    });
    await page.evaluate(() => window.storage.setSync("foo", 1));
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.flag)).toBe(true);
    // 예외가 발생해도 전체 동작에는 영향 없음
  });

  test("batchSet/batchRemove 중 일부 실패 시 일관성", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "batch-partial" });
      window.storage.setSync("ok", 1);
    });
    // 일부 키는 순환 참조 등으로 저장 실패
    const error = await page.evaluate(() => {
      try {
        const a = {};
        // @ts-ignore
        a.self = a;
        window.storage.batchSetSync([
          { key: "ok2", value: 2 },
          { key: "fail", value: a },
        ]);
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).not.toBeNull();
    // ok2는 정상 저장, fail은 저장 실패
    expect(await page.evaluate(() => window.storage.getSync("ok2"))).toBe(2);
    expect(
      await page.evaluate(() => window.storage.getSync("fail"))
    ).toBeNull();
  });

  test("여러 인스턴스에서 메모리 스토리지 데이터 격리", async ({ page }) => {
    await page.evaluate(() => {
      window.s1 = window.stosh({ type: "memory", namespace: "mem1" });
      window.s2 = window.stosh({ type: "memory", namespace: "mem2" });
      window.s1.setSync("foo", 1);
      window.s2.setSync("foo", 2);
    });
    expect(await page.evaluate(() => window.s1.getSync("foo"))).toBe(1);
    expect(await page.evaluate(() => window.s2.getSync("foo"))).toBe(2);
  });

  test("쿠키 path/domain 옵션 조합 분리 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.s1 = window.stosh({ type: "cookie", namespace: "ck1" });
      window.s2 = window.stosh({ type: "cookie", namespace: "ck2" });
      window.s1.setSync("foo", "bar", { path: "/" });
      window.s2.setSync("foo", "baz", { path: "/test" });
    });
    // 실제로는 같은 도메인/경로에서만 분리됨(브라우저 환경 따라 다름)
    // 최소한 둘 중 하나는 정상 조회되어야 함
    const v1 = await page.evaluate(() => window.s1.getSync("foo"));
    const v2 = await page.evaluate(() => window.s2.getSync("foo"));
    expect([v1, v2]).toContain("bar");
    expect([v1, v2]).toContain("baz");
  });

  test("동시성/경합 상황: 여러 탭에서 거의 동시에 set/remove 시 onChange 콜백 일관성", async ({
    context,
  }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/e2e/build/public/index.html");
    await page2.goto("/e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.storage = window.stosh({ namespace: "race" });
      window.changes = [];
      window.storage.onChange((key, value) => {
        window.changes.push({ key, value });
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "race" });
    });
    // 거의 동시에 여러 번 set/remove
    await Promise.all([
      page2.evaluate(() => window.storage.setSync("foo", 1)),
      page2.evaluate(() => window.storage.setSync("foo", 2)),
      page2.evaluate(() => window.storage.removeSync("foo")),
      page2.evaluate(() => window.storage.setSync("foo", 3)),
    ]);
    await page1.waitForTimeout(100);
    const changes = await page1.evaluate(() => window.changes);
    expect(changes.length).toBeGreaterThanOrEqual(2); // 최소 2번 이상 호출
    expect(changes.some((c) => c.key === "foo")).toBe(true);
    await page1.close();
    await page2.close();
  });

  test("IndexedDB 비동기 에러 처리: DB 오픈 실패 시 폴백 동작", async ({
    page,
  }) => {
    const isFallback = await page.evaluate(() => {
      window._origIndexedDB = window.indexedDB;
      // @ts-ignore
      window.indexedDB = undefined;
      let fallback = false;
      try {
        const s = window.stosh({ type: "idb", namespace: "idb-err" });
        fallback = s.isMemoryFallback;
        s.setSync("foo", 1);
      } catch {}
      // @ts-ignore
      window.indexedDB = window._origIndexedDB;
      return fallback;
    });
    expect(isFallback).toBe(true);
  });

  test("메모리 스토리지: 새로고침 후 데이터 소실 확인", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({
        type: "memory",
        namespace: "mem-reload",
      });
      window.storage.setSync("foo", 123);
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(123);
    // 새로고침
    await page.reload();
    await page.evaluate(() => {
      window.storage = window.stosh({
        type: "memory",
        namespace: "mem-reload",
      });
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBeNull();
  });
});
